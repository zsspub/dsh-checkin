import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { CheckinStore, monthRange, SCHEMA_VERSION, todayInBeijing, validDate } from '../src/host/store.ts'
import type { TopicId } from '../src/types.ts'
let dir: string, path: string, store: CheckinStore
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'checkin-')); path = join(dir, 'db.sqlite'); store = new CheckinStore({ databasePath: path, busyTimeoutMs: 1000 }, () => new Date('2026-09-09T16:01:00Z')) })
afterEach(() => { store.close(); rmSync(dir, { recursive: true, force: true }) })
describe('daily check-ins', () => {
  it('normalizes names and preserves records across rename and repeated writes', () => {
    const a = store.create('  阅读  '), b = store.create('运动')
    expect(a.name).toBe('阅读')
    expect(() => store.create('阅读')).toThrow('duplicate-name')
    expect(() => store.update(b.id, ' 阅读 ')).toThrow('duplicate-name')
    expect(() => store.create('  ')).toThrow('invalid-name')
    expect(() => store.create('a'.repeat(201))).toThrow('invalid-name')
    expect(store.set({ topicId: a.id, completed: true }).date).toBe('2026-09-10')
    store.set({ topicId: a.id, completed: true })
    store.set({ topicId: a.id, date: '2000-02-29', completed: true })
    store.update(a.id, '读书')
    const all = store.query({ from: '2000-02-01', to: '2026-09-30' })
    expect(all.topics.map(t => t.name)).toContain('读书')
    expect(all.completions).toHaveLength(2)
    expect(store.query({ from: '2000-01-01', to: '2026-10-01', topicId: b.id }).completions).toEqual([])
    store.set({ topicId: a.id, completed: false }); store.set({ topicId: a.id, completed: false })
    expect(store.delete(a.id).deletedRecords).toBe(1)
    expect(store.query({ from: '0001-01-01', to: '9999-12-31' }).completions).toEqual([])
    expect(store.list().topics).toEqual([b])
  })
  it('rejects impossible/future writes and unknown topics without changing data', () => {
    const topic = store.create('跑步')
    for (const date of ['2026-02-29','2026-13-01','2026-04-31','2026-9-09','0000-01-01','invalid']) expect(() => store.set({ topicId: topic.id, date, completed: true })).toThrow('invalid-date')
    expect(() => store.set({ topicId: topic.id, date: '2026-09-11', completed: true })).toThrow('future-date')
    expect(() => store.set({ topicId: topic.id, date: '2026-09-11', completed: false })).toThrow('future-date')
    const missing = 'missing' as TopicId
    expect(() => store.set({ topicId: missing, completed: true })).toThrow('topic-not-found')
    expect(() => store.update(missing, 'a')).toThrow('topic-not-found')
    expect(() => store.delete(missing)).toThrow('topic-not-found')
    expect(() => store.query({ from: '2026-09-01', to: '2026-08-01' })).toThrow('invalid-range')
    expect(store.query({ from: '2026-09-01', to: '2026-10-01' }).completions).toHaveLength(0)
  })
  it('keeps completions across close/reopen and independent connections', () => {
    const topic = store.create('练琴')
    store.set({ topicId: topic.id, completed: true })
    store.close(); store = new CheckinStore({ databasePath: path, busyTimeoutMs: 1000 })
    const second = new CheckinStore({ databasePath: path, busyTimeoutMs: 1000 })
    try {
      expect(second.query({ from: '2026-09-10', to: '2026-09-10' }).completions).toEqual([{ topicId: topic.id, date: '2026-09-10' }])
      second.update(topic.id, '钢琴')
      expect(store.list().topics[0]?.name).toBe('钢琴')
    } finally { second.close() }
  })
  it('exports and atomically imports a versioned full backup incrementally', () => {
    const reading = store.create('阅读')
    store.set({ topicId: reading.id, date: '2024-02-29', completed: true })
    const exported = store.exportData()
    const backup = JSON.parse(exported.json)
    expect(exported.filename).toMatch(/^dsh-checkin-.+\.json$/u)
    expect(backup).toMatchObject({
      format: 'dsh-checkin',
      version: 2,
      topics: [{ id: reading.id, name: '阅读' }],
      completions: [{ topicId: reading.id, date: '2024-02-29', createdAt: '2026-09-09T16:01:00.000Z' }],
    })

    store.close()
    const targetPath = join(dir, 'target.sqlite')
    store = new CheckinStore({ databasePath: targetPath, busyTimeoutMs: 1000 }, () => new Date('2026-09-09T16:01:00Z'))
    expect(store.importData(exported.json)).toEqual({ importedTopics: 1, importedCompletions: 1, skippedTopics: 0 })
    expect(store.importData(exported.json)).toEqual({ importedTopics: 0, importedCompletions: 0, skippedTopics: 1 })
    store.update(reading.id, '本地修改')
    expect(store.importData(exported.json)).toEqual({ importedTopics: 0, importedCompletions: 0, skippedTopics: 1 })
    expect(store.list().topics[0]?.name).toBe('本地修改')
    expect(store.query({ from: '2024-02-29', to: '2024-02-29' }).completions).toEqual([{ topicId: reading.id, date: '2024-02-29' }])
  })
  it('accepts version 1 backups and derives missing completion timestamps', () => {
    const json = JSON.stringify({
      format: 'dsh-checkin',
      version: 1,
      exportedAt: '2026-09-10T00:00:00.000Z',
      topics: [{ id: 'legacy', name: '旧备份', createdAt: '2026-09-09T00:00:00.000Z', updatedAt: '2026-09-09T00:00:00.000Z' }],
      completions: [{ topicId: 'legacy', date: '2026-09-09' }],
    })
    expect(store.importData(json)).toEqual({ importedTopics: 1, importedCompletions: 1, skippedTopics: 0 })
    expect(JSON.parse(store.exportData().json).completions).toEqual([
      { topicId: 'legacy', date: '2026-09-09', createdAt: '2026-09-10T00:00:00.000Z' },
    ])
  })
  it('rejects malformed or inconsistent backups without changing SQLite', () => {
    const topic = store.create('保留')
    const original = store.exportData().json
    for (const candidate of [
      'not json',
      JSON.stringify({ format: 'another-plugin', version: 1, exportedAt: '2026-09-10T00:00:00.000Z', topics: [], completions: [] }),
      JSON.stringify({ format: 'dsh-checkin', version: 1, exportedAt: '2026-09-10T00:00:00.000Z', topics: [{ id: 'a', name: '重复', createdAt: '2026-09-10T00:00:00.000Z', updatedAt: '2026-09-10T00:00:00.000Z' }, { id: 'b', name: '重复', createdAt: '2026-09-10T00:00:00.000Z', updatedAt: '2026-09-10T00:00:00.000Z' }], completions: [] }),
      JSON.stringify({ format: 'dsh-checkin', version: 1, exportedAt: '2026-09-10T00:00:00.000Z', topics: [], completions: [{ topicId: 'missing', date: '2026-09-10', createdAt: '2026-09-10T00:00:00.000Z' }] }),
      JSON.stringify({ format: 'dsh-checkin', version: 2, exportedAt: '2026-09-10T00:00:00.000Z', topics: [{ id: 'v2', name: '新版', createdAt: '2026-09-10T00:00:00.000Z', updatedAt: '2026-09-10T00:00:00.000Z' }], completions: [{ topicId: 'v2', date: '2026-09-10' }] }),
    ]) expect(() => store.importData(candidate)).toThrow('invalid-backup')
    expect(store.list().topics).toEqual([topic])
    expect(store.exportData().json.replace(/"exportedAt": "[^"]+"/u, '"exportedAt": "<time>"')).toBe(original.replace(/"exportedAt": "[^"]+"/u, '"exportedAt": "<time>"'))
  })
  it('rolls back the full incremental import when a new topic name conflicts', () => {
    const local = store.create('本地主题')
    const incoming = JSON.parse(store.exportData().json)
    incoming.topics = [
      { id: 'new-first', name: '先写入', createdAt: '2026-09-10T00:00:00.000Z', updatedAt: '2026-09-10T00:00:00.000Z' },
      { id: 'new-conflict', name: local.name, createdAt: '2026-09-10T00:00:00.000Z', updatedAt: '2026-09-10T00:00:00.000Z' },
    ]
    incoming.completions = [
      { topicId: 'new-first', date: '2026-09-10', createdAt: '2026-09-10T00:00:00.000Z' },
    ]
    expect(() => store.importData(JSON.stringify(incoming))).toThrow('import-conflict')
    expect(store.list().topics).toEqual([local])
    expect(store.query({ from: '2026-09-10', to: '2026-09-10' }).completions).toEqual([])
  })
  it('migrates the legacy SQLite schema without losing topics or completions', () => {
    store.close()
    const legacy = new DatabaseSync(path)
    legacy.exec(`DROP TABLE checkin_records; DROP TABLE checkin_topics;
      CREATE TABLE topics (id TEXT PRIMARY KEY, name TEXT NOT NULL UNIQUE, createdAt TEXT NOT NULL, updatedAt TEXT NOT NULL);
      CREATE TABLE completions (topicId TEXT NOT NULL REFERENCES topics(id) ON DELETE CASCADE, date TEXT NOT NULL, PRIMARY KEY(topicId, date));
      CREATE INDEX completions_date ON completions(date);
      PRAGMA user_version = 1;`)
    legacy.prepare('INSERT INTO topics VALUES(?,?,?,?)').run('topic-1', '阅读', '2024-01-01T00:00:00.000Z', '2024-02-01T00:00:00.000Z')
    legacy.prepare('INSERT INTO completions VALUES(?,?)').run('topic-1', '2024-02-29')
    legacy.close()

    store = new CheckinStore({ databasePath: path, busyTimeoutMs: 1000 }, () => new Date('2026-09-09T16:01:00Z'))
    expect(store.list().topics).toEqual([{
      id: 'topic-1', name: '阅读', createdAt: '2024-01-01T00:00:00.000Z', updatedAt: '2024-02-01T00:00:00.000Z',
    }])
    expect(store.query({ from: '2024-02-01', to: '2024-02-29' }).completions).toEqual([{ topicId: 'topic-1', date: '2024-02-29' }])
    const migrated = new DatabaseSync(path, { readOnly: true })
    expect(migrated.prepare('PRAGMA user_version').get()?.user_version).toBe(SCHEMA_VERSION)
    expect(migrated.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all().map(row => row.name)).toEqual(['checkin_records', 'checkin_topics'])
    migrated.close()
  })
  it('refuses a newer schema without rewriting its version', () => {
    const other = join(dir, 'future.sqlite'); const db = new DatabaseSync(other)
    db.exec(`PRAGMA user_version=${SCHEMA_VERSION + 1}`); db.close()
    expect(() => new CheckinStore({ databasePath: other, busyTimeoutMs: 1000 })).toThrow('newer-schema')
    const check = new DatabaseSync(other)
    expect(check.prepare('PRAGMA user_version').get()?.user_version).toBe(SCHEMA_VERSION + 1); check.close()
  })
  it('computes Beijing midnight and leap-year month ranges independently of local time', () => {
    expect(todayInBeijing(new Date('2026-09-09T15:59:59Z'))).toBe('2026-09-09')
    expect(todayInBeijing(new Date('2026-09-09T16:00:00Z'))).toBe('2026-09-10')
    expect(monthRange('2024-02')).toEqual({ from: '2024-02-01', to: '2024-02-29' })
    expect(monthRange('2026-12')).toEqual({ from: '2026-12-01', to: '2026-12-31' })
    expect(monthRange('0001-01').to).toBe('0001-01-31')
    expect(validDate('9999-12-31')).toBe('9999-12-31')
    expect(() => monthRange('2026-2')).toThrow('invalid-date')
  })
})
