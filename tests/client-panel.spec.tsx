import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { ComponentProps } from 'react'
import { afterEach, expect, it, vi } from 'vitest'
import { CheckinPanel, CheckinTrigger } from '../src/client/CheckinPanel.tsx'
import { CheckinController, type CheckinApi } from '../src/client/controller.ts'
import { zh, type CheckinKey } from '../src/client/locales.ts'
import type { MonthResult, TopicId } from '../src/types.ts'
afterEach(cleanup)
const t = (key: CheckinKey, params?: Record<string, string | number>) => Object.entries(params ?? {}).reduce((text, [key, value]) => text.replaceAll(`{${key}}`, String(value)), zh[key])
const visibleTabSignal = new AbortController().signal
const visibleTab = () => ({ tab: { visible: true, signal: visibleTabSignal } })
function mount() {
  let data: MonthResult = { today: '2026-09-10', timeZone: 'Asia/Shanghai', from: '2026-09-01', to: '2026-09-30', month: '2026-09', refreshIntervalMs: 3000, topics: [{ id: 'read' as TopicId, name: '阅读', createdAt: '2026-09-10', updatedAt: '2026-09-10' }, { id: 'run' as TopicId, name: '运动', createdAt: '2026-09-10', updatedAt: '2026-09-10' }], completions: [] }
  const api: CheckinApi = {
    month: vi.fn(async () => data),
    create: vi.fn(async () => { throw new Error('checkin/duplicate-name') }),
    update: vi.fn(async () => ({})), delete: vi.fn(async () => ({})),
    set: vi.fn(async request => { data = { ...data, completions: request.completed ? [...data.completions, { topicId: request.topicId, date: request.date! }] : data.completions.filter(row => row.topicId !== request.topicId || row.date !== request.date) }; return {} }),
  }
  const controller = new CheckinController(api)
  render(<CheckinPanel {...{ createController: () => controller, t, useTabInfo: visibleTab } as ComponentProps<typeof CheckinPanel>} />)
  return { controller, api, dispose: () => { controller.dispose() } }
}
it('edits past days, disables future writes and filters topics', async () => {
  const { api, dispose } = mount()
  try {
    await screen.findByRole('grid')
    await waitFor(() => expect(screen.getByRole('button', { name: /^2026-09-10，/ }).tabIndex).toBe(0))
    fireEvent.click(screen.getByRole('button', { name: /^2026-09-09，/ }))
    fireEvent.click(screen.getByRole('checkbox', { name: '完成 阅读' }))
    await screen.findByRole('checkbox', { name: '撤销 阅读' })
    expect(api.set).toHaveBeenCalledWith({ topicId: 'read', date: '2026-09-09', completed: true }, expect.any(AbortSignal))
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'read' } })
    expect(screen.queryByRole('checkbox', { name: '完成 运动' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /^2026-09-11，/ }))
    expect((screen.getByRole('checkbox', { name: '完成 阅读' }) as HTMLButtonElement).disabled).toBe(true)
  } finally { dispose() }
})
it('keeps failed form input and requires a separate delete confirmation', async () => {
  const { api, dispose } = mount()
  try {
    await screen.findByRole('grid')
    fireEvent.click(screen.getByRole('button', { name: '新建主题' }))
    fireEvent.change(screen.getByRole('textbox'), { target: { value: '阅读' } })
    fireEvent.click(screen.getByRole('button', { name: '保存' }))
    await screen.findByRole('alert')
    expect((screen.getByRole('textbox') as HTMLInputElement).value).toBe('阅读')
    expect(screen.getByRole('alert').textContent).toContain('已有同名主题')
    fireEvent.click(screen.getByRole('button', { name: '取消' }))
    fireEvent.click(screen.getByRole('button', { name: '删除主题 阅读' }))
    expect(api.delete).not.toHaveBeenCalled()
    expect(document.activeElement).toBe(screen.getByRole('button', { name: '取消' }))
    fireEvent.click(screen.getByRole('button', { name: '确认删除' }))
    await waitFor(() => expect(api.delete).toHaveBeenCalledTimes(1))
  } finally { dispose() }
})
it('moves calendar focus with arrow keys without submitting a completion', async () => {
  const { api, dispose } = mount()
  try {
    await screen.findByRole('grid')
    const today = screen.getByRole('button', { name: /^2026-09-10，/ })
    fireEvent.keyDown(today, { key: 'ArrowLeft' })
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('button', { name: /^2026-09-09，/ })))
    expect(api.set).not.toHaveBeenCalled()
  } finally { dispose() }
})

it('restores focus to month navigation after loading', async () => {
  const { api, dispose } = mount()
  try {
    await screen.findByRole('grid')
    const initial = await api.month({}, new AbortController().signal)
    api.month = vi.fn(async () => ({ ...initial, month: '2026-08', from: '2026-08-01', to: '2026-08-31' }))
    fireEvent.click(screen.getByRole('button', { name: '上个月' }))
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('button', { name: '上个月' })))
    expect(screen.getByRole('heading', { name: '2026 / 08' })).toBeTruthy()
  } finally { dispose() }
})

it('loads only while its host tab is visible', async () => {
  const api: CheckinApi = {
    month: vi.fn(async () => ({ today: '2026-09-10', timeZone: 'Asia/Shanghai', from: '2026-09-01', to: '2026-09-30', month: '2026-09', refreshIntervalMs: 3000, topics: [], completions: [] })),
    create: vi.fn(), update: vi.fn(), delete: vi.fn(), set: vi.fn(),
  }
  const controller = new CheckinController(api)
  let visible = false
  const signal = new AbortController().signal
  const useTabInfo = () => ({ tab: { visible, signal } })
  const props = { createController: () => controller, t, useTabInfo } as ComponentProps<typeof CheckinPanel>
  const view = render(<CheckinPanel {...props} />)
  expect(api.month).not.toHaveBeenCalled()
  visible = true
  view.rerender(<CheckinPanel {...props} />)
  await waitFor(() => expect(api.month).toHaveBeenCalledOnce())
  controller.dispose()
})

