import { describe, expect, it } from 'vitest'
import {
  computeCheckinStats, dateToEpochDay, epochDayToDate, monthBounds, shiftDate, shiftMonth, weekdayMon0,
} from '../src/stats.ts'
import type { Completion, Topic, TopicId } from '../src/types.ts'

const topic = (id: string, name: string, createdAt = '2026-09-10T00:00:00.000Z'): Topic => ({
  id: id as TopicId,
  name,
  createdAt,
  updatedAt: createdAt,
})

const done = (topicId: string, date: string): Completion => ({ topicId: topicId as TopicId, date })

describe('UTC calendar helpers', () => {
  it('handles years 0001..9999 and leap years without two-digit year coercion', () => {
    expect(epochDayToDate(dateToEpochDay('0001-01-01'))).toBe('0001-01-01')
    expect(epochDayToDate(dateToEpochDay('0050-02-28'))).toBe('0050-02-28')
    expect(epochDayToDate(dateToEpochDay('2024-02-29'))).toBe('2024-02-29')
    expect(epochDayToDate(dateToEpochDay('9999-12-31'))).toBe('9999-12-31')
    expect(shiftDate('2024-02-28', 1)).toBe('2024-02-29')
    expect(shiftDate('0050-02-28', 1)).toBe('0050-03-01')
    expect(shiftMonth('0050-01', -1)).toBe('0049-12')
    expect(shiftMonth('2024-01', 1)).toBe('2024-02')
    expect(monthBounds('2024-02')).toEqual({ from: '2024-02-01', to: '2024-02-29' })
    expect(monthBounds('0001-01')).toEqual({ from: '0001-01-01', to: '0001-01-31' })
    // 1970-01-01 = Thu (3), 2026-09-10 = Thu (3), 2026-09-07 = Mon (0), 2026-09-13 = Sun (6)
    expect(weekdayMon0(dateToEpochDay('1970-01-01'))).toBe(3)
    expect(weekdayMon0(dateToEpochDay('2026-09-07'))).toBe(0)
    expect(weekdayMon0(dateToEpochDay('2026-09-10'))).toBe(3)
    expect(weekdayMon0(dateToEpochDay('2026-09-13'))).toBe(6)
  })
})

