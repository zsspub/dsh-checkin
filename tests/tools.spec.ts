import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import type { ToolDefinition, ToolRunContext } from '@deepseek-ai/dsh-tools'
import { afterEach, expect, it } from 'vitest'
import CheckinService from '../src/index.ts'
import { apply } from '../src/tools.ts'
import type { Topic } from '../src/types.ts'
const contexts: Context[] = [], dirs: string[] = []
afterEach(async () => { for (const ctx of contexts.splice(0)) await ctx.fiber.dispose(); for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true }) })
it('replays topic CRUD and completion tool output against the real Host service', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'checkin-tools-')); dirs.push(dir)
  const ctx = new Context(); contexts.push(ctx)
  await ctx.plugin(CheckinService, { databasePath: join(dir, 'db.sqlite'), busyTimeoutMs: 1000, refreshIntervalMs: 3000 })
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
  const dir = mkdtempSync(join(tmpdir(), 'checkin-errors-')); dirs.push(dir)
  const ctx = new Context(); contexts.push(ctx)
  await ctx.plugin(CheckinService, { databasePath: join(dir, 'db.sqlite'), busyTimeoutMs: 1000, refreshIntervalMs: 3000 })
  const abort = new AbortController(); abort.abort()
  await expect(ctx.checkin.create({ name: 'no write' }, abort.signal)).rejects.toThrow()
  expect((await ctx.checkin.list(new AbortController().signal)).topics).toHaveLength(0)
  await expect(ctx.checkin.create({ name: '' }, new AbortController().signal)).rejects.toMatchObject({ code: 'checkin/invalid-name' })
})
