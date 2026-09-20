/** Host service shared by model tools and the calendar Remote client. */
import type { Context } from '@deepseek-ai/cordis';
import Schema from '@deepseek-ai/schemastery';
import { TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol';
import type { CheckinResult, CreateTopic, DeleteResult, ExportDataRequest, ExportDataResult, ImportDataRequest, ImportDataResult, MonthRequest, MonthResult, QueryCheckins, QueryResult, SetCheckin, Topic, TopicList, TopicRequest, UpdateTopic } from './types.ts';
export type * from './types.ts';
/** Deployment-owned storage and refresh settings. */
export interface Config {
    databasePath: string;
    busyTimeoutMs: number;
    refreshIntervalMs: number;
}
declare module '@deepseek-ai/cordis' {
    interface Context {
        checkin: CheckinService;
    }
}
/** Global SQLite service; no session or workspace partitioning. */
export declare class CheckinService extends TypertRemoteService {
    private readonly config;
    static Config: Schema<Config>;
    private readonly store;
    /** @param ctx - Host context. @param config - Validated deployment settings. */
    constructor(ctx: Context, config: Config);
    /** @param signal - Request cancellation. @returns Catalog and Beijing date. */
    list(signal: AbortSignal): Promise<TopicList>;
    /** @param request - New name. @param signal - Cancellation. @returns Created topic. */
    create(request: CreateTopic, signal: AbortSignal): Promise<Topic>;
    /** @param request - Topic and new name. @param signal - Cancellation. @returns Updated topic. */
    update(request: UpdateTopic, signal: AbortSignal): Promise<Topic>;
    /** @param request - Topic to delete. @param signal - Cancellation. @returns Removed topic and count. */
    delete(request: TopicRequest, signal: AbortSignal): Promise<DeleteResult>;
    /** @param request - Desired completion status. @param signal - Cancellation. @returns Persisted status. */
    set(request: SetCheckin, signal: AbortSignal): Promise<CheckinResult>;
    /** @param request - Inclusive dates. @param signal - Cancellation. @returns Sparse completions. */
    query(request: QueryCheckins, signal: AbortSignal): Promise<QueryResult>;
    /** @param request - Month, defaulting to Beijing's current month. @param signal - Cancellation. @returns Calendar snapshot. */
    month(request: MonthRequest, signal: AbortSignal): Promise<MonthResult>;
    /** @param _request - Empty request. @param signal - Cancellation. @returns Portable JSON backup. */
    exportData(_request: ExportDataRequest, signal: AbortSignal): Promise<ExportDataResult>;
    /** @param request - Confirmed backup. @param signal - Cancellation. @returns Incremental import counts. */
    importData(request: ImportDataRequest, signal: AbortSignal): Promise<ImportDataResult>;
}
export default CheckinService;
