/** Host service shared by model tools and the calendar Remote client. */
import type { Context } from '@deepseek-ai/cordis'
import Schema from '@deepseek-ai/schemastery'
import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import { CheckinStore, monthRange } from './host/store.ts'
import type {
  CheckinResult, CreateTopic, DeleteResult, ExportDataRequest, ExportDataResult, ImportDataRequest, ImportDataResult,
  MonthRequest, MonthResult, QueryCheckins, QueryResult, SetCheckin, Topic, TopicList, TopicRequest, UpdateTopic,
} from './types.ts'
export type * from './types.ts'
/** Deployment-owned storage and refresh settings. */
export interface Config { databasePath: string; busyTimeoutMs: number; refreshIntervalMs: number }
declare module '@deepseek-ai/cordis' { interface Context { checkin: CheckinService } }
/** Global SQLite service; no session or workspace partitioning. */
export class CheckinService extends TypertRemoteService {
  static Config: Schema<Config> = Schema.object({
    databasePath: Schema.string().required(),
    busyTimeoutMs: Schema.number().step(1).min(1).default(5000),
    refreshIntervalMs: Schema.number().step(1).min(250).default(3000),
  })
  private readonly store: CheckinStore
  /** @param ctx - Host context. @param config - Validated deployment settings. */
  constructor(ctx: Context, private readonly config: Config) {
    super(ctx, 'checkin')
    this.store = new CheckinStore(config)
    ctx.effect(() => () => this.store.close(), 'checkin: close sqlite')
  }
  /** @param signal - Request cancellation. @returns Catalog and Beijing date. */
  @Remote
  async list(signal: AbortSignal): Promise<TopicList> { signal.throwIfAborted(); return this.store.list() }
  /** @param request - New name. @param signal - Cancellation. @returns Created topic. */
  @Remote
  async create(request: CreateTopic, signal: AbortSignal): Promise<Topic> { signal.throwIfAborted(); return this.store.create(request.name) }
  /** @param request - Topic and new name. @param signal - Cancellation. @returns Updated topic. */
  @Remote
  async update(request: UpdateTopic, signal: AbortSignal): Promise<Topic> { signal.throwIfAborted(); return this.store.update(request.id, request.name) }
  /** @param request - Topic to delete. @param signal - Cancellation. @returns Removed topic and count. */
  @Remote
  async delete(request: TopicRequest, signal: AbortSignal): Promise<DeleteResult> { signal.throwIfAborted(); return this.store.delete(request.id) }
  /** @param request - Desired completion status. @param signal - Cancellation. @returns Persisted status. */
  @Remote
  async set(request: SetCheckin, signal: AbortSignal): Promise<CheckinResult> { signal.throwIfAborted(); return this.store.set(request) }
  /** @param request - Inclusive dates. @param signal - Cancellation. @returns Sparse completions. */
  @Remote
  async query(request: QueryCheckins, signal: AbortSignal): Promise<QueryResult> { signal.throwIfAborted(); return this.store.query(request) }
  /** @param request - Month, defaulting to Beijing's current month. @param signal - Cancellation. @returns Calendar snapshot. */
  @Remote
  async month(request: MonthRequest, signal: AbortSignal): Promise<MonthResult> {
    signal.throwIfAborted()
    const month = request.month ?? this.store.list().today.slice(0, 7)
    return { ...this.store.query(monthRange(month)), month, refreshIntervalMs: this.config.refreshIntervalMs }
  }
  /** @param _request - Empty request. @param signal - Cancellation. @returns Portable JSON backup. */
  @Remote
  async exportData(_request: ExportDataRequest, signal: AbortSignal): Promise<ExportDataResult> {
    signal.throwIfAborted()
    return this.store.exportData()
  }
  /** @param request - Confirmed backup. @param signal - Cancellation. @returns Incremental import counts. */
  @Remote
  async importData(request: ImportDataRequest, signal: AbortSignal): Promise<ImportDataResult> {
    signal.throwIfAborted()
    return this.store.importData(request.json)
  }
}
export default CheckinService
