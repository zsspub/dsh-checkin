import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { ComponentProps } from 'react'
import { afterEach, expect, it, vi } from 'vitest'
import { CheckinPanel } from '../src/client/CheckinPanel.tsx'
import { CheckinController, type CheckinApi } from '../src/client/controller.ts'
import { zh, type CheckinKey } from '../src/client/locales.ts'
import type { MonthResult, TopicId } from '../src/types.ts'
afterEach(cleanup)
const t = (key: CheckinKey, params?: Record<string, string | number>) => Object.entries(params ?? {}).reduce((text, [key, value]) => text.replaceAll(`{${key}}`, String(value)), zh[key])
function mount() {
  let data: MonthResult = { today: '2026-09-10', timeZone: 'Asia/Shanghai', from: '2026-09-01', to: '2026-09-30', month: '2026-09', refreshIntervalMs: 3000, topics: [{ id: 'read' as TopicId, name: '阅读', createdAt: '2026-09-10', updatedAt: '2026-09-10' }, { id: 'run' as TopicId, name: '运动', createdAt: '2026-09-10', updatedAt: '2026-09-10' }], completions: [] }
  const api: CheckinApi = {
    month: vi.fn(async () => data),
    create: vi.fn(async () => { throw new Error('checkin/duplicate-name') }),
    update: vi.fn(async () => ({})), delete: vi.fn(async () => ({})),
    set: vi.fn(async request => { data = { ...data, completions: request.completed ? [...data.completions, { topicId: request.topicId, date: request.date! }] : data.completions.filter(row => row.topicId !== request.topicId || row.date !== request.date) }; return {} }),
  }
  const controller = new CheckinController(api)
  const opener = document.createElement('button'); opener.textContent = 'opener'; document.body.append(opener); opener.focus()
  render(<CheckinPanel {...{ controller, t } as ComponentProps<typeof CheckinPanel>} />)
  act(() => controller.open())
  return { controller, api, dispose: () => { controller.dispose(); opener.remove() }, opener }
}
it('edits past days, disables future writes, filters topics and restores focus on Escape', async () => {
  const { api, dispose, opener } = mount()
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
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('dialog')).toBeNull(); expect(document.activeElement).toBe(opener)
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
