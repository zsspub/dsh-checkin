/** SQLite owns the global topic catalog, sparse daily completions and portable backups. */
import { randomUUID } from 'node:crypto'
import { chmodSync, mkdirSync } from 'node:fs'
import { dirname, isAbsolute } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { RemoteError } from '@deepseek-ai/dsh-typert-protocol'
import { assertBackupSize, parseCheckinBackup } from '../backup.ts'
import type { CheckinErrorCode } from '../types.ts'
function failure(code: CheckinErrorCode): RemoteError<CheckinErrorCode> { return new RemoteError(code, code, {}) }
import type {
  BackupCompletion, CheckinBackup, CheckinResult, Completion, DeleteResult, ExportDataResult, ImportDataResult,
  QueryCheckins, QueryResult, SetCheckin, Topic, TopicId, TopicList,
} from '../types.ts'

/** Current SQLite schema; newer databases are refused without modification. */
export const SCHEMA_VERSION = 2
/** Deployment choices resolved before opening a database. */
export interface StoreConfig { databasePath: string; busyTimeoutMs: number }
/** Calendar date in Beijing, independent of the machine's time zone.
 * @param now - Instant to project. @returns YYYY-MM-DD date.
 */
export function todayInBeijing(now = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now)
}
/** Reject impossible or non-canonical dates at the request boundary.
 * @param date - Calendar date. @returns Validated date.
 */
export function validDate(date: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(date) || date < '0001-01-01' || !Number.isFinite(Date.parse(`${date}T00:00:00Z`)) || new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10) !== date) throw failure('checkin/invalid-date')
  return date
}
/** Resolve an inclusive month range without using the local machine time zone.
 * @param month - YYYY-MM month. @returns First and last calendar date.
 */
