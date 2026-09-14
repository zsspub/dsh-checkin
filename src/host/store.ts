import { PubDatabase, failure, type DatabaseRecord, type StoreConfig } from './database.ts'
import type { CheckinResult, Completion, DeleteResult, QueryCheckins, QueryResult, SetCheckin, Topic, TopicId, TopicList } from '../types.ts'

export type { StoreConfig } from './database.ts'
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
export class CheckinStore {
  private readonly database: PubDatabase
  private queue: Promise<unknown> = Promise.resolve()

  constructor(config: StoreConfig, private readonly now: () => Date = () => new Date()) {
    this.database = new PubDatabase(config)
  }

  private serialize<Result>(run: () => Promise<Result>, signal?: AbortSignal): Promise<Result> {
    const pending = this.queue.then(() => { signal?.throwIfAborted(); return run() })
    this.queue = pending.catch(() => {})
    return pending
  }

  private data(record: DatabaseRecord) {
    try {
      if (validName(record.name) !== record.name) throw failure('checkin/invalid-data')
    } catch { throw failure('checkin/invalid-data') }
    return record
  }

  private topic(record: DatabaseRecord): Topic {
    return { id: record.id as TopicId, name: this.data(record).name, createdAt: record.createdAt, updatedAt: record.updatedAt }
  }

  private async record(id: TopicId, signal?: AbortSignal): Promise<DatabaseRecord> {
    const record = await this.database.get(id, signal)
    if (!record) throw failure('checkin/topic-not-found')
    this.data(record)
    return record
  }

  private async records(signal?: AbortSignal): Promise<DatabaseRecord[]> {
    const records = await this.database.list(signal)
    for (const record of records) this.data(record)
    return records.sort((left, right) => left.createdAt.localeCompare(right.createdAt) || left.id.localeCompare(right.id))
  }

  close(): void { this.database.close() }

  list(signal?: AbortSignal): Promise<TopicList> {
    return this.serialize(async () => {
      const records = await this.records(signal)
      return { today: todayInBeijing(this.now()), timeZone: 'Asia/Shanghai', topics: records.map(record => this.topic(record)) }
    }, signal)
  }

  async create(rawName: string, signal?: AbortSignal): Promise<Topic> {
    const name = validName(rawName)
    return this.serialize(async () => {
      const records = await this.records(signal)
      if (records.some(record => this.data(record).name === name)) throw failure('checkin/duplicate-name')
      return this.topic(await this.database.create(name, this.now().toISOString(), signal))
    }, signal)
  }

  async update(id: TopicId, rawName: string, signal?: AbortSignal): Promise<Topic> {
    const name = validName(rawName)
    return this.serialize(async () => {
      const records = await this.records(signal)
      const record = await this.record(id, signal)
      if (records.some(candidate => candidate.id !== id && this.data(candidate).name === name)) throw failure('checkin/duplicate-name')
      if (record.name === name) return this.topic(record)
      return this.topic(await this.database.update(record, { name }, this.now().toISOString(), signal))
    }, signal)
  }

  delete(id: TopicId, signal?: AbortSignal): Promise<DeleteResult> {
    return this.serialize(async () => {
      const record = await this.record(id, signal)
      const topic = this.topic(record)
      const deletedRecords = await this.database.delete(record, signal)
      return { topic, deletedRecords }
    }, signal)
  }

  async set(request: SetCheckin, signal?: AbortSignal): Promise<CheckinResult> {
    const today = todayInBeijing(this.now())
    const date = validDate(request.date ?? today)
    if (date > today) throw failure('checkin/future-date')
    return this.serialize(async () => {
      const record = await this.record(request.topicId, signal)
      const topic = this.topic(record)
      await this.database.set(record, date, request.completed, this.now().toISOString(), signal)
      return { topic, date, completed: request.completed }
    }, signal)
  }

  async query(request: QueryCheckins, signal?: AbortSignal): Promise<QueryResult> {
    const from = validDate(request.from), to = validDate(request.to)
    if (from > to) throw failure('checkin/invalid-range')
    return this.serialize(async () => {
      const records = (await this.records(signal)).filter(record => request.topicId === undefined || record.id === request.topicId)
      if (request.topicId !== undefined && !records.length) throw failure('checkin/topic-not-found')
      const topics = records.map(record => this.topic(record))
      const rows = await this.database.completions(from, to, request.topicId, signal)
      const ids = new Set(records.map(record => record.id))
      if (rows.some(row => !ids.has(row.topicId))) throw failure('checkin/inconsistent-read')
      const completions: Completion[] = rows.map(row => ({ topicId: row.topicId as TopicId, date: row.date }))
      return { today: todayInBeijing(this.now()), timeZone: 'Asia/Shanghai', topics, from, to, completions }
    }, signal)
  }
}
