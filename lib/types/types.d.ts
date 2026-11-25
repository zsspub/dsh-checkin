/** Browser-safe check-in requests and persisted result fields. */
import type { Branded } from '@deepseek-ai/dsh-brand';
/** Stable identity of a topic shared across sessions. */
export type TopicId = Branded<'CheckinTopicId'>;
/** A named daily habit; historical dates have no start-date restriction. */
export interface Topic {
    id: TopicId;
    name: string;
    createdAt: string;
    updatedAt: string;
}
/** Name used to create a topic. */
export interface CreateTopic {
    name: string;
}
/** Identity used to address one topic. */
export interface TopicRequest {
    id: TopicId;
}
/** Replacement topic name. */
export interface UpdateTopic extends TopicRequest {
    name: string;
}
/** Set an explicit status; an omitted date means today in Asia/Shanghai. */
export interface SetCheckin {
    topicId: TopicId;
    date?: string;
    completed: boolean;
}
/** Inclusive date range; omission of topicId selects all current topics. */
export interface QueryCheckins {
    from: string;
    to: string;
    topicId?: TopicId;
}
/** Calendar month in YYYY-MM form. */
export interface MonthRequest {
    month?: string;
}
/** A persisted completed day. */
export interface Completion {
    topicId: TopicId;
    date: string;
}
/** A completed day with persistence metadata included in a full backup. */
export interface BackupCompletion extends Completion {
    createdAt: string;
}
/** The actual status after an idempotent write. */
export interface CheckinResult {
    topic: Topic;
    date: string;
    completed: boolean;
}
/** Deletion also removes all completed days for this topic. */
export interface DeleteResult {
    topic: Topic;
    deletedRecords: number;
}
/** Sparse completions: absent topic/date pairs are incomplete, future dates are read-only. */
export interface QueryResult {
    today: string;
    timeZone: string;
    from: string;
    to: string;
    topics: Topic[];
    completions: Completion[];
}
/** One coherent month read, including deployment refresh policy. */
export interface MonthResult extends QueryResult {
    month: string;
    refreshIntervalMs: number;
}
/** Topic discovery and authoritative Host date. */
export interface TopicList {
    today: string;
    timeZone: string;
    topics: Topic[];
}
/** Supported statistics window presets. */
export type StatsPreset = '7d' | '30d' | '90d' | 'month' | 'all';
/** Current streak state relative to today in Asia/Shanghai. */
export type StreakStatus = 'done_today' | 'pending_today' | 'broken';
/** Heatmap cell granularity for the selected window. */
export type HeatmapGranularity = 'day' | 'month';
/** Request payload for Host-computed statistics. */
export interface StatsRequest {
    preset?: StatsPreset;
    month?: string;
    topicId?: TopicId;
    ifNoneMatch?: string;
}
/** Period-over-period comparison; null when no prior history exists or on all-time. */
export interface StatsComparison {
    from: string;
    to: string;
    elapsedDays: number;
    completedCheckins: number;
    possibleCheckins: number;
    completionRate: number | null;
    rateDeltaPp: number | null;
}
/** Top-level aggregate metrics scoped to the active window and topic selection. */
export interface StatsSummary {
    topicCount: number;
    todayDoneCount: number;
    todayTotalCount: number;
    elapsedDays: number | null;
    completedCheckins: number;
    possibleCheckins: number | null;
    completionRate: number | null;
    activeDays: number;
    perfectDays: number;
    longestStreak: number;
    longestStreakTopicId: TopicId | null;
    longestStreakTopicName: string | null;
    longestStreakFrom: string | null;
    longestStreakTo: string | null;
    firstCompletedDate: string | null;
    lastCompletedDate: string | null;
    comparison: StatsComparison | null;
}
/** Per-topic breakdown with full-history streaks and active-window counts. */
export interface TopicStat {
    topic: Topic;
    windowCount: number;
    windowRate: number | null;
    allTimeCount: number;
    completedToday: boolean;
    currentStreak: number;
    streakStatus: StreakStatus;
    longestStreak: number;
    longestStreakFrom: string | null;
    longestStreakTo: string | null;
    firstCompletedDate: string | null;
    lastCompletedDate: string | null;
}
/** One heatmap cell (day in 7d/30d/month/90d; month in all-time). */
export interface HeatmapCell {
    key: string;
    slot: number;
    completed: number;
    possible: number;
    level: number;
    future: boolean;
}
/** One adaptive trend point (capped at 10 points for narrow-pane readability). */
export interface TrendBucket {
    key: string;
    from: string;
    to: string;
    elapsedDays: number;
    completed: number;
    possible: number;
    rate: number;
}
/** Monday-first (0..6) weekday aggregation. */
export interface WeekdayStat {
    weekday: number;
    occurrences: number;
    completed: number;
    possible: number;
    rate: number | null;
}
/** Complete computed statistics snapshot. */
export interface StatsSnapshot {
    preset: StatsPreset;
    month: string | null;
    from: string;
    to: string;
    effectiveTo: string | null;
    topicId: TopicId | null;
    catalog: Topic[];
    summary: StatsSummary;
    topics: TopicStat[];
    heatmapGranularity: HeatmapGranularity;
    heatmap: HeatmapCell[];
    trend: TrendBucket[];
    weekdays: WeekdayStat[];
}
/** Wire response supporting O(1) unchanged polling hits. */
export interface StatsResult {
    today: string;
    timeZone: string;
    refreshIntervalMs: number;
    revision: string;
    unchanged: boolean;
    snapshot: StatsSnapshot | null;
}
/** Portable full-database backup. */
export interface CheckinBackup {
    format: 'dsh-checkin';
    version: 2;
    exportedAt: string;
    topics: Topic[];
    completions: BackupCompletion[];
}
/** Empty request used to export a backup through the generated Remote. */
export interface ExportDataRequest {
    unused?: undefined;
}
/** Browser-downloadable JSON backup. */
export interface ExportDataResult {
    filename: string;
    json: string;
}
/** JSON selected for validation and atomic incremental import. */
export interface ImportDataRequest {
    json: string;
}
/** Counts after a successful incremental import. */
export interface ImportDataResult {
    importedTopics: number;
    importedCompletions: number;
    skippedTopics: number;
}
/** Stable domain failure codes transported without exposing SQLite internals. */
export type CheckinErrorCode = 'checkin/invalid-date' | 'checkin/invalid-range' | 'checkin/invalid-name' | 'checkin/duplicate-name' | 'checkin/topic-not-found' | 'checkin/future-date' | 'checkin/invalid-config' | 'checkin/newer-schema' | 'checkin/invalid-backup' | 'checkin/backup-too-large' | 'checkin/import-conflict';
declare module '@deepseek-ai/dsh-typert-protocol' {
    interface RemoteErrorDetailsMap {
        'checkin/invalid-date': {
            readonly retryable?: boolean;
        };
        'checkin/invalid-range': {
            readonly retryable?: boolean;
        };
        'checkin/invalid-name': {
            readonly retryable?: boolean;
        };
        'checkin/duplicate-name': {
            readonly retryable?: boolean;
        };
        'checkin/topic-not-found': {
            readonly retryable?: boolean;
        };
        'checkin/future-date': {
            readonly retryable?: boolean;
        };
        'checkin/invalid-config': {
            readonly retryable?: boolean;
        };
        'checkin/newer-schema': {
            readonly retryable?: boolean;
        };
        'checkin/invalid-backup': {
            readonly retryable?: boolean;
        };
        'checkin/backup-too-large': {
            readonly retryable?: boolean;
        };
        'checkin/import-conflict': {
            readonly retryable?: boolean;
        };
    }
}
