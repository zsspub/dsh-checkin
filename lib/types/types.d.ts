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
/** Stable domain failure codes transported without exposing SQLite internals. */
export type CheckinErrorCode = 'checkin/invalid-date' | 'checkin/invalid-range' | 'checkin/invalid-name' | 'checkin/duplicate-name' | 'checkin/topic-not-found' | 'checkin/future-date' | 'checkin/invalid-config' | 'checkin/newer-schema';
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
    }
}
