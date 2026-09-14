/** Host service shared by model tools and the calendar Remote client. */
import type { Context } from '@deepseek-ai/cordis'
import Schema from '@deepseek-ai/schemastery'
import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import { monthRange, todayInBeijing, type StoreConfig } from './host/store.ts'
import { CheckinConnection } from './host/connection.ts'
import type { ConnectionState, ConnectRequest, DatabaseResources, InitializeRequest, LoginRequest, CheckinResult, CreateTopic, DeleteResult, MonthRequest, MonthResult, QueryCheckins, QueryResult, SetCheckin, Topic, TopicList, TopicRequest, UpdateTopic } from './types.ts'
export type * from './types.ts'
/** Deployment-owned storage and refresh settings. */
export interface Config extends StoreConfig { refreshIntervalMs: number }
declare module '@deepseek-ai/cordis' { interface Context { checkin: CheckinService } }
export class CheckinService extends TypertRemoteService {
  static Config: Schema<Config> = Schema.object({
    apiKey: Schema.string().role('secret'),
    databaseId: Schema.string(),
    tableName: Schema.string().default('checkin_topics'),
    recordsTableName: Schema.string().default('checkin_records'),
    requestTimeoutMs: Schema.number().step(1).min(1).default(15000),
    refreshIntervalMs: Schema.number().step(1).min(1000).default(30000),
  })
  private readonly storage: CheckinConnection
  /** @param ctx - Host context. @param config - Validated deployment settings. */
  constructor(ctx: Context, private readonly config: Config) {
    super(ctx, 'checkin')
    this.storage = new CheckinConnection(ctx, config)
    ctx.effect(() => () => this.storage.close(), 'checkin: cancel database requests')
  }
  @Remote
  async connection(signal: AbortSignal): Promise<ConnectionState> { return this.storage.connection(signal) }
  @Remote
  async login(request: LoginRequest, signal: AbortSignal): Promise<ConnectionState> { return this.storage.login(request.apiKey, signal) }
  @Remote
  async resources(signal: AbortSignal): Promise<DatabaseResources> { return this.storage.resources(signal) }
  @Remote
  async connect(request: ConnectRequest, signal: AbortSignal): Promise<ConnectionState> { return this.storage.connect(request, signal) }
  @Remote
  async initialize(request: InitializeRequest, signal: AbortSignal): Promise<ConnectionState> { return this.storage.initialize(request, signal) }
  @Remote
  async logout(signal: AbortSignal): Promise<ConnectionState> { return this.storage.logout(signal) }
  /** @param signal - Request cancellation. @returns Catalog and Beijing date. */
  @Remote
  async list(signal: AbortSignal): Promise<TopicList> { return this.storage.use(signal, (store, current) => store.list(current)) }
  /** @param request - New name. @param signal - Cancellation. @returns Created topic. */
  @Remote
  async create(request: CreateTopic, signal: AbortSignal): Promise<Topic> { return this.storage.use(signal, (store, current) => store.create(request.name, current)) }
  /** @param request - Topic and new name. @param signal - Cancellation. @returns Updated topic. */
  @Remote
  async update(request: UpdateTopic, signal: AbortSignal): Promise<Topic> { return this.storage.use(signal, (store, current) => store.update(request.id, request.name, current)) }
  /** @param request - Topic to delete. @param signal - Cancellation. @returns Removed topic and count. */
  @Remote
  async delete(request: TopicRequest, signal: AbortSignal): Promise<DeleteResult> { return this.storage.use(signal, (store, current) => store.delete(request.id, current)) }
  /** @param request - Desired completion status. @param signal - Cancellation. @returns Persisted status. */
  @Remote
  async set(request: SetCheckin, signal: AbortSignal): Promise<CheckinResult> { return this.storage.use(signal, (store, current) => store.set(request, current)) }
  /** @param request - Inclusive dates. @param signal - Cancellation. @returns Sparse completions. */
  @Remote
  async query(request: QueryCheckins, signal: AbortSignal): Promise<QueryResult> { return this.storage.use(signal, (store, current) => store.query(request, current)) }
  /** @param request - Month, defaulting to Beijing's current month. @param signal - Cancellation. @returns Calendar snapshot. */
  @Remote
  async month(request: MonthRequest, signal: AbortSignal): Promise<MonthResult> {
    signal.throwIfAborted()
    const month = request.month ?? todayInBeijing().slice(0, 7)
    return { ...await this.storage.use(signal, (store, current) => store.query(monthRange(month), current)), month, refreshIntervalMs: this.config.refreshIntervalMs }
  }
}
export default CheckinService