describe('computeCheckinStats domain semantics', () => {
  it('supports backfill before createdAt without exceeding 100%, ignores future records, and enforces today-grace streaks', () => {
    const read = topic('read', '阅读', '2026-09-10T23:59:00.000Z')
    const run = topic('run', '运动', '2026-09-10T23:59:00.000Z')
    const completions: Completion[] = [
      // Read: 10-day streak ending today (09-01..09-10) + future record ignored + duplicate ignored
      ...Array.from({ length: 10 }, (_, i) => done('read', `2026-09-${String(i + 1).padStart(2, '0')}`)),
      done('read', '2026-09-10'),
      done('read', '2026-09-11'),
      // Run: streak of 3 ending yesterday (09-07..09-09) -> pending_today; earlier tie of 3 (08-01..08-03) -> tie broken by most recent
      done('run', '2026-08-01'), done('run', '2026-08-02'), done('run', '2026-08-03'),
      done('run', '2026-09-07'), done('run', '2026-09-08'), done('run', '2026-09-09'),
    ]

    const snap = computeCheckinStats({
      today: '2026-09-10',
      topics: [read, run],
      completions,
      preset: '7d',
    })

    expect(snap.from).toBe('2026-09-04')
    expect(snap.to).toBe('2026-09-10')
    expect(snap.effectiveTo).toBe('2026-09-10')
    expect(snap.summary.elapsedDays).toBe(7)
    expect(snap.summary.todayDoneCount).toBe(1)
    expect(snap.summary.todayTotalCount).toBe(2)
    expect(snap.summary.completedCheckins).toBe(10) // 7 read + 3 run
    expect(snap.summary.possibleCheckins).toBe(14)
    expect(snap.summary.completionRate).toBeCloseTo(10 / 14, 6)
    expect(snap.summary.perfectDays).toBe(3) // 09-07, 09-08, 09-09
    expect(snap.summary.longestStreak).toBe(10) // full-history streak, NOT truncated to 7d!
    expect(snap.summary.longestStreakTopicName).toBe('阅读')
    expect(snap.summary.longestStreakFrom).toBe('2026-09-01')
    expect(snap.summary.longestStreakTo).toBe('2026-09-10')
    expect(snap.trend).toEqual([]) // 7d omits trend

    const readStat = snap.topics[0]!
    expect(readStat.windowRate).toBe(1) // <= 100% despite backfilling before createdAt
    expect(readStat.currentStreak).toBe(10)
    expect(readStat.streakStatus).toBe('done_today')

    const runStat = snap.topics[1]!
    expect(runStat.currentStreak).toBe(3)
    expect(runStat.streakStatus).toBe('pending_today')
    expect(runStat.longestStreak).toBe(3)
    expect(runStat.longestStreakFrom).toBe('2026-09-07') // tie broken by most recent run
    expect(runStat.longestStreakTo).toBe('2026-09-09')
  })

  it('gates prior-period comparison on existing history and clamps partial/future months', () => {
    const read = topic('read', '阅读')

    // New user: only completions in current 7d window -> comparison must be null (no fake +100pp)
    const fresh = computeCheckinStats({
      today: '2026-03-30',
      topics: [read],
      completions: [done('read', '2026-03-30')],
      preset: '7d',
    })
    expect(fresh.summary.comparison).toBeNull()

    // Partial current month 2026-03 on 2026-03-30 -> compares 2026-03-01..03-30 (30d) against 2026-02-01..02-28 (28d)
    const partialMonth = computeCheckinStats({
      today: '2026-03-30',
      topics: [read],
      completions: [done('read', '2026-02-01'), done('read', '2026-03-01'), done('read', '2026-03-02')],
      preset: 'month',
      month: '2026-03',
    })
    expect(partialMonth.summary.elapsedDays).toBe(30)
    expect(partialMonth.summary.comparison).toMatchObject({
      from: '2026-02-01',
      to: '2026-02-28',
      elapsedDays: 28,
      completedCheckins: 1,
      possibleCheckins: 28,
    })
    expect(partialMonth.heatmap.filter(c => c.future)).toHaveLength(1) // 2026-03-31 is future

    // Future month -> 0 elapsed days, null rate, all cells future
    const futureMonth = computeCheckinStats({
      today: '2026-03-30',
      topics: [read],
      completions: [done('read', '2026-03-30')],
      preset: 'month',
      month: '2026-04',
    })
    expect(futureMonth.effectiveTo).toBeNull()
    expect(futureMonth.summary.elapsedDays).toBe(0)
    expect(futureMonth.summary.completionRate).toBeNull()
    expect(futureMonth.summary.comparison).toBeNull()
    expect(futureMonth.heatmap).toHaveLength(30)
    expect(futureMonth.heatmap.every(cell => cell.future && cell.level === 0)).toBe(true)

    // Month day 2 (2026-09-02, Wed): Mon (0), Thu..Sun have 0 occurrences -> rate null
    const earlyMonth = computeCheckinStats({
      today: '2026-09-02',
      topics: [read],
      completions: [done('read', '2026-09-01')],
      preset: 'month',
      month: '2026-09',
    })
    expect(earlyMonth.weekdays[0]).toMatchObject({ weekday: 0, occurrences: 0, rate: null })
    expect(earlyMonth.weekdays[1]).toMatchObject({ weekday: 1, occurrences: 1, completed: 1, rate: 1 })
    expect(earlyMonth.weekdays[2]).toMatchObject({ weekday: 2, occurrences: 1, completed: 0, rate: 0 })
    expect(earlyMonth.weekdays[3]).toMatchObject({ weekday: 3, occurrences: 0, rate: null })
  })

  it('omits percentage rates in all-time mode and bounds heatmap/trend on ancient backfills', () => {
    const read = topic('read', '阅读')
    const run = topic('run', '运动')

    const snap = computeCheckinStats({
      today: '2026-09-10',
      topics: [read, run],
      completions: [done('read', '0001-01-01'), done('read', '2026-09-10'), done('run', '2026-09-10')],
      preset: 'all',
    })

    expect(snap.summary.completionRate).toBeNull()
    expect(snap.summary.elapsedDays).toBeNull()
    expect(snap.summary.comparison).toBeNull()
    expect(snap.topics[0]!.windowRate).toBeNull()
    expect(snap.topics[0]!.allTimeCount).toBe(2)
    expect(snap.heatmapGranularity).toBe('month')
    expect(snap.heatmap.length).toBeLessThanOrEqual(120)
    expect(snap.trend.length).toBeGreaterThan(0)
    expect(snap.trend.length).toBeLessThanOrEqual(10)
    expect(snap.weekdays.every(w => w.rate === null && w.possible === 0)).toBe(true)
  })

  it('computes 90d trend in <= 10 buckets and single-topic binary heatmap levels', () => {
    const read = topic('read', '阅读')
    const snap = computeCheckinStats({
      today: '2026-09-10',
      topics: [read],
      completions: [done('read', '2026-09-10')],
      preset: '90d',
      topicId: read.id,
    })
    expect(snap.heatmap).toHaveLength(90)
    expect(snap.heatmap.find(c => c.key === '2026-09-10')?.level).toBe(4)
    expect(snap.heatmap.find(c => c.key === '2026-09-09')?.level).toBe(0)
    expect(snap.trend).toHaveLength(9)
  })
})
