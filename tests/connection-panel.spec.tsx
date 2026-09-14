import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { ComponentProps } from 'react'
import { afterEach, expect, it, vi } from 'vitest'
import { ConnectionPanel } from '../src/client/ConnectionPanel.tsx'
import { CheckinPanel } from '../src/client/CheckinPanel.tsx'
import { CheckinController, type CheckinApi } from '../src/client/controller.ts'
import { ConnectionController, secureKeyTransport, type ConnectionApi } from '../src/client/connection-controller.ts'
import { zh, type CheckinKey } from '../src/client/locales.ts'
import type { ConnectionState, DatabaseResources, MonthResult } from '../src/types.ts'

const controllers: ConnectionController[] = []
afterEach(() => { cleanup(); for (const controller of controllers.splice(0)) controller.dispose() })
const t = (key: CheckinKey, params?: Record<string, string | number>) => Object.entries(params ?? {}).reduce((text, [name, value]) => text.replaceAll(`{${name}}`, String(value)), zh[key])
const tables = { tableName: 'checkin_topics', recordsTableName: 'checkin_records' }
const resources: DatabaseResources = { enabled: true, limits: { maxDatabases: 3, maxTables: 20, maxBytes: 100000 }, databases: [{ id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', name: 'existing', status: 'ready', usedBytes: 16384, tables: [{ name: 'checkin_topics' }, { name: 'checkin_records' }] }] }
function fixture() {
  let state: ConnectionState = { phase: 'login', source: 'none', writable: true, revision: 'none' }
  const api: ConnectionApi = {
    connection: vi.fn(async () => state),
    resources: vi.fn(async () => resources),
    login: vi.fn(async () => state = { phase: 'setup', source: 'saved', writable: true, revision: 'setup' }),
    connect: vi.fn(async request => state = { phase: 'connected', source: 'saved', writable: true, revision: 'connected', ...request }),
    initialize: vi.fn(async request => state = { phase: 'connected', source: 'saved', writable: true, revision: 'created', databaseId: resources.databases[0]!.id, tableName: request.tableName, recordsTableName: request.recordsTableName }),
    logout: vi.fn(async () => state = { phase: 'login', source: 'none', writable: true, revision: 'none' }),
  }
  const controller = new ConnectionController(api); controllers.push(controller)
  return { api, controller }
}
async function mount() {
  const fixtureValue = fixture()
  await fixtureValue.controller.refresh()
  render(<ConnectionPanel controller={fixtureValue.controller} t={t as ComponentProps<typeof ConnectionPanel>['t']} />)
  return fixtureValue
}
it('offers safe registration links, masks the key and clears it after verification', async () => {
  const { api } = await mount()
  expect(screen.getByRole('link', { name: '注册账号' }).getAttribute('href')).toBe('https://zss.pub/register')
  const link = screen.getByRole('link', { name: '生成数据库 Key' })
  expect(link.getAttribute('href')).toBe('https://zss.pub/databases')
  expect(link.getAttribute('rel')).toContain('noreferrer')
  const input = screen.getByLabelText('数据库 Key') as HTMLInputElement
  expect(input.type).toBe('password')
  fireEvent.change(input, { target: { value: 'test-secret' } })
  fireEvent.click(screen.getByRole('button', { name: '显示 Key' }))
  expect(input.type).toBe('text')
  fireEvent.click(screen.getByRole('button', { name: '验证并继续' }))
  await screen.findByRole('heading', { name: '准备打卡数据库' })
  expect(api.login).toHaveBeenCalledWith({ apiKey: 'test-secret' }, expect.any(AbortSignal))
  expect(api.initialize).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: '更新 Key' }))
  expect((screen.getByLabelText('数据库 Key') as HTMLInputElement).value).toBe('')
})
it('preserves a rejected key and permits retry', async () => {
  const { api } = await mount()
  vi.mocked(api.login).mockRejectedValueOnce(new Error('checkin/unauthorized'))
  fireEvent.change(screen.getByLabelText('数据库 Key'), { target: { value: 'retry-secret' } })
  fireEvent.click(screen.getByRole('button', { name: '验证并继续' }))
  await screen.findByRole('alert')
  expect((screen.getByLabelText('数据库 Key') as HTMLInputElement).value).toBe('retry-secret')
  fireEvent.click(screen.getByRole('button', { name: '验证并继续' }))
  await screen.findByRole('heading', { name: '准备打卡数据库' })
})
it('shows quota and schema before explicit creation, then requires confirmation to disconnect', async () => {
  const { controller, api } = await mount()
  await act(() => controller.run((host, signal) => host.login({ apiKey: 'test' }, signal)))
  await screen.findByRole('button', { name: '确认创建并连接' })
  expect(screen.getByText('数据库 1 / 3')).toBeTruthy()
  expect(screen.getByText('PRIMARY KEY (topic_id, date)')).toBeTruthy()
  expect(screen.queryByText('completed_dates JSON')).toBeNull()
  expect(api.initialize).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: '确认创建并连接' }))
  await screen.findByText('连接信息')
  expect(api.initialize).toHaveBeenCalledWith({ databaseName: 'dsh_checkin', ...tables, confirmed: true }, expect.any(AbortSignal))
  fireEvent.click(screen.getByText('连接信息'))
  fireEvent.click(screen.getByRole('button', { name: '退出连接' }))
  expect(api.logout).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: '确认退出' }))
  await screen.findByRole('heading', { name: '连接 zss.pub' })
  expect(api.logout).toHaveBeenCalledTimes(1)
})
it('connects two existing tables without initializing them', async () => {
  const { controller, api } = await mount()
  await act(() => controller.run((host, signal) => host.login({ apiKey: 'test' }, signal)))
  fireEvent.change(await screen.findByLabelText('数据库'), { target: { value: resources.databases[0]!.id } })
  fireEvent.change(screen.getByLabelText('主题表'), { target: { value: 'checkin_topics' } })
  fireEvent.change(screen.getByLabelText('打卡记录表'), { target: { value: 'checkin_records' } })
  fireEvent.click(screen.getByRole('button', { name: '检查并连接' }))
  await screen.findByText('连接信息')
  expect(api.connect).toHaveBeenCalledTimes(1)
  expect(api.initialize).not.toHaveBeenCalled()
})
it('resumes partial setup by explicitly choosing one existing table', async () => {
  const { controller, api } = await mount()
  await act(() => controller.run((host, signal) => host.login({ apiKey: 'test' }, signal)))
  fireEvent.change(await screen.findByLabelText('数据库'), { target: { value: resources.databases[0]!.id } })
  fireEvent.change(screen.getByLabelText('主题表'), { target: { value: 'checkin_topics' } })
  fireEvent.click(screen.getByRole('button', { name: '确认创建并连接' }))
  await screen.findByText('连接信息')
  expect(api.initialize).toHaveBeenCalledWith({ databaseId: resources.databases[0]!.id, ...tables, useExistingTopics: true, confirmed: true }, expect.any(AbortSignal))
})
it('blocks identical table names before submission', async () => {
  const { controller, api } = await mount()
  await act(() => controller.run((host, signal) => host.login({ apiKey: 'test' }, signal)))
  fireEvent.change(await screen.findByLabelText('新打卡记录表名称'), { target: { value: 'checkin_topics' } })
  expect(screen.getByRole('alert').textContent).toBe(zh.distinctTables)
  expect((screen.getByRole('button', { name: '确认创建并连接' }) as HTMLButtonElement).disabled).toBe(true)
  expect(api.initialize).not.toHaveBeenCalled()
})
it.each([
  ['https:', 'example.com', true], ['http:', 'localhost', true], ['http:', '127.0.0.1', true],
  ['http:', '[::1]', true], ['http:', 'example.com', false], ['http:', 'localhost.example.com', false],
])('requires encrypted or loopback key transport: %s %s', (protocol, hostname, allowed) => {
  expect(secureKeyTransport({ protocol, hostname })).toBe(allowed)
})
it('renders login instead of calendar controls and enters the calendar without a Host restart', async () => {
  const { controller: connection } = fixture()
  const month: MonthResult = { today: '2026-09-13', timeZone: 'Asia/Shanghai', from: '2026-09-01', to: '2026-09-30', month: '2026-09', topics: [], completions: [], refreshIntervalMs: 30000 }
  const api: CheckinApi = { month: vi.fn(async () => month), create: vi.fn(), update: vi.fn(), delete: vi.fn(), set: vi.fn() }
  const controller = new CheckinController(api, connection)
  const tabSignal = new AbortController().signal
  render(<CheckinPanel {...{ createController: () => controller, t, useTabInfo: () => ({ tab: { visible: true, signal: tabSignal } }) } as ComponentProps<typeof CheckinPanel>} />)
  await screen.findByRole('heading', { name: '连接 zss.pub' })
  expect(screen.queryByRole('button', { name: '新建主题' })).toBeNull()
  expect(api.month).not.toHaveBeenCalled()
  await act(() => connection.run((host, signal) => host.login({ apiKey: 'test' }, signal)))
  await act(() => connection.run((host, signal) => host.connect({ databaseId: resources.databases[0]!.id, ...tables }, signal)))
  await screen.findByRole('heading', { name: '从一个小习惯开始' })
  expect(api.month).toHaveBeenCalled()
  await act(() => connection.run((host, signal) => host.logout(signal)))
  await screen.findByRole('heading', { name: '连接 zss.pub' })
  expect(screen.queryByRole('button', { name: '新建主题' })).toBeNull()
})
it('invalidates all tab controllers and discards a late response on logout', async () => {
  const { controller: connection } = fixture()
  await connection.run((host, signal) => host.login({ apiKey: 'test' }, signal))
  await connection.run((host, signal) => host.connect({ databaseId: resources.databases[0]!.id, ...tables }, signal))
  let resolve!: (value: MonthResult) => void
  const pending = new Promise<MonthResult>(complete => { resolve = complete })
  const month: MonthResult = { today: '2026-09-13', timeZone: 'Asia/Shanghai', from: '2026-09-01', to: '2026-09-30', month: '2026-09', topics: [], completions: [], refreshIntervalMs: 30000 }
  const api: CheckinApi = { month: vi.fn(async () => pending), create: vi.fn(), update: vi.fn(), delete: vi.fn(), set: vi.fn() }
  const first = new CheckinController(api, connection), second = new CheckinController(api, connection)
  const reading = first.refresh()
  await waitFor(() => expect(api.month).toHaveBeenCalledTimes(1))
  await connection.run((host, signal) => host.logout(signal))
  resolve(month)
  await reading
  expect(first.getSnapshot().data).toBeNull()
  expect(second.getSnapshot().data).toBeNull()
  first.dispose(); second.dispose()
})