export function monthRange(month: string): { from: string; to: string } {
  const from = validDate(`${month}-01`)
  const end = new Date(`${from}T00:00:00Z`)
  end.setUTCMonth(end.getUTCMonth() + 1, 0)
  return { from, to: end.toISOString().slice(0, 10) }
}
function validName(value: string): string {
  const name = value.trim()
  if (!name || name.length > 200) throw failure('checkin/invalid-name')
  return name
}
function parseBackup(json: string, today: string): CheckinBackup {
  try { return parseCheckinBackup(json, today) }
  catch (error) {
    if (error instanceof Error && error.message === 'checkin/backup-too-large') throw failure('checkin/backup-too-large')
    throw failure('checkin/invalid-backup')
  }
}
function sqliteText(value: unknown): string {
  if (typeof value !== 'string') throw failure('checkin/invalid-config')
  return value
}
function createSchema(db: DatabaseSync): void {
  db.exec(`CREATE TABLE checkin_topics (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      revision TEXT NOT NULL
    );
    CREATE TABLE checkin_records (
      topic_id TEXT NOT NULL REFERENCES checkin_topics(id) ON DELETE CASCADE,
      date TEXT NOT NULL,
      created_at TEXT NOT NULL,
      revision TEXT NOT NULL,
      PRIMARY KEY(topic_id, date)
    );
    CREATE INDEX checkin_records_by_date ON checkin_records(date, topic_id);
    PRAGMA user_version = ${SCHEMA_VERSION};`)
}
/** One connection, prepared writes, and atomic catalog/record snapshots. */
export class CheckinStore {
  private readonly db: DatabaseSync
  /** @param config - Absolute path and lock timeout. @param now - Clock used by date-sensitive operations. */
  constructor(config: StoreConfig, private readonly now: () => Date = () => new Date()) {
    if (!isAbsolute(config.databasePath) || !Number.isSafeInteger(config.busyTimeoutMs) || config.busyTimeoutMs < 1) throw failure('checkin/invalid-config')
    mkdirSync(dirname(config.databasePath), { recursive: true, mode: 0o700 })
    this.db = new DatabaseSync(config.databasePath)
    try {
      chmodSync(config.databasePath, 0o600)
      const version = this.db.prepare('PRAGMA user_version').get()?.user_version
      if (typeof version !== 'number' || version > SCHEMA_VERSION) throw failure('checkin/newer-schema')
      this.db.exec(`PRAGMA busy_timeout = ${config.busyTimeoutMs}; PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL;`)
      if (version === 0) this.transaction(() => {
        createSchema(this.db)
      })
      if (version === 1) this.transaction(() => {
        const topics = this.db.prepare('SELECT id,name,createdAt,updatedAt FROM topics ORDER BY createdAt,id').all()
        const completions = this.db.prepare('SELECT topicId,date FROM completions ORDER BY date,topicId').all()
        createSchema(this.db)
        const insertTopic = this.db.prepare('INSERT INTO checkin_topics(id,name,created_at,updated_at,revision) VALUES(?,?,?,?,?)')
        const insertRecord = this.db.prepare('INSERT INTO checkin_records(topic_id,date,created_at,revision) VALUES(?,?,?,?)')
        for (const topic of topics) insertTopic.run(
          sqliteText(topic.id), sqliteText(topic.name), sqliteText(topic.createdAt), sqliteText(topic.updatedAt), randomUUID(),
        )
        const migratedAt = this.now().toISOString()
        for (const completion of completions) insertRecord.run(
          sqliteText(completion.topicId), sqliteText(completion.date), migratedAt, randomUUID(),
        )
        this.db.exec('DROP TABLE completions; DROP TABLE topics;')
      })
    } catch (error) { this.db.close(); throw error }
  }
  private transaction<T>(run: () => T): T {
    this.db.exec('BEGIN IMMEDIATE')
    try { const result = run(); this.db.exec('COMMIT'); return result }
    catch (error) { this.db.exec('ROLLBACK'); throw error }
  }
  private topic(id: TopicId): Topic {
    const row = this.db.prepare('SELECT id,name,created_at AS createdAt,updated_at AS updatedAt FROM checkin_topics WHERE id=?').get(id)
    if (!row) throw failure('checkin/topic-not-found')
    return row as unknown as Topic
  }
  /** Release the connection when the owning plugin unloads. */
  close(): void { this.db.close() }
  /** @returns Current catalog and Beijing date. */
  list(): TopicList {
    return { today: todayInBeijing(this.now()), timeZone: 'Asia/Shanghai', topics: this.db.prepare('SELECT id,name,created_at AS createdAt,updated_at AS updatedAt FROM checkin_topics ORDER BY created_at,id').all() as unknown as Topic[] }
  }
  /** @param rawName - User-entered name. @returns Created topic. */
  create(rawName: string): Topic {
    const name = validName(rawName)
    return this.transaction(() => {
      if (this.db.prepare('SELECT id FROM checkin_topics WHERE name=?').get(name)) throw failure('checkin/duplicate-name')
      const topic: Topic = { id: randomUUID() as TopicId, name, createdAt: this.now().toISOString(), updatedAt: this.now().toISOString() }
      this.db.prepare('INSERT INTO checkin_topics(id,name,created_at,updated_at,revision) VALUES(?,?,?,?,?)').run(topic.id, name, topic.createdAt, topic.updatedAt, randomUUID())
      return topic
    })
  }
  /** @param id - Existing topic. @param rawName - Replacement name. @returns Updated topic. */
  update(id: TopicId, rawName: string): Topic {
    const name = validName(rawName)
    return this.transaction(() => {
      this.topic(id)
      if (this.db.prepare('SELECT id FROM checkin_topics WHERE name=? AND id<>?').get(name, id)) throw failure('checkin/duplicate-name')
      this.db.prepare('UPDATE checkin_topics SET name=?,updated_at=?,revision=? WHERE id=?').run(name, this.now().toISOString(), randomUUID(), id)
      return this.topic(id)
    })
  }
  /** @param id - Topic to permanently remove. @returns Removed topic and completion count. */
  delete(id: TopicId): DeleteResult {
    return this.transaction(() => {
      const topic = this.topic(id)
      const deletedRecords = Number(this.db.prepare('SELECT count(*) AS count FROM checkin_records WHERE topic_id=?').get(id)?.count)
      this.db.prepare('DELETE FROM checkin_topics WHERE id=?').run(id)
      return { topic, deletedRecords }
    })
  }
  /** @param request - Explicit desired status. @returns Actual date, topic and status. */
  set(request: SetCheckin): CheckinResult {
    const today = todayInBeijing(this.now())
    const date = validDate(request.date ?? today)
    if (date > today) throw failure('checkin/future-date')
    return this.transaction(() => {
      const topic = this.topic(request.topicId)
      if (request.completed) this.db.prepare('INSERT OR IGNORE INTO checkin_records(topic_id,date,created_at,revision) VALUES(?,?,?,?)').run(topic.id, date, this.now().toISOString(), randomUUID())
      else this.db.prepare('DELETE FROM checkin_records WHERE topic_id=? AND date=?').run(topic.id, date)
      return { topic, date, completed: request.completed }
    })
  }
  /** @param request - Inclusive date range. @returns Current topics and sparse completed days. */
  query(request: QueryCheckins): QueryResult {
    const from = validDate(request.from), to = validDate(request.to)
    if (from > to) throw failure('checkin/invalid-range')
    return this.transaction(() => {
      const list = this.list()
      const topics = request.topicId === undefined ? list.topics : [this.topic(request.topicId)]
      const completions = (request.topicId === undefined
        ? this.db.prepare('SELECT topic_id AS topicId,date FROM checkin_records WHERE date BETWEEN ? AND ? ORDER BY date,topic_id').all(from, to)
        : this.db.prepare('SELECT topic_id AS topicId,date FROM checkin_records WHERE date BETWEEN ? AND ? AND topic_id=? ORDER BY date').all(from, to, request.topicId)) as unknown as Completion[]
      return { ...list, from, to, topics, completions }
    })
  }
  /** @returns Deterministic full backup and timestamped filename. */
  exportData(): ExportDataResult {
    const backup = this.transaction((): CheckinBackup => ({
      format: 'dsh-checkin',
      version: 2,
      exportedAt: this.now().toISOString(),
      topics: this.list().topics,
      completions: this.db.prepare('SELECT topic_id AS topicId,date,created_at AS createdAt FROM checkin_records ORDER BY date,topic_id').all() as unknown as BackupCompletion[],
    }))
    const json = JSON.stringify(backup, null, 2)
    try { assertBackupSize(json) } catch { throw failure('checkin/backup-too-large') }
    return { filename: `dsh-checkin-${backup.exportedAt.replace(/[:.]/gu, '-')}.json`, json }
  }
  /** Atomically add unseen topic IDs while preserving all existing local topics. */
  importData(json: string): ImportDataResult {
    const backup = parseBackup(json, todayInBeijing(this.now()))
    return this.transaction(() => {
      const existingIds = new Set((this.db.prepare('SELECT id FROM checkin_topics').all() as { id: string }[]).map(row => row.id))
      const incoming = backup.topics.filter(topic => !existingIds.has(topic.id))
      const findName = this.db.prepare('SELECT id FROM checkin_topics WHERE name=?')
      if (incoming.some(topic => findName.get(topic.name) !== undefined)) throw failure('checkin/import-conflict')
      const insertTopic = this.db.prepare('INSERT INTO checkin_topics(id,name,created_at,updated_at,revision) VALUES(?,?,?,?,?)')
      const insertRecord = this.db.prepare('INSERT INTO checkin_records(topic_id,date,created_at,revision) VALUES(?,?,?,?)')
      for (const topic of incoming) insertTopic.run(topic.id, topic.name, topic.createdAt, topic.updatedAt, randomUUID())
      const importedIds = new Set(incoming.map(topic => topic.id))
      const completions = backup.completions.filter(item => importedIds.has(item.topicId))
      for (const item of completions) insertRecord.run(item.topicId, item.date, item.createdAt, randomUUID())
      return {
        importedTopics: incoming.length,
        importedCompletions: completions.length,
        skippedTopics: backup.topics.length - incoming.length,
      }
    })
  }
}
