import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CheckinStore, monthRange, todayInBeijing, validDate } from '../src/host/store.ts'
import type { TopicId } from '../src/types.ts'
import { config, mockDatabase, sqlRequest } from './helpers/pub-database.ts'
let store: CheckinStore, database: ReturnType<typeof mockDatabase>
beforeEach(() => { database = mockDatabase(); store = new CheckinStore(config, () => new Date('2026-09-09T16:01:00Z')) })
afterEach(() => { store.close(); vi.unstubAllGlobals() })
describe('daily check-ins', () => {
  it('normalizes names and preserves records across rename and repeated writes', async () => {
    const reading = await store.create('  阅读  '), exercise = await store.create('运动')
    expect(reading.name).toBe('阅读')
    await expect(store.create('阅读')).rejects.toThrow('duplicate-name')
    await expect(store.update(exercise.id, ' 阅读 ')).rejects.toThrow('duplicate-name')
    await expect(store.create('  ')).rejects.toThrow('invalid-name')
    await expect(store.create('a'.repeat(201))).rejects.toThrow('invalid-name')
    expect((await store.set({ topicId: reading.id, completed: true })).date).toBe('2026-09-10')
    await store.set({ topicId: reading.id, completed: true })
    await store.set({ topicId: reading.id, date: '2000-02-29', completed: true })
    await store.update(reading.id, '读书')
    const all = await store.query({ from: '2000-02-01', to: '2026-09-30' })
    expect(all.topics.map(topic => topic.name)).toContain('读书')
    expect(all.completions).toHaveLength(2)
    expect((await store.query({ from: '2000-01-01', to: '2026-10-01', topicId: exercise.id })).completions).toEqual([])
    await store.set({ topicId: reading.id, completed: false }); await store.set({ topicId: reading.id, completed: false })
    expect((await store.delete(reading.id)).deletedRecords).toBe(1)
    expect((await store.query({ from: '0001-01-01', to: '9999-12-31' })).completions).toEqual([])
    expect((await store.list()).topics).toEqual([exercise])
  })
  it('rejects impossible/future writes and unknown topics without changing data', async () => {
    const topic = await store.create('跑步')
    for (const date of ['2026-02-29','2026-13-01','2026-04-31','2026-9-09','0000-01-01','invalid']) await expect(store.set({ topicId: topic.id, date, completed: true })).rejects.toThrow('invalid-date')
    await expect(store.set({ topicId: topic.id, date: '2026-09-11', completed: true })).rejects.toThrow('future-date')
    await expect(store.set({ topicId: topic.id, date: '2026-09-11', completed: false })).rejects.toThrow('future-date')
    const missing = 'missing' as TopicId
    await expect(store.set({ topicId: missing, completed: true })).rejects.toThrow('topic-not-found')
    await expect(store.update(missing, 'missing')).rejects.toThrow('topic-not-found')
    await expect(store.delete(missing)).rejects.toThrow('topic-not-found')
    await expect(store.query({ from: '2026-09-01', to: '2026-08-01' })).rejects.toThrow('invalid-range')
    expect((await store.query({ from: '2026-09-01', to: '2026-10-01' })).completions).toHaveLength(0)
  })
  it('reads remote data after reopening and after another Host changes it', async () => {
    const topic = await store.create('练琴')
    await store.set({ topicId: topic.id, completed: true })
    store.close(); store = new CheckinStore(config)
    const second = new CheckinStore(config)
    try {
      expect((await second.query({ from: '2026-09-10', to: '2026-09-10' })).completions).toEqual([{ topicId: topic.id, date: '2026-09-10' }])
      await second.update(topic.id, '钢琴')
      expect((await store.list()).topics[0]?.name).toBe('钢琴')
    } finally { second.close() }
  })
  it('preserves unrelated SQL columns and serializes Host writes', async () => {
    const topic = database.seed('阅读')
    topic.metadata = { color: 'blue', labels: ['keep'] }
    await Promise.all([
      store.set({ topicId: topic.id as TopicId, date: '2026-09-09', completed: true }),
      store.set({ topicId: topic.id as TopicId, date: '2026-09-10', completed: true }),
      store.update(topic.id as TopicId, '读书'),
    ])
    expect(database.records.get(topic.id)).toMatchObject({ name: '读书', metadata: { color: 'blue', labels: ['keep'] } })
    expect(database.records.get(topic.id)).not.toHaveProperty('completedDates')
    expect([...database.completions.values()].map(row => row.date)).toEqual(['2026-09-09', '2026-09-10'])
    const writes = database.fetcher.mock.calls.filter(([, init]) => sqlRequest(init).sql.startsWith('UPDATE')).length
    await store.set({ topicId: topic.id as TopicId, date: '2026-09-10', completed: true })
    expect(database.fetcher.mock.calls.filter(([, init]) => sqlRequest(init).sql.startsWith('UPDATE'))).toHaveLength(writes)
  })
  it('refuses invalid record dates without modifying them', async () => {
    database.seed('阅读', ['2026-02-29'])
    await expect(store.query({ from: '2026-01-01', to: '2026-12-31' })).rejects.toThrow('invalid-data')
    expect(database.fetcher.mock.calls.every(([, init]) => !/^(INSERT|UPDATE|DELETE)/u.test(sqlRequest(init).sql))).toBe(true)
  })
  it('stores early calendar dates as canonical strings and permits undo at quota', async () => {
    const topic = database.seed('阅读')
    await store.set({ topicId: topic.id as TopicId, date: '0001-01-01', completed: true })
    expect((await store.query({ from: '0001-01-01', to: '0001-01-01' })).completions).toHaveLength(1)
    database.state.limits.maxBytes = database.state.usedBytes
    await store.set({ topicId: topic.id as TopicId, date: '0001-01-01', completed: false })
    expect(database.completions.size).toBe(0)
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
