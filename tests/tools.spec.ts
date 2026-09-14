import { Context } from '@deepseek-ai/cordis'
import type { ToolDefinition, ToolRunContext } from '@deepseek-ai/dsh-tools'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import CheckinService from '../src/index.ts'
import { apply } from '../src/tools.ts'
import type { Topic, TopicId } from '../src/types.ts'
import { config, mockDatabase } from './helpers/pub-database.ts'
const contexts: Context[] = []
beforeEach(() => { mockDatabase() })
afterEach(async () => { for (const ctx of contexts.splice(0)) await ctx.fiber.dispose(); vi.unstubAllGlobals(); vi.unstubAllEnvs() })
it('replays topic CRUD and completion tool output against the real Host service', async () => {
  const ctx = new Context(); contexts.push(ctx)
  await ctx.plugin(CheckinService, { ...config, refreshIntervalMs: 30000 })
  const tools = new Map<string, ToolDefinition>(), disposers: (() => void)[] = []
  apply({ checkin: ctx.checkin, effect: (setup: () => () => void) => { disposers.push(setup()) }, tools: { register: (tool: ToolDefinition) => { tools.set(tool.name, tool); return () => { tools.delete(tool.name) } } } } as unknown as Context)
  const signal = new AbortController().signal
  const run: ToolRunContext = { signal, concludeTurn() {}, deferContext() {}, callId: 'test' as ToolRunContext['callId'], rootCallId: 'test' as ToolRunContext['rootCallId'], token: {} as ToolRunContext['token'], name: 'test', arguments: {} }
  const invoke = async (name: string, args: unknown) => {
    const tool = tools.get(name)!
    const value = await tool.execute(args, run)
    return { value, text: tool.output.render(args, value as Parameters<typeof tool.output.render>[1]) }
  }
  const created = await invoke('checkin_topic_create', { name: '阅读' }); const topic = created.value as Topic
  expect((await ctx.checkin.list(signal)).topics).toContainEqual(topic)
  const completed = await invoke('checkin_set', { topicId: topic.id, date: '2024-02-29', completed: true })
  const queried = await invoke('checkin_query', { from: '2024-02-28', to: '2024-03-01' })
  const renamed = await invoke('checkin_topic_update', { id: topic.id, name: '读书' })
  const undone = await invoke('checkin_set', { topicId: topic.id, date: '2024-02-29', completed: false })
  const deleted = await invoke('checkin_topic_delete', { id: topic.id })
  const empty = await invoke('checkin_topic_list', {})
  const normalize = (value: unknown): unknown => JSON.parse(JSON.stringify(value).replaceAll(topic.id, '<topic-id>').replace(/\d{4}-\d{2}-\d{2}T[^"\\]+Z/gu, '<timestamp>').replace(/"today":"[^"]+"/gu, '"today":"<today>"').replace(/\\"today\\":\\"[^\\]+\\"/gu, '\\"today\\":\\"<today>\\"'))
  expect(normalize([created, completed, queried, renamed, undone, deleted, empty])).toMatchSnapshot()
  await expect(invoke('checkin_set', { topicId: topic.id, date: '2024-02-29', completed: 'yes' })).rejects.toThrow()
  for (const dispose of disposers) dispose()
  expect(tools.size).toBe(0)
})
it('exposes cancellation and typed business failures over the Host API', async () => {
  const ctx = new Context(); contexts.push(ctx)
  await ctx.plugin(CheckinService, { ...config, refreshIntervalMs: 30000 })
  const abort = new AbortController(); abort.abort()
  await expect(ctx.checkin.create({ name: 'no write' }, abort.signal)).rejects.toThrow()
  expect((await ctx.checkin.list(new AbortController().signal)).topics).toHaveLength(0)
  await expect(ctx.checkin.create({ name: '' }, new AbortController().signal)).rejects.toMatchObject({ code: 'checkin/invalid-name' })
})

it('loads a complete month through the asynchronous database service', async () => {
  const ctx = new Context(); contexts.push(ctx)
  await ctx.plugin(CheckinService, { ...config, refreshIntervalMs: 30000 })
  const signal = new AbortController().signal
  const topic = await ctx.checkin.create({ name: '阅读' }, signal)
  await ctx.checkin.set({ topicId: topic.id, date: '2024-02-29', completed: true }, signal)
  expect(await ctx.checkin.month({ month: '2024-02' }, signal)).toMatchObject({
    month: '2024-02', from: '2024-02-01', to: '2024-02-29', refreshIntervalMs: 30000,
    completions: [{ topicId: topic.id, date: '2024-02-29' }],
  })
  expect((await ctx.checkin.month({}, signal)).month).toMatch(/^\d{4}-\d{2}$/u)
})

it('starts with the bundle defaults and Host-only environment credentials', async () => {
  vi.stubEnv('PUB_DATABASE_KEY', config.apiKey!)
  vi.stubEnv('PUB_DATABASE_ID', config.databaseId!)
  const ctx = new Context(); contexts.push(ctx)
  await ctx.plugin(CheckinService, CheckinService.Config())
  const result = await ctx.checkin.month({}, new AbortController().signal)
  expect(result.refreshIntervalMs).toBe(30000)
  expect(result.topics).toEqual([])
  expect(JSON.stringify(result)).not.toContain(config.apiKey)
  expect(JSON.stringify(result)).not.toContain(config.databaseId)
})

it.each([
  ['', ''],
  ['', config.databaseId!],
  [config.apiKey!, ''],
  [config.apiKey!, 'not-a-uuid'],
])('loads the Host service with incomplete database settings and rejects only check-in requests', async (key, id) => {
  vi.stubEnv('PUB_DATABASE_KEY', key)
  vi.stubEnv('PUB_DATABASE_ID', id)
  const ctx = new Context(); contexts.push(ctx)
  await ctx.plugin(CheckinService, CheckinService.Config())
  expect(ctx.checkin).toBeDefined()
  const signal = new AbortController().signal
  const topicId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' as TopicId
  const requests = [
    () => ctx.checkin.list(signal),
    () => ctx.checkin.month({}, signal),
    () => ctx.checkin.create({ name: '阅读' }, signal),
    () => ctx.checkin.update({ id: topicId, name: '读书' }, signal),
    () => ctx.checkin.delete({ id: topicId }, signal),
    () => ctx.checkin.set({ topicId, date: '2024-02-29', completed: true }, signal),
    () => ctx.checkin.query({ from: '2024-02-01', to: '2024-02-29' }, signal),
  ]
  for (const request of requests) await expect(request()).rejects.toMatchObject({ code: 'checkin/invalid-config' })
  expect(fetch).not.toHaveBeenCalled()
})

it('retries lazy initialization when the Host environment is configured later', async () => {
  vi.stubEnv('PUB_DATABASE_KEY', '')
  vi.stubEnv('PUB_DATABASE_ID', '')
  const ctx = new Context(); contexts.push(ctx)
  await ctx.plugin(CheckinService, CheckinService.Config())
  const signal = new AbortController().signal
  await expect(ctx.checkin.list(signal)).rejects.toMatchObject({ code: 'checkin/invalid-config' })
  vi.stubEnv('PUB_DATABASE_KEY', config.apiKey!)
  vi.stubEnv('PUB_DATABASE_ID', config.databaseId!)
  expect((await ctx.checkin.list(signal)).topics).toEqual([])
})

it('does not initialize a database for a cancelled request or after service disposal', async () => {
  const ctx = new Context()
  await ctx.plugin(CheckinService, { ...config, refreshIntervalMs: 30000 })
  const service = ctx.checkin
  await expect(service.list(AbortSignal.abort())).rejects.toThrow()
  await ctx.fiber.dispose()
  await expect(service.list(new AbortController().signal)).rejects.toThrow()
  expect(fetch).not.toHaveBeenCalled()
})
