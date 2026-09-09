import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { CheckinStore, monthRange, todayInBeijing, validDate } from '../src/host/store.ts'
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
  it('refuses a newer schema without rewriting its version', () => {
    const other = join(dir, 'future.sqlite'); const db = new DatabaseSync(other)
    db.exec('PRAGMA user_version=2'); db.close()
    expect(() => new CheckinStore({ databasePath: other, busyTimeoutMs: 1000 })).toThrow('newer-schema')
    const check = new DatabaseSync(other)
    expect(check.prepare('PRAGMA user_version').get()?.user_version).toBe(2); check.close()
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
