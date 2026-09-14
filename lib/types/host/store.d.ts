import { type StoreConfig } from './database.ts';
import type { CheckinResult, DeleteResult, QueryCheckins, QueryResult, SetCheckin, Topic, TopicId, TopicList } from '../types.ts';
export type { StoreConfig } from './database.ts';
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
export declare class CheckinStore {
    private readonly now;
    private readonly database;
    private queue;
    constructor(config: StoreConfig, now?: () => Date);
    private serialize;
    private data;
    private topic;
    private record;
    private records;
    close(): void;
    list(signal?: AbortSignal): Promise<TopicList>;
    create(rawName: string, signal?: AbortSignal): Promise<Topic>;
    update(id: TopicId, rawName: string, signal?: AbortSignal): Promise<Topic>;
    delete(id: TopicId, signal?: AbortSignal): Promise<DeleteResult>;
    set(request: SetCheckin, signal?: AbortSignal): Promise<CheckinResult>;
    query(request: QueryCheckins, signal?: AbortSignal): Promise<QueryResult>;
}
