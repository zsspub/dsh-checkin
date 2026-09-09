import { describe, expect, it, vi } from 'vitest'
import { CheckinController, type CheckinApi } from '../src/client/controller.ts'
import type { MonthResult } from '../src/types.ts'
const month = (m: string): MonthResult => ({ today: '2026-09-10', timeZone: 'Asia/Shanghai', from: `${m}-01`, to: `${m}-30`, month: m, refreshIntervalMs: 3000, topics: [], completions: [] })
const api = (): CheckinApi => ({ month: vi.fn(async () => month('2026-09')), create: vi.fn(async () => ({})), update: vi.fn(async () => ({})), delete: vi.fn(async () => ({})), set: vi.fn(async () => ({})) })
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(r => { resolve = r }); return { promise, resolve } }
describe('drawer requests', () => {
  it('ignores an older response even when the transport ignores abort', async () => {
    const first = deferred<MonthResult>(), second = deferred<MonthResult>(); const host = api()
    host.month = vi.fn().mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise)
    const controller = new CheckinController(host); controller.open(); controller.selectMonth('2026-08')
    second.resolve(month('2026-08')); await second.promise; await Promise.resolve()
    first.resolve(month('2026-09')); await first.promise; await Promise.resolve()
    expect(controller.getSnapshot().data?.month).toBe('2026-08'); controller.dispose()
  })
  it('discards closed reads and cancels on disposal', async () => {
    const pending = deferred<MonthResult>(); const host = api(); host.month = vi.fn(() => pending.promise)
    const controller = new CheckinController(host); controller.open(); controller.close(); pending.resolve(month('2026-09')); await pending.promise
    expect(controller.getSnapshot().data).toBeNull(); controller.dispose(); controller.open(); expect(controller.getSnapshot().open).toBe(false)
  })
  it('serializes writes, preserves errors and allows retry', async () => {
    const host = api(), controller = new CheckinController(host); controller.open(); await controller.refresh()
    const write = deferred<unknown>(); const operation = vi.fn(() => write.promise)
    const saving = controller.mutate(operation)
    expect(await controller.mutate(operation)).toBe(false); expect(operation).toHaveBeenCalledTimes(1)
    write.resolve({}); expect(await saving).toBe(true)
    expect(await controller.mutate(async () => { throw new Error('checkin/duplicate-name') })).toBe(false)
    expect(controller.getSnapshot().error).toContain('duplicate-name')
    expect(await controller.mutate(async () => ({}))).toBe(true); expect(controller.getSnapshot().error).toBeNull(); controller.dispose()
  })
})
