import { describe, expect, it, vi } from 'vitest'
import { CheckinController, type CheckinApi } from '../src/client/controller.ts'
import { computeCheckinStats } from '../src/stats.ts'
import type { MonthResult, StatsResult, TopicId } from '../src/types.ts'
const month = (m: string): MonthResult => ({ today: '2026-09-10', timeZone: 'Asia/Shanghai', from: `${m}-01`, to: `${m}-30`, month: m, refreshIntervalMs: 3000, topics: [], completions: [] })
const statsRes = (revision = 'rev-1', preset: '7d' | '30d' = '30d'): StatsResult => ({
  today: '2026-09-10',
  timeZone: 'Asia/Shanghai',
  refreshIntervalMs: 3000,
  revision,
  unchanged: false,
  snapshot: computeCheckinStats({ today: '2026-09-10', topics: [], completions: [], preset }),
})
const api = (): CheckinApi => ({
  month: vi.fn(async () => month('2026-09')),
  stats: vi.fn(async () => statsRes()),
  create: vi.fn(async () => ({})),
  update: vi.fn(async () => ({})),
  delete: vi.fn(async () => ({})),
  set: vi.fn(async () => ({})),
  exportData: vi.fn(async () => ({ filename: 'checkin.json', json: '{}' })),
  importData: vi.fn(async () => ({ importedTopics: 1, importedCompletions: 2, skippedTopics: 0 })),
})
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(r => { resolve = r }); return { promise, resolve } }
describe('right-tab requests', () => {
  it('ignores an older response even when the transport ignores abort', async () => {
    const first = deferred<MonthResult>(), second = deferred<MonthResult>(); const host = api()
    host.month = vi.fn().mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise)
    const controller = new CheckinController(host); void controller.refresh(); controller.selectMonth('2026-08')
    second.resolve(month('2026-08')); await second.promise; await Promise.resolve()
    first.resolve(month('2026-09')); await first.promise; await Promise.resolve()
    expect(controller.getSnapshot().data?.month).toBe('2026-08'); controller.dispose()
  })
  it('discards reads and refuses new work after disposal', async () => {
    const pending = deferred<MonthResult>(); const host = api(); host.month = vi.fn(() => pending.promise)
    const controller = new CheckinController(host); void controller.refresh(); controller.dispose(); pending.resolve(month('2026-09')); await pending.promise
    expect(controller.getSnapshot().data).toBeNull(); await controller.refresh(); expect(host.month).toHaveBeenCalledTimes(1)
  })
  it('serializes writes, preserves errors and allows retry', async () => {
    const host = api(), controller = new CheckinController(host); await controller.refresh()
    const write = deferred<unknown>(); const operation = vi.fn(() => write.promise)
    const saving = controller.mutate(operation)
    expect(await controller.mutate(operation)).toBe(false); expect(operation).toHaveBeenCalledTimes(1)
    write.resolve({}); expect(await saving).toBe(true)
    expect(await controller.mutate(async () => { throw new Error('checkin/duplicate-name') })).toBe(false)
    expect(controller.getSnapshot().error).toContain('duplicate-name')
    expect(await controller.mutate(async () => ({}))).toBe(true); expect(controller.getSnapshot().error).toBeNull(); controller.dispose()
  })
  it('enforces latest-request-wins for stats, clears transient errors on unchanged hit, and auto-recovers deleted topics', async () => {
    const first = deferred<StatsResult>(), second = deferred<StatsResult>()
    const host = api()
    host.stats = vi.fn().mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise)
    const controller = new CheckinController(host)
    controller.setView('stats')
    controller.setStatsFilter('7d')
    second.resolve(statsRes('rev-7d', '7d')); await second.promise; await Promise.resolve()
    first.resolve(statsRes('rev-30d', '30d')); await first.promise; await Promise.resolve()
    expect(controller.getSnapshot().stats?.preset).toBe('7d')
    expect(controller.getSnapshot().statsRevision).toBe('rev-7d')

    // Transient poll error followed by unchanged hit clears statsError
    host.stats = vi.fn()
      .mockRejectedValueOnce(new Error('network down'))
      .mockResolvedValueOnce({ today: '2026-09-10', timeZone: 'Asia/Shanghai', refreshIntervalMs: 3000, revision: 'rev-7d', unchanged: true, snapshot: null })
    await controller.refreshStats(true)
    expect(controller.getSnapshot().statsError).toContain('network down')
    await controller.refreshStats(true)
    expect(host.stats).toHaveBeenLastCalledWith({ preset: '7d', ifNoneMatch: 'rev-7d' }, expect.any(AbortSignal))
    expect(controller.getSnapshot().statsError).toBeNull()

    // Deleted-topic auto-recovery resets topicId and sets statsNotice
    host.stats = vi.fn()
      .mockRejectedValueOnce(new Error('checkin/topic-not-found'))
      .mockResolvedValueOnce(statsRes('rev-all', '7d'))
    controller.setTopicId('gone' as TopicId)
    await vi.waitFor(() => expect(controller.getSnapshot().topicId).toBe(''))
    expect(controller.getSnapshot().statsNotice).toBe('topicDeleted')
    expect(controller.getSnapshot().statsError).toBeNull()

    // Mutation in stats view invalidates revision and refreshes stats
    host.stats = vi.fn(async () => statsRes('rev-after-write', '7d'))
    expect(await controller.mutate(async () => ({}))).toBe(true)
    expect(controller.getSnapshot().statsRevision).toBe('rev-after-write')
    controller.dispose()
  })
})
