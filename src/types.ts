/** Browser-safe check-in requests and persisted result fields. */
import type { Branded } from '@deepseek-ai/dsh-brand'
/** Stable identity of a topic shared across sessions. */
export type TopicId = Branded<'CheckinTopicId'>
/** A named daily habit; historical dates have no start-date restriction. */
export interface Topic { id: TopicId; name: string; createdAt: string; updatedAt: string }
/** Name used to create a topic. */
export interface CreateTopic { name: string }
/** Identity used to address one topic. */
export interface TopicRequest { id: TopicId }
/** Replacement topic name. */
export interface UpdateTopic extends TopicRequest { name: string }
/** Set an explicit status; an omitted date means today in Asia/Shanghai. */
export interface SetCheckin { topicId: TopicId; date?: string; completed: boolean }
/** Inclusive date range; omission of topicId selects all current topics. */
export interface QueryCheckins { from: string; to: string; topicId?: TopicId }
/** Calendar month in YYYY-MM form. */
export interface MonthRequest { month?: string }
/** A persisted completed day. */
export interface Completion { topicId: TopicId; date: string }
/** The actual status after an idempotent write. */
export interface CheckinResult { topic: Topic; date: string; completed: boolean }
/** Deletion also removes all completed days for this topic. */
export interface DeleteResult { topic: Topic; deletedRecords: number }
/** Sparse completions: absent topic/date pairs are incomplete, future dates are read-only. */
export interface QueryResult { today: string; timeZone: string; from: string; to: string; topics: Topic[]; completions: Completion[] }
/** Month read including deployment refresh policy. */
export interface MonthResult extends QueryResult { month: string; refreshIntervalMs: number }
/** Topic discovery and authoritative Host date. */
export interface TopicList { today: string; timeZone: string; topics: Topic[] }

export interface ConnectionState {
  phase: 'login' | 'setup' | 'connected' | 'invalid'
  source: 'host' | 'saved' | 'none'
  revision: string
  writable: boolean
  databaseId?: string
  tableName?: string
  recordsTableName?: string
  pendingDatabaseName?: string
}
export interface DatabaseResources {
  enabled: boolean
  limits: { maxDatabases: number; maxTables: number; maxBytes: number }
  databases: { id: string; name: string; status: 'ready' | 'provisioning' | 'deleting'; usedBytes: number; tables: { name: string }[] }[]
}
export interface LoginRequest { apiKey: string }
export interface ConnectRequest { databaseId: string; tableName: string; recordsTableName: string }
export interface InitializeRequest {
  databaseId?: string
  databaseName?: string
  tableName: string
  recordsTableName: string
  useExistingTopics?: boolean
  useExistingRecords?: boolean
  confirmed: boolean
}

export type CheckinErrorCode = 'checkin/invalid-date' | 'checkin/invalid-range' | 'checkin/invalid-name' | 'checkin/duplicate-name' | 'checkin/topic-not-found' | 'checkin/future-date' | 'checkin/invalid-config'
  | 'checkin/credentials-unavailable' | 'checkin/managed-connection' | 'checkin/confirmation-required' | 'checkin/connection-changed'
  | 'checkin/unauthorized' | 'checkin/database-conflict' | 'checkin/quota-exceeded' | 'checkin/rate-limited'
  | 'checkin/service-unavailable' | 'checkin/write-uncertain' | 'checkin/invalid-response' | 'checkin/invalid-data'
  | 'checkin/service-disabled' | 'checkin/database-not-found' | 'checkin/database-not-ready' | 'checkin/table-not-found' | 'checkin/inconsistent-read'
  | 'checkin/invalid-schema' | 'checkin/query-rejected' | 'checkin/api-unavailable' | 'checkin/request-too-large' | 'checkin/concurrent-change'
declare module '@deepseek-ai/dsh-typert-protocol' {
  interface RemoteErrorDetailsMap {
    'checkin/credentials-unavailable': { readonly retryable?: boolean }
    'checkin/managed-connection': { readonly retryable?: boolean }
    'checkin/confirmation-required': { readonly retryable?: boolean }
    'checkin/connection-changed': { readonly retryable?: boolean }
    'checkin/invalid-date': { readonly retryable?: boolean }
    'checkin/invalid-range': { readonly retryable?: boolean }
    'checkin/invalid-name': { readonly retryable?: boolean }
    'checkin/duplicate-name': { readonly retryable?: boolean }
    'checkin/topic-not-found': { readonly retryable?: boolean }
    'checkin/future-date': { readonly retryable?: boolean }
    'checkin/invalid-config': { readonly retryable?: boolean }
    'checkin/unauthorized': { readonly retryable?: boolean }
    'checkin/database-conflict': { readonly retryable?: boolean }
    'checkin/quota-exceeded': { readonly retryable?: boolean }
    'checkin/rate-limited': { readonly retryable?: boolean }
    'checkin/service-unavailable': { readonly retryable?: boolean }
    'checkin/write-uncertain': { readonly retryable?: boolean }
    'checkin/invalid-response': { readonly retryable?: boolean }
    'checkin/invalid-data': { readonly retryable?: boolean }
    'checkin/service-disabled': { readonly retryable?: boolean }
    'checkin/database-not-found': { readonly retryable?: boolean }
    'checkin/database-not-ready': { readonly retryable?: boolean }
    'checkin/table-not-found': { readonly retryable?: boolean }
    'checkin/inconsistent-read': { readonly retryable?: boolean }
    'checkin/invalid-schema': { readonly retryable?: boolean }
    'checkin/query-rejected': { readonly retryable?: boolean }
    'checkin/api-unavailable': { readonly retryable?: boolean }
    'checkin/request-too-large': { readonly retryable?: boolean }
    'checkin/concurrent-change': { readonly retryable?: boolean }
  }
}
