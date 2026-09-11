/** Right-tab state and latest-request-wins reads, independent of React and transport. */
import type { CreateTopic, MonthRequest, MonthResult, SetCheckin, TopicRequest, UpdateTopic } from '../types.ts'
/** Typed Host methods used by the right-tab UI. */
export interface CheckinApi {
  month(request: MonthRequest, signal: AbortSignal): Promise<MonthResult>
  create(request: CreateTopic, signal: AbortSignal): Promise<unknown>
  update(request: UpdateTopic, signal: AbortSignal): Promise<unknown>
  delete(request: TopicRequest, signal: AbortSignal): Promise<unknown>
  set(request: SetCheckin, signal: AbortSignal): Promise<unknown>
}
/** Stable external-store snapshot. */
export interface Snapshot { month: string | undefined; data: MonthResult | null; loading: boolean; busy: boolean; error: string | null }
/** Owns in-flight reads and UI writes; disposing cancels all requests. */
export class CheckinController {
  private state: Snapshot = { month: undefined, data: null, loading: false, busy: false, error: null }
  private readonly listeners = new Set<() => void>()
  private reader: AbortController | undefined
  private writer: AbortController | undefined
  private disposed = false
  /** @param api - Generated Remote adapter. */
  constructor(private readonly api: CheckinApi) {}
  /** @returns Immutable snapshot for React. */
  getSnapshot = (): Snapshot => this.state
  /** @param listener - Snapshot observer. @returns Disposer. */
  subscribe = (listener: () => void): (() => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener) } }
  private publish(patch: Partial<Snapshot>): void {
    if (this.disposed) return
    this.state = { ...this.state, ...patch }
    for (const listener of this.listeners) listener()
  }
  /** Cancel the current read while preserving selection and loaded data. */
  cancelRead(): void { this.reader?.abort(); this.publish({ loading: false }) }
  /** @param month - Selected month; undefined requests the current Host month. */
  selectMonth(month?: string): void { this.publish({ month, data: null }); void this.refresh() }
  /** @param silent - Keep visible data/errors during background polling. */
  async refresh(silent = false): Promise<void> {
    if (this.disposed || this.state.busy) return
    this.reader?.abort()
    const reader = new AbortController()
    this.reader = reader
    this.publish({ loading: this.state.data === null, ...(!silent ? { error: null } : {}) })
    try {
      const data = await this.api.month(this.state.month === undefined ? {} : { month: this.state.month }, reader.signal)
      if (reader.signal.aborted || this.disposed) return
      this.publish({ data, month: data.month, loading: false })
    } catch (error) {
      if (!reader.signal.aborted) this.publish({ loading: false, error: String(error) })
    }
  }
  /** @param operation - One write sharing the UI controller's cancellation scope. @returns Whether the write succeeded. */
  async mutate(operation: (api: CheckinApi, signal: AbortSignal) => Promise<unknown>): Promise<boolean> {
    if (this.state.busy || this.disposed) return false
    this.reader?.abort()
    const writer = new AbortController()
    this.writer = writer
    this.publish({ busy: true, error: null })
    try {
      await operation(this.api, writer.signal)
      if (writer.signal.aborted) return false
      this.publish({ busy: false })
      await this.refresh()
      return true
    } catch (error) {
      if (!writer.signal.aborted) this.publish({ busy: false, error: String(error) })
      return false
    }
  }
  /** Stop all requests and observers on plugin unload. */
  dispose(): void { this.disposed = true; this.reader?.abort(); this.writer?.abort(); this.listeners.clear() }
}
