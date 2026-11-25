/** Pure UTC calendar arithmetic and statistics aggregation shared by Host and browser. */
import type { Completion, StatsPreset, StatsSnapshot, Topic, TopicId } from './types.ts';
/** Allowed window preset values for runtime validation. */
export declare const STATS_PRESETS: readonly StatsPreset[];
/** Type guard for runtime StatsPreset validation. */
export declare function isStatsPreset(value: unknown): value is StatsPreset;
/** Validate a canonical YYYY-MM-DD calendar date in 0001-01-01..9999-12-31. */
export declare function isValidDate(date: string): boolean;
/** Number of calendar days in a 1-indexed month, safe for years 0001..9999. */
export declare function daysInMonth(year: number, month: number): number;
/** Convert canonical YYYY-MM-DD to exact UTC epoch day without 2-digit year coercion. */
export declare function dateToEpochDay(date: string): number;
/** Convert UTC epoch day back to canonical YYYY-MM-DD (returns out-of-range markers for years <1 or >9999). */
export declare function epochDayToDate(epochDay: number): string;
/** Shift a canonical YYYY-MM-DD date by an integer number of days in UTC. */
export declare function shiftDate(date: string, days: number): string;
/** Shift a YYYY-MM calendar month by an integer number of months using pure integer math. */
export declare function shiftMonth(month: string, amount: number): string;
/** Compute inclusive start/end dates for a validated YYYY-MM month. */
export declare function monthBounds(month: string): {
    from: string;
    to: string;
};
/** Monday-first weekday index (0=Mon..6=Sun) from UTC epoch day (1970-01-01 is Thu=3). */
export declare function weekdayMon0(epochDay: number): number;
/** Input parameters for pure statistics aggregation. */
export interface ComputeStatsInput {
    today: string;
    topics: readonly Topic[];
    completions: readonly Completion[];
    preset: StatsPreset;
    month?: string;
    topicId?: TopicId;
}
/** Compute full check-in statistics for a Beijing calendar date without Node/DOM dependencies. */
export declare function computeCheckinStats(input: ComputeStatsInput): StatsSnapshot;
