import type { CheckinResult, DeleteResult, ExportDataResult, ImportDataResult, QueryCheckins, QueryResult, SetCheckin, Topic, TopicId, TopicList } from '../types.ts';
/** Current SQLite schema; newer databases are refused without modification. */
export declare const SCHEMA_VERSION = 2;
/** Deployment choices resolved before opening a database. */
export interface StoreConfig {
    databasePath: string;
    busyTimeoutMs: number;
}
/** Calendar date in Beijing, independent of the machine's time zone.
 * @param now - Instant to project. @returns YYYY-MM-DD date.
 */
export declare function todayInBeijing(now?: Date): string;
/** Reject impossible or non-canonical dates at the request boundary.
 * @param date - Calendar date. @returns Validated date.
 */
export declare function validDate(date: string): string;
/** Resolve an inclusive month range without using the local machine time zone.
 * @param month - YYYY-MM month. @returns First and last calendar date.
 */
export declare function monthRange(month: string): {
    from: string;
    to: string;
};
/** One connection, prepared writes, and atomic catalog/record snapshots. */
export declare class CheckinStore {
    private readonly now;
    private readonly db;
    /** @param config - Absolute path and lock timeout. @param now - Clock used by date-sensitive operations. */
    constructor(config: StoreConfig, now?: () => Date);
    private transaction;
    private topic;
    /** Release the connection when the owning plugin unloads. */
    close(): void;
    /** @returns Current catalog and Beijing date. */
    list(): TopicList;
    /** @param rawName - User-entered name. @returns Created topic. */
    create(rawName: string): Topic;
    /** @param id - Existing topic. @param rawName - Replacement name. @returns Updated topic. */
    update(id: TopicId, rawName: string): Topic;
    /** @param id - Topic to permanently remove. @returns Removed topic and completion count. */
    delete(id: TopicId): DeleteResult;
    /** @param request - Explicit desired status. @returns Actual date, topic and status. */
    set(request: SetCheckin): CheckinResult;
    /** @param request - Inclusive date range. @returns Current topics and sparse completed days. */
    query(request: QueryCheckins): QueryResult;
    /** @returns Deterministic full backup and timestamped filename. */
    exportData(): ExportDataResult;
    /** Atomically add unseen topic IDs while preserving all existing local topics. */
    importData(json: string): ImportDataResult;
}
