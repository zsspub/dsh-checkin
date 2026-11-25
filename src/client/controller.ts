/** Right-tab state and latest-request-wins reads, independent of React and transport. */
import type {
  CreateTopic, ExportDataRequest, ExportDataResult, ImportDataRequest, ImportDataResult, MonthRequest,
  MonthResult, SetCheckin, StatsPreset, StatsRequest, StatsResult, StatsSnapshot, TopicId, TopicRequest, UpdateTopic,
} from '../types.ts'

/** Active right-tab view. */
export type PanelView = 'calendar' | 'stats'

/** Typed Host methods used by the right-tab UI. */
export interface CheckinApi {
  month(request: MonthRequest, signal: AbortSignal): Promise<MonthResult>
  stats(request: StatsRequest, signal: AbortSignal): Promise<StatsResult>
  create(request: CreateTopic, signal: AbortSignal): Promise<unknown>
  update(request: UpdateTopic, signal: AbortSignal): Promise<unknown>
  delete(request: TopicRequest, signal: AbortSignal): Promise<unknown>
  set(request: SetCheckin, signal: AbortSignal): Promise<unknown>
  exportData(request: ExportDataRequest, signal: AbortSignal): Promise<ExportDataResult>
  importData(request: ImportDataRequest, signal: AbortSignal): Promise<ImportDataResult>
}

/** Stable external-store snapshot shared by calendar and statistics views. */
export interface Snapshot {
  view: PanelView
  topicId: TopicId | ''
  month: string | undefined
  data: MonthResult | null
  loading: boolean
  busy: boolean
  error: string | null
  statsPreset: StatsPreset
  statsMonth: string | undefined
  stats: StatsSnapshot | null
  statsToday: string | null
  statsRefreshIntervalMs: number
  statsRevision: string | null
  statsLoading: boolean
  statsRefreshing: boolean
  statsError: string | null
  statsNotice: 'topicDeleted' | null
  statsStale: boolean
}

/** Owns in-flight reads and UI writes; disposing cancels all requests. */
export class CheckinController {
  private state: Snapshot = {
    view: 'calendar',
    topicId: '',
    month: undefined,
    data: null,
    loading: false,
    busy: false,
    error: null,
    statsPreset: '30d',
    statsMonth: undefined,
    stats: null,
    statsToday: null,
    statsRefreshIntervalMs: 3000,
    statsRevision: null,
    statsLoading: false,
    statsRefreshing: false,
    statsError: null,
    statsNotice: null,
    statsStale: true,
  }
  private readonly listeners = new Set<() => void>()
  private reader: AbortController | undefined
  private statsReader: AbortController | undefined
  private writer: AbortController | undefined
  private calendarStale = false
  private disposed = false

  /** @param api - Generated Remote adapter. */
  constructor(private readonly api: CheckinApi) {}

  /** @returns Immutable snapshot for React. */
  getSnapshot = (): Snapshot => this.state

