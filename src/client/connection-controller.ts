import type { ConnectionState, ConnectRequest, DatabaseResources, InitializeRequest, LoginRequest } from '../types.ts'

export interface ConnectionApi {
  connection(signal: AbortSignal): Promise<ConnectionState>
  login(request: LoginRequest, signal: AbortSignal): Promise<ConnectionState>
  resources(signal: AbortSignal): Promise<DatabaseResources>
  connect(request: ConnectRequest, signal: AbortSignal): Promise<ConnectionState>
  initialize(request: InitializeRequest, signal: AbortSignal): Promise<ConnectionState>
  logout(signal: AbortSignal): Promise<ConnectionState>
}
export interface ConnectionSnapshot {
  connection: ConnectionState | null
  resources: DatabaseResources | null
  busy: boolean
  error: string | null
}
export function secureKeyTransport(location: Pick<Location, 'protocol' | 'hostname'>): boolean {
  return location.protocol === 'https:' || location.protocol === 'http:' &&
    (location.hostname === 'localhost' || location.hostname === '127.0.0.1' || location.hostname === '[::1]')
}
export class ConnectionController {
  private state: ConnectionSnapshot = { connection: null, resources: null, busy: false, error: null }
  private readonly listeners = new Set<() => void>()
  private readonly lifetime = new AbortController()
  private generation = 0
  constructor(private readonly api: ConnectionApi) {}
  getSnapshot = (): ConnectionSnapshot => this.state
  subscribe = (listener: () => void): (() => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener) } }
  private publish(patch: Partial<ConnectionSnapshot>): void {
    if (this.lifetime.signal.aborted) return
    this.state = { ...this.state, ...patch }
    for (const listener of this.listeners) listener()
  }
  async refresh(signal = this.lifetime.signal, clearError = false): Promise<ConnectionState | null> {
    const generation = this.generation
    const combined = AbortSignal.any([signal, this.lifetime.signal])
    try {
      const connection = await this.api.connection(combined)
      if (combined.aborted || generation !== this.generation) return null
      const changed = connection.revision !== this.state.connection?.revision
      this.publish({ connection, ...(changed ? { resources: null, error: null } : {}), ...(clearError ? { error: null } : {}) })
      return connection
    } catch (error) {
      if (!combined.aborted && generation === this.generation) this.publish({ connection: null, resources: null, error: String(error) })
      return null
    }
  }
  async loadResources(): Promise<void> {
    const generation = this.generation
    try {
      const resources = await this.api.resources(this.lifetime.signal)
      if (generation === this.generation) this.publish({ resources, error: null })
    } catch (error) { if (generation === this.generation) this.publish({ error: String(error) }) }
  }
  async run(operation: (api: ConnectionApi, signal: AbortSignal) => Promise<ConnectionState>): Promise<boolean> {
    if (this.state.busy || this.lifetime.signal.aborted) return false
    this.generation++
    this.publish({ busy: true, error: null })
    try {
      const connection = await operation(this.api, this.lifetime.signal)
      this.publish({ connection, resources: null, busy: false })
      if (connection.phase === 'setup') await this.loadResources()
      return true
    } catch (error) {
      const message = String(error)
      await this.refresh()
      if (this.state.connection?.phase === 'setup') await this.loadResources()
      this.publish({ busy: false, error: message })
      return false
    }
  }
  dispose(): void { this.lifetime.abort(); this.listeners.clear() }
}