it('cancels an in-flight read when the host tab is hidden', async () => {
  let requestSignal: AbortSignal | undefined
  const api: CheckinApi = {
    month: vi.fn((_request, signal) => { requestSignal = signal; return new Promise<MonthResult>(() => {}) }),
    create: vi.fn(), update: vi.fn(), delete: vi.fn(), set: vi.fn(),
  }
  const controller = new CheckinController(api)
  let visible = true
  const signal = new AbortController().signal
  const useTabInfo = () => ({ tab: { visible, signal } })
  const props = { createController: () => controller, t, useTabInfo } as ComponentProps<typeof CheckinPanel>
  const view = render(<CheckinPanel {...props} />)
  await waitFor(() => expect(requestSignal).toBeInstanceOf(AbortSignal))
  visible = false
  view.rerender(<CheckinPanel {...props} />)
  expect(requestSignal?.aborted).toBe(true)
})

it('cancels an in-flight read when the host ends the tab lifetime', async () => {
  let requestSignal: AbortSignal | undefined
  const api: CheckinApi = {
    month: vi.fn((_request, signal) => { requestSignal = signal; return new Promise<MonthResult>(() => {}) }),
    create: vi.fn(), update: vi.fn(), delete: vi.fn(), set: vi.fn(),
  }
  const controller = new CheckinController(api)
  const lifetime = new AbortController()
  render(<CheckinPanel {...{ createController: () => controller, t, useTabInfo: () => ({ tab: { visible: true, signal: lifetime.signal } }) } as ComponentProps<typeof CheckinPanel>} />)
  await waitFor(() => expect(requestSignal).toBeInstanceOf(AbortSignal))
  lifetime.abort()
  expect(requestSignal?.aborted).toBe(true)
})

it('keeps split-pane tab state and requests independent', async () => {
  const createController = vi.fn(() => new CheckinController({
    month: vi.fn(async request => {
      const value = request.month ?? '2026-09'
      return { today: '2026-09-10', timeZone: 'Asia/Shanghai', from: `${value}-01`, to: `${value}-${value === '2026-09' ? '30' : '31'}`, month: value, refreshIntervalMs: 3000, topics: [{ id: 'read' as TopicId, name: '阅读', createdAt: '2026-09-10', updatedAt: '2026-09-10' }], completions: [] }
    }),
    create: vi.fn(), update: vi.fn(), delete: vi.fn(), set: vi.fn(),
  }))
  const first = new AbortController().signal
  const second = new AbortController().signal
  render(<>
    <CheckinPanel {...{ createController, t, useTabInfo: () => ({ tab: { visible: true, signal: first } }) } as ComponentProps<typeof CheckinPanel>} />
    <CheckinPanel {...{ createController, t, useTabInfo: () => ({ tab: { visible: true, signal: second } }) } as ComponentProps<typeof CheckinPanel>} />
  </>)
  await waitFor(() => expect(screen.getAllByRole('heading', { name: '2026 / 09' })).toHaveLength(2))
  fireEvent.click(screen.getAllByRole('button', { name: '上个月' })[0]!)
  await screen.findByRole('heading', { name: '2026 / 08' })
  expect(screen.getAllByRole('heading', { name: '2026 / 09' })).toHaveLength(1)
  expect(createController).toHaveBeenCalledTimes(2)
})

it('opens the host right tab from the sidebar entry', () => {
  const openPanel = vi.fn()
  render(<CheckinTrigger {...{ openPanel, t, wide: true } as ComponentProps<typeof CheckinTrigger>} />)
  fireEvent.click(screen.getByRole('button', { name: '打开打卡' }))
  expect(openPanel).toHaveBeenCalledOnce()
})

it.each([
  ['checkin/invalid-config', zh.databaseConfig],
  ['checkin/unauthorized', zh.unauthorized],
  ['checkin/quota-exceeded', zh.quota],
  ['checkin/write-uncertain', zh.writeUncertain],
  ['checkin/invalid-schema', zh.invalidSchema],
  ['checkin/query-rejected', zh.queryRejected],
  ['checkin/api-unavailable', zh.apiUnavailable],
  ['checkin/request-too-large', zh.requestTooLarge],
  ['checkin/concurrent-change', zh.concurrentChange],
])('preserves input and offers a read-only retry for %s', async (code, message) => {
  const { api, dispose } = mount()
  try {
    api.create = vi.fn(async () => { throw new Error(code) })
    await screen.findByRole('grid')
    fireEvent.click(screen.getByRole('button', { name: '新建主题' }))
    fireEvent.change(screen.getByRole('textbox'), { target: { value: '新主题' } })
    fireEvent.click(screen.getByRole('button', { name: '保存' }))
    expect((await screen.findByRole('alert')).textContent).toContain(message)
    expect((screen.getByRole('textbox') as HTMLInputElement).value).toBe('新主题')
    const reads = vi.mocked(api.month).mock.calls.length
    fireEvent.click(screen.getByRole('button', { name: '重试' }))
    await waitFor(() => expect(vi.mocked(api.month).mock.calls.length).toBeGreaterThan(reads))
    expect(api.create).toHaveBeenCalledTimes(1)
  } finally { dispose() }
})