  /** @param listener - Snapshot observer. @returns Disposer. */
  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }

  private publish(patch: Partial<Snapshot>): void {
    if (this.disposed) return
    this.state = { ...this.state, ...patch }
    for (const listener of this.listeners) listener()
  }

  /** Cancel in-flight reads for both views while preserving loaded data. */
  cancelRead(): void {
    this.reader?.abort()
    this.statsReader?.abort()
    this.publish({ loading: false, statsLoading: false, statsRefreshing: false })
  }

  /** Clear active error banners after dismissal. */
  clearError(): void {
    this.publish({ error: null, statsError: null })
  }

  /** Dismiss the deleted-topic auto-recovery notice. */
  clearStatsNotice(): void {
    this.publish({ statsNotice: null })
  }

  /** Switch between calendar and statistics while preserving shared topic context. */
  setView(view: PanelView): void {
    if (this.disposed || this.state.view === view) return
    if (view === 'stats') {
      this.reader?.abort()
      this.publish({ view, loading: false })
      if (this.state.stats === null || this.state.statsStale) {
        void this.refreshStats(this.state.stats !== null)
      }
    } else {
      this.statsReader?.abort()
      this.publish({ view, statsLoading: false, statsRefreshing: false })
      if (this.state.data === null || this.calendarStale) {
        void this.refresh(this.state.data !== null)
      }
    }
  }

  /** Update the shared topic filter across calendar and statistics views. */
  setTopicId(topicId: TopicId | ''): void {
    if (this.disposed || this.state.topicId === topicId) return
    this.publish({ topicId, statsRevision: null, statsNotice: null, statsStale: true })
    if (this.state.view === 'stats') void this.refreshStats(false)
  }

  /** Change the statistics time range preset (and optional YYYY-MM when preset is 'month'). */
  setStatsFilter(preset: StatsPreset, month?: string): void {
    if (this.disposed) return
    const statsMonth = preset === 'month'
      ? (month ?? this.state.statsMonth ?? this.state.statsToday?.slice(0, 7) ?? this.state.data?.today.slice(0, 7))
      : undefined
    this.publish({ statsPreset: preset, statsMonth, statsRevision: null, statsNotice: null, statsStale: true })
    if (this.state.view === 'stats') void this.refreshStats(false)
  }

  /** Drill down from statistics into the calendar tab, optionally switching month and topic. */
  openCalendar(options?: { month?: string; topicId?: TopicId | '' }): void {
    if (this.disposed) return
    this.statsReader?.abort()
    const nextTopic = options?.topicId !== undefined ? options.topicId : this.state.topicId
    const topicChanged = nextTopic !== this.state.topicId
    const targetMonth = options?.month
    const monthChanged = targetMonth !== undefined && targetMonth !== this.state.data?.month
    this.publish({
      view: 'calendar',
      topicId: nextTopic,
      statsLoading: false,
      statsRefreshing: false,
      ...(topicChanged ? { statsRevision: null, statsNotice: null, statsStale: true } : {}),
      ...(monthChanged ? { month: targetMonth, data: null } : {}),
    })
    if (monthChanged || this.state.data === null || this.calendarStale) {
      void this.refresh(this.state.data !== null && !monthChanged)
    }
  }

  /** @param month - Selected month; undefined requests the current Host month. */
  selectMonth(month?: string): void {
    this.publish({ month, data: null })
    void this.refresh()
  }

  /** @param silent - Keep visible data/errors during background polling. */
  async refresh(silent = false): Promise<void> {
    if (this.disposed || this.state.busy) return
    this.reader?.abort()
    const reader = new AbortController()
    this.reader = reader
    this.publish({ loading: this.state.data === null, ...(!silent ? { error: null } : {}) })
    try {
      const data = await this.api.month(this.state.month === undefined ? {} : { month: this.state.month }, reader.signal)
      if (this.reader !== reader || reader.signal.aborted || this.disposed) return
      this.calendarStale = false
      const validTopic = this.state.topicId === '' || data.topics.some(topic => topic.id === this.state.topicId)
      this.publish({
        data,
        month: data.month,
        loading: false,
        statsRefreshIntervalMs: data.refreshIntervalMs,
        ...(!validTopic ? { topicId: '', statsRevision: null, statsStale: true } : {}),
      })
    } catch (error) {
      if (this.reader === reader && !reader.signal.aborted) {
        this.publish({ loading: false, error: String(error) })
      }
    }
  }

  /** Fetch or conditionally revalidate statistics using the Host's O(1) revision watermark. */
  async refreshStats(silent = false): Promise<void> {
    if (this.disposed || this.state.busy) return
    this.statsReader?.abort()
    const statsReader = new AbortController()
    this.statsReader = statsReader
    const hasData = this.state.stats !== null
    this.publish({
      statsLoading: !hasData,
      statsRefreshing: !silent && hasData,
      ...(!silent ? { statsError: null } : {}),
    })
    const request: StatsRequest = {
      preset: this.state.statsPreset,
      ...(this.state.statsPreset === 'month' && this.state.statsMonth !== undefined ? { month: this.state.statsMonth } : {}),
      ...(this.state.topicId !== '' ? { topicId: this.state.topicId } : {}),
      ...(silent && this.state.statsRevision !== null ? { ifNoneMatch: this.state.statsRevision } : {}),
    }
    try {
      const result = await this.api.stats(request, statsReader.signal)
      if (this.statsReader !== statsReader || statsReader.signal.aborted || this.disposed) return
      if (result.unchanged) {
        this.publish({
          statsToday: result.today,
          statsRefreshIntervalMs: result.refreshIntervalMs,
          statsRevision: result.revision,
          statsLoading: false,
          statsRefreshing: false,
          statsError: null,
          statsStale: false,
        })
        return
      }
      const snapshot = result.snapshot
      this.publish({
        ...(snapshot !== null ? { stats: snapshot, statsMonth: snapshot.month ?? this.state.statsMonth } : {}),
        statsToday: result.today,
        statsRefreshIntervalMs: result.refreshIntervalMs,
        statsRevision: result.revision,
        statsLoading: false,
        statsRefreshing: false,
        statsError: null,
        statsStale: false,
      })
    } catch (error) {
      if (this.statsReader !== statsReader || statsReader.signal.aborted || this.disposed) return
      if (String(error).includes('topic-not-found') && this.state.topicId !== '') {
        this.publish({
          topicId: '',
          statsRevision: null,
          statsLoading: false,
          statsRefreshing: false,
          statsError: null,
          statsNotice: 'topicDeleted',
          statsStale: true,
        })
        await this.refreshStats(false)
        return
      }
      this.publish({ statsLoading: false, statsRefreshing: false, statsError: String(error) })
    }
  }

  /** @param operation - One write sharing the UI controller's cancellation scope. @returns Whether the write succeeded. */
  async mutate(operation: (api: CheckinApi, signal: AbortSignal) => Promise<unknown>): Promise<boolean> {
    if (this.state.busy || this.disposed) return false
    this.reader?.abort()
    this.statsReader?.abort()
    const writer = new AbortController()
    this.writer = writer
    this.publish({ busy: true, error: null })
    try {
      await operation(this.api, writer.signal)
      if (writer.signal.aborted || this.disposed) return false
      this.publish({ busy: false, statsRevision: null, statsStale: true })
      if (this.state.view === 'stats') {
        this.calendarStale = true
        await this.refreshStats(true)
      } else {
        await this.refresh()
      }
      return true
    } catch (error) {
      if (!writer.signal.aborted) this.publish({ busy: false, error: String(error) })
      return false
    }
  }

  /** Export without changing the current calendar snapshot. */
  async exportData(): Promise<ExportDataResult | null> {
    if (this.state.busy || this.disposed) return null
    const writer = new AbortController()
    this.writer = writer
    this.publish({ busy: true, error: null })
    try {
      const result = await this.api.exportData({}, writer.signal)
      if (writer.signal.aborted || this.disposed) return null
      this.publish({ busy: false })
      return result
    } catch (error) {
      if (!writer.signal.aborted) this.publish({ busy: false, error: String(error) })
      return null
    }
  }

  /** Import a validated backup and refresh the active view. */
  async importData(request: ImportDataRequest): Promise<ImportDataResult | null> {
    if (this.state.busy || this.disposed) return null
    this.reader?.abort()
    this.statsReader?.abort()
    const writer = new AbortController()
    this.writer = writer
    this.publish({ busy: true, error: null })
    try {
      const result = await this.api.importData(request, writer.signal)
      if (writer.signal.aborted || this.disposed) return null
      this.publish({ busy: false, statsRevision: null, statsStale: true })
      if (this.state.view === 'stats') {
        this.calendarStale = true
        await this.refreshStats(true)
      } else {
        await this.refresh()
      }
      return result
    } catch (error) {
      if (!writer.signal.aborted) this.publish({ busy: false, error: String(error) })
      return null
    }
  }

  /** Stop all requests and observers on plugin unload. */
  dispose(): void {
    this.disposed = true
    this.reader?.abort()
    this.statsReader?.abort()
    this.writer?.abort()
    this.listeners.clear()
  }
}
