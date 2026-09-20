import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import React, { type ComponentProps } from 'react'
import { createPortal } from 'react-dom'
import { afterEach, expect, it, vi } from 'vitest'
import { CheckinPanel, CheckinTrigger } from '../src/client/CheckinPanel.tsx'
import { CheckinController, type CheckinApi } from '../src/client/controller.ts'
import { zh, type CheckinKey } from '../src/client/locales.ts'
import type { MonthResult, TopicId } from '../src/types.ts'

vi.mock('@deepseek-ai/dsh-client-ui-primitives', () => ({
  Button: ({ icon, children, variant, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { icon?: React.ReactNode; variant?: string }) => <button {...props} data-variant={variant}>{icon}{children}</button>,
  Menu: ({ open, anchor, items, onSelect }: {
    open: boolean
    anchor: React.ReactNode
    items: readonly { id: string; label: React.ReactNode; disabled?: boolean }[]
    onSelect: (id: string) => void
  }) => <span>{anchor}{open && createPortal(<div role="menu">{items.map(item => <button type="button" role="menuitem" disabled={item.disabled} key={item.id} onClick={() => onSelect(item.id)}>{item.label}</button>)}</div>, document.body)}</span>,
  Modal: ({ open, onClose, title, closeLabel, children, footer }: {
    open: boolean
    onClose: () => void
    title: string
    closeLabel: string
    children?: React.ReactNode
    footer?: React.ReactNode
  }) => open ? createPortal(<div role="dialog" aria-label={title}><button type="button" aria-label={closeLabel} onClick={onClose}>×</button>{children}{footer}</div>, document.body) : null,
}))
afterEach(() => { cleanup(); vi.restoreAllMocks() })
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
    exportData: vi.fn(async () => ({ filename: 'checkin.json', json: '{}' })),
    importData: vi.fn(async () => ({ importedTopics: 1, importedCompletions: 2, skippedTopics: 0 })),
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
    create: vi.fn(), update: vi.fn(), delete: vi.fn(), set: vi.fn(), exportData: vi.fn(), importData: vi.fn(),
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
    create: vi.fn(), update: vi.fn(), delete: vi.fn(), set: vi.fn(), exportData: vi.fn(), importData: vi.fn(),
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
    create: vi.fn(), update: vi.fn(), delete: vi.fn(), set: vi.fn(), exportData: vi.fn(), importData: vi.fn(),
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
    create: vi.fn(), update: vi.fn(), delete: vi.fn(), set: vi.fn(), exportData: vi.fn(), importData: vi.fn(),
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

it('downloads the Host-generated JSON backup', async () => {
  const { api, dispose } = mount()
  const createObjectURL = vi.fn((_blob: Blob) => 'blob:checkin-backup')
  Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: createObjectURL })
  Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: vi.fn() })
  const downloads: { name: string; href: string }[] = []
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
    downloads.push({ name: this.download, href: this.href })
  })
  try {
    await screen.findByRole('grid')
    fireEvent.click(screen.getByRole('button', { name: '数据' }))
    fireEvent.click(screen.getByRole('menuitem', { name: '导出 JSON' }))
    await waitFor(() => expect(downloads).toEqual([{ name: 'checkin.json', href: 'blob:checkin-backup' }]))
    expect(api.exportData).toHaveBeenCalledWith({}, expect.any(AbortSignal))
    expect((createObjectURL.mock.calls[0]?.[0] as Blob).type).toBe('application/json;charset=utf-8')
    expect(screen.getByRole('status').textContent).toBe('备份已生成并请求下载。')
    expect(document.querySelector('a[download]')).toBeNull()
  } finally { dispose() }
})

it('previews a JSON backup locally and imports only after confirmation', async () => {
  const { api, dispose } = mount()
  const json = JSON.stringify({
    format: 'dsh-checkin',
    version: 1,
    exportedAt: '2026-09-10T00:00:00.000Z',
    topics: [{ id: 'new', name: '新主题', createdAt: '2026-09-10T00:00:00.000Z', updatedAt: '2026-09-10T00:00:00.000Z' }],
    completions: [{ topicId: 'new', date: '2026-09-10', createdAt: '2026-09-10T00:00:00.000Z' }],
  })
  const file = new File([json], 'checkin.json', { type: 'application/json' })
  Object.defineProperty(file, 'text', { configurable: true, value: vi.fn(async () => json) })
  try {
    await screen.findByRole('grid')
    const input = screen.getByLabelText<HTMLInputElement>('选择 JSON 备份')
    fireEvent.change(input, { target: { files: [file] } })
    const dialog = await screen.findByRole('dialog', { name: '确认导入备份' })
    expect(dialog.textContent).toContain('文件：checkin.json；共 1 个主题、1 条打卡记录。')
    expect(dialog.textContent).toContain('已有相同主题 ID 将整项跳过')
    expect(api.importData).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: '取消' }))
    expect(api.importData).not.toHaveBeenCalled()
    fireEvent.change(input, { target: { files: [file] } })
    fireEvent.click(await screen.findByRole('button', { name: '确认导入' }))
    await waitFor(() => expect(api.importData).toHaveBeenCalledWith({ json }, expect.any(AbortSignal)))
    expect(screen.queryByRole('dialog', { name: '确认导入备份' })).toBeNull()
    expect(screen.getByRole('status').textContent).toContain('导入完成：新增 1 个主题和 2 条记录')
  } finally { dispose() }
})
