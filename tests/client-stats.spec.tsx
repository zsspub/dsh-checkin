import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import React, { type ComponentProps } from 'react'
import { createPortal } from 'react-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CheckinPanel } from '../src/client/CheckinPanel.tsx'
import { CheckinController, type CheckinApi } from '../src/client/controller.ts'
import { en, zh, type CheckinKey } from '../src/client/locales.ts'
import { computeCheckinStats } from '../src/stats.ts'
import type { Completion, MonthResult, StatsRequest, StatsResult, Topic, TopicId } from '../src/types.ts'

vi.mock('@deepseek-ai/dsh-client-ui-primitives', () => ({
  Button: ({ icon, children, variant, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { icon?: React.ReactNode; variant?: string }) => (
    <button {...props} data-variant={variant}>{icon}{children}</button>
  ),
  Menu: ({ open, anchor, items, onSelect }: {
    open: boolean
    anchor: React.ReactNode
    items: readonly { id: string; label: React.ReactNode; disabled?: boolean }[]
    onSelect: (id: string) => void
  }) => (
    <span>
      {anchor}
      {open && createPortal(
        <div role="menu">
          {items.map(item => (
            <button type="button" role="menuitem" disabled={item.disabled} key={item.id} onClick={() => onSelect(item.id)}>
              {item.label}
            </button>
          ))}
        </div>,
        document.body,
      )}
    </span>
  ),
  Modal: ({ open, onClose, title, closeLabel, children, footer }: {
    open: boolean
    onClose: () => void
    title: string
    closeLabel: string
    children?: React.ReactNode
    footer?: React.ReactNode
  }) => open
    ? createPortal(<div role="dialog" aria-label={title}><button type="button" aria-label={closeLabel} onClick={onClose}>×</button>{children}{footer}</div>, document.body)
    : null,
}))

afterEach(() => { cleanup(); vi.restoreAllMocks() })

const makeT = (dict: Record<CheckinKey, string>) => (key: CheckinKey, params?: Record<string, string | number>) =>
  Object.entries(params ?? {}).reduce((text, [k, v]) => text.replaceAll(`{${k}}`, String(v)), dict[key])
const tZh = makeT(zh)
const tEn = makeT(en)

const makeTopic = (id: string, name: string): Topic => ({
  id: id as TopicId,
  name,
  createdAt: '2026-09-01T00:00:00.000Z',
  updatedAt: '2026-09-01T00:00:00.000Z',
})

function buildMockHost(initialTopics: Topic[], initialCompletions: Completion[], today = '2026-09-10') {
  let topics = [...initialTopics]
  let completions = [...initialCompletions]
  let rev = 1

  const api: CheckinApi = {
    month: vi.fn(async request => {
      const m = request.month ?? today.slice(0, 7)
      const endDay = m === '2026-08' ? '31' : '30'
      const result: MonthResult = {
        today,
        timeZone: 'Asia/Shanghai',
        from: `${m}-01`,
        to: `${m}-${endDay}`,
        month: m,
        refreshIntervalMs: 3000,
        topics,
        completions: completions.filter(c => c.date.startsWith(m)),
      }
      return result
    }),
    stats: vi.fn(async (request: StatsRequest): Promise<StatsResult> => {
      const preset = request.preset ?? '30d'
      if (request.topicId && !topics.some(item => item.id === request.topicId)) {
        throw new Error('checkin/topic-not-found')
      }
      const snapshot = computeCheckinStats({
        today,
        topics,
        completions,
        preset,
        ...(request.month !== undefined ? { month: request.month } : {}),
        ...(request.topicId !== undefined ? { topicId: request.topicId } : {}),
      })
      const revision = `rev-${rev}-${preset}-${request.month ?? ''}-${request.topicId ?? ''}`
      if (request.ifNoneMatch === revision) {
        return { today, timeZone: 'Asia/Shanghai', refreshIntervalMs: 3000, revision, unchanged: true, snapshot: null }
      }
      return { today, timeZone: 'Asia/Shanghai', refreshIntervalMs: 3000, revision, unchanged: false, snapshot }
    }),
    create: vi.fn(async req => {
      const created = makeTopic(`t-${rev + 1}`, req.name)
      topics = [...topics, created]
      rev += 1
      return created
    }),
    update: vi.fn(async () => ({})),
    delete: vi.fn(async () => ({})),
    set: vi.fn(async req => {
      const d = req.date ?? today
      completions = req.completed
        ? [...completions.filter(c => c.topicId !== req.topicId || c.date !== d), { topicId: req.topicId, date: d }]
        : completions.filter(c => c.topicId !== req.topicId || c.date !== d)
      rev += 1
      return {}
    }),
    exportData: vi.fn(async () => ({ filename: 'checkin.json', json: '{}' })),
    importData: vi.fn(async () => ({ importedTopics: 0, importedCompletions: 0, skippedTopics: 0 })),
  }

  return {
    api,
    dropTopic: (id: TopicId) => { topics = topics.filter(item => item.id !== id); rev += 1 },
  }
}

describe('Statistics panel UI', () => {
  it('mounts head styles independently of CheckinTrigger, lazy-loads stats via tablist keyboard nav, and cleans up on unmount', async () => {
    const { api } = buildMockHost([makeTopic('read', '阅读'), makeTopic('run', '运动')], [
      { topicId: 'read' as TopicId, date: '2026-09-10' },
      { topicId: 'run' as TopicId, date: '2026-09-09' },
    ])
    const controller = new CheckinController(api)
    const signal = new AbortController().signal
    const { unmount } = render(
      <CheckinPanel {...{ createController: () => controller, t: tZh, useTabInfo: () => ({ tab: { visible: true, signal } }) } as ComponentProps<typeof CheckinPanel>} />,
    )

    // Style tag mounted in document.head even without CheckinTrigger
    expect(document.head.querySelector('style[data-dsh-checkin-styles="true"]')).not.toBeNull()
    await screen.findByRole('grid')
    expect(api.stats).not.toHaveBeenCalled()

    // Switch to Statistics tab using ArrowRight key on Calendar tab
    const calTab = screen.getByRole('tab', { name: '日历' })
    fireEvent.keyDown(calTab, { key: 'ArrowRight' })
    await waitFor(() => expect(api.stats).toHaveBeenCalledTimes(1))
    expect(screen.getByRole('tab', { name: '统计' }).getAttribute('aria-selected')).toBe('true')
    expect(screen.getByText('今日已完成 1 / 2')).toBeTruthy()
    expect(screen.getByText(/今日待打卡/)).toBeTruthy()

    unmount()
    expect(document.head.querySelector('style[data-dsh-checkin-styles="true"]')).toBeNull()
  })

  it('folds 12+ topics with expand, supports asc/desc sort flip, table toggles, and hover/focus readout parity', async () => {
    const topics = Array.from({ length: 12 }, (_, i) => makeTopic(`t${i + 1}`, `主题 ${String(i + 1).padStart(2, '0')}`))
    const completions: Completion[] = [
      { topicId: 't1' as TopicId, date: '2026-09-10' },
      { topicId: 't1' as TopicId, date: '2026-09-09' },
      { topicId: 't2' as TopicId, date: '2026-09-10' },
    ]
    const { api } = buildMockHost(topics, completions)
    const controller = new CheckinController(api)
    const signal = new AbortController().signal
    render(
      <CheckinPanel {...{ createController: () => controller, t: tZh, useTabInfo: () => ({ tab: { visible: true, signal } }) } as ComponentProps<typeof CheckinPanel>} />,
    )
    await screen.findByRole('grid')
    fireEvent.click(screen.getByRole('tab', { name: '统计' }))
    await screen.findByText('展开其余 4 项（共 12 个主题）')

    // Expand remaining 4 topics
    fireEvent.click(screen.getByRole('button', { name: '展开其余 4 项（共 12 个主题）' }))
    expect(screen.getByRole('button', { name: '收起多余项' })).toBeTruthy()

    // Flip sort direction to ascending so struggling topics (0%) surface first
    const meterFigure = screen.getByRole('figure', { name: '各主题完成情况' })
    fireEvent.click(within(meterFigure).getByRole('button', { name: '当前降序，点击切换升序' }))
    const firstTopicRow = meterFigure.querySelector('.ci-meter-name')
    expect(firstTopicRow?.textContent).not.toBe('主题 01')

    // Toggle Meter List to accessible Table view
    fireEvent.click(within(meterFigure).getByRole('button', { name: '表格' }))
    const table = within(meterFigure).getByRole('table')
    expect(table.querySelector('caption.ci-sr-only')?.textContent).toBe('各主题完成情况')
    expect(within(table).getAllByRole('row')).toHaveLength(13) // header + all 12 topics

    // Heatmap hover & keyboard focus produce identical readout text
    const heatFigure = screen.getByRole('figure', { name: '打卡活跃热力图' })
    const dayBtn = heatFigure.querySelector<HTMLButtonElement>('button[data-date="2026-09-10"]')!
    fireEvent.mouseEnter(dayBtn)
    const hoverText = screen.getByTestId('heatmap-readout').textContent
    expect(hoverText).toContain('2/12')
    expect(hoverText).toContain('2026-09-10')
    fireEvent.focus(dayBtn)
    expect(screen.getByTestId('heatmap-readout').textContent).toBe(hoverText)
    controller.dispose()
  })

  it('auto-collapses 1-topic catalogs to Single-Topic Deep Dive with today checkbox, trend/weekday scrubbing, and same-day calendar drilldown focus', async () => {
    const read = makeTopic('read', '阅读')
    const { api } = buildMockHost([read], [
      { topicId: read.id, date: '2026-09-09' },
      { topicId: read.id, date: '2026-08-25' },
    ])
    const controller = new CheckinController(api)
    const signal = new AbortController().signal
    render(
      <CheckinPanel {...{ createController: () => controller, t: tZh, useTabInfo: () => ({ tab: { visible: true, signal } }) } as ComponentProps<typeof CheckinPanel>} />,
    )
    await screen.findByRole('grid')
    fireEvent.click(screen.getByRole('tab', { name: '统计' }))

    // Single topic auto-collapses: no multi-topic meter figure; shows Trend + Weekday + Today checkbox
    await screen.findByRole('figure', { name: '完成率阶段趋势' })
    expect(screen.queryByRole('figure', { name: '各主题完成情况' })).toBeNull()
    expect(screen.getByRole('figure', { name: '星期节律' })).toBeTruthy()

    // Toggle today's check-in directly from the Today Strip
    const todayBox = screen.getByRole('checkbox', { name: '完成 阅读' })
    fireEvent.click(todayBox)
    await screen.findByRole('checkbox', { name: '撤销 阅读' })
    expect(api.set).toHaveBeenCalledWith({ topicId: 'read', date: '2026-09-10', completed: true }, expect.any(AbortSignal))

    // Keyboard scrubbing across Trend SVG bands updates readout
    const trendFig = screen.getByRole('figure', { name: '完成率阶段趋势' })
    const trendBands = within(trendFig).getAllByRole('button').filter(el => el.tagName.toLowerCase() === 'rect')
    expect(trendBands.length).toBeGreaterThan(1)
    fireEvent.focus(trendBands[0]!)
    const firstTrendText = screen.getByTestId('trend-readout').textContent
    fireEvent.keyDown(trendBands[0]!, { key: 'ArrowRight' })
    expect(screen.getByTestId('trend-readout').textContent).not.toBe(firstTrendText)

    // Keyboard scrubbing across Weekday SVG bands updates readout
    const wdFig = screen.getByRole('figure', { name: '星期节律' })
    const wdBands = within(wdFig).getAllByRole('button').filter(el => el.tagName.toLowerCase() === 'rect')
    expect(wdBands).toHaveLength(7)
    fireEvent.focus(wdBands[0]!)
    expect(screen.getByTestId('weekday-readout').textContent).toContain('周一')
    fireEvent.keyDown(wdBands[0]!, { key: 'ArrowRight' })
    expect(screen.getByTestId('weekday-readout').textContent).toContain('周二')

    // Drill down to the SAME date (2026-09-10) already selected in Calendar -> focusDay restores focus!
    const heatFig = screen.getByRole('figure', { name: '打卡活跃热力图' })
    fireEvent.click(heatFig.querySelector<HTMLButtonElement>('button[data-date="2026-09-10"]')!)
    await screen.findByRole('grid')
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('button', { name: /^2026-09-10，/ })))

    // Drill down cross-month (2026-08-25) switches month and focuses that date
    fireEvent.click(screen.getByRole('tab', { name: '统计' }))
    const heatFig2 = await screen.findByRole('figure', { name: '打卡活跃热力图' })
    fireEvent.click(heatFig2.querySelector<HTMLButtonElement>('button[data-date="2026-08-25"]')!)
    await screen.findByRole('heading', { name: '2026 / 08' })
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('button', { name: /^2026-08-25，/ })))
    controller.dispose()
  })

  it('auto-recovers when selected topic is deleted concurrently and keeps split-pane + English copy clean', async () => {
    const read = makeTopic('read', 'Reading')
    const run = makeTopic('run', 'Exercise')
    const { api, dropTopic } = buildMockHost([read, run], [{ topicId: read.id, date: '2026-09-10' }])
    const firstCtrl = new CheckinController(api)
    const secondCtrl = new CheckinController(api)
    const sig1 = new AbortController().signal
    const sig2 = new AbortController().signal

    render(
      <>
        <CheckinPanel {...{ createController: () => firstCtrl, t: tEn, useTabInfo: () => ({ tab: { visible: true, signal: sig1 } }) } as ComponentProps<typeof CheckinPanel>} />
        <CheckinPanel {...{ createController: () => secondCtrl, t: tEn, useTabInfo: () => ({ tab: { visible: true, signal: sig2 } }) } as ComponentProps<typeof CheckinPanel>} />
      </>,
    )

    // Switch only the second pane to Statistics; first pane stays on Calendar!
    await waitFor(() => expect(screen.getAllByRole('grid')).toHaveLength(2))
    fireEvent.click(screen.getAllByRole('tab', { name: 'Statistics' })[1]!)
    await screen.findByText('Today 1/2')
    expect(screen.getAllByRole('grid')).toHaveLength(1)

    // Select Reading in Stats pane, then delete Reading behind the scenes and trigger refresh
    const meterFigure = screen.getByRole('figure', { name: 'Topics overview' })
    fireEvent.click(within(meterFigure).getByRole('button', { name: /^Reading/ }))
    await screen.findByRole('figure', { name: 'Completion trend' })
    dropTopic(read.id)
    fireEvent.click(screen.getByRole('button', { name: 'Refresh statistics' }))

    await screen.findByText('The selected topic was deleted. Switched to all topics.')
    expect(secondCtrl.getSnapshot().topicId).toBe('')
    firstCtrl.dispose()
    secondCtrl.dispose()
  })
})
