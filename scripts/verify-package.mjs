import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'
import { DatabaseSync } from 'node:sqlite'

// Resolve only from an independently installed tarball, never the source workspace.
const installDirectory = process.argv[2]
if (installDirectory === undefined) throw new Error('Usage: node scripts/verify-package.mjs <installation directory>')
const installed = createRequire(join(resolve(installDirectory), 'package.json'))
const { default: CheckinService } = await import(pathToFileURL(installed.resolve('dsh-checkin')))
const { apply } = await import(pathToFileURL(installed.resolve('dsh-checkin/tools')))
const { default: remote } = await import(pathToFileURL(installed.resolve('dsh-checkin/remote')))
const requirePlugin = createRequire(installed.resolve('dsh-checkin'))
const { Context } = await import(pathToFileURL(requirePlugin.resolve('@deepseek-ai/cordis')))
const dir = mkdtempSync(join(tmpdir(), 'dsh-checkin-packed-'))
const databasePath = join(dir, 'checkin.sqlite3')
let ctx = new Context()
let disposed = false
try {
  await ctx.plugin(CheckinService, { databasePath, busyTimeoutMs: 1000, refreshIntervalMs: 3000 })
  const tools = new Map()
  const disposers = []
  apply({ checkin: ctx.checkin, effect: setup => { disposers.push(setup()) }, tools: { register: tool => { tools.set(tool.name, tool); return () => tools.delete(tool.name) } } })
  assert.equal(tools.size, 6)
  const signal = new AbortController().signal
  const exec = { signal, callId: 'packed-smoke', rootCallId: 'packed-smoke', token: {}, name: 'packed-smoke', arguments: {}, concludeTurn() {}, deferContext() {} }
  const call = (name, args) => tools.get(name).execute(args, exec)
  const topic = await call('checkin_topic_create', { name: '临时验收主题' })
  await call('checkin_topic_update', { id: topic.id, name: '临时主题已改名' })
  await call('checkin_set', { topicId: topic.id, date: '2024-02-29', completed: true })
  assert.equal((await call('checkin_query', { from: '2024-02-01', to: '2024-02-29' })).completions.length, 1)
  const backup = await ctx.checkin.exportData({}, signal)
  assert.equal(JSON.parse(backup.json).version, 2)
  assert.deepEqual(await ctx.checkin.importData({ json: backup.json }, signal), { importedTopics: 0, importedCompletions: 0, skippedTopics: 1 })
  assert.equal(remote.descriptors.length, 9)
  for (const method of Object.values(remote.methods)) {
    method.input().create()
    method.input({ strict: true }).create()
    method.result.create()
  }
  await ctx.fiber.dispose()
  ctx = new Context()
  await ctx.plugin(CheckinService, { databasePath, busyTimeoutMs: 1000, refreshIntervalMs: 3000 })
  assert.equal((await ctx.checkin.query({ from: '2024-02-01', to: '2024-02-29' }, signal)).completions.length, 1)
  await ctx.checkin.set({ topicId: topic.id, date: '2024-02-29', completed: false }, signal)
  assert.equal((await ctx.checkin.delete({ id: topic.id }, signal)).deletedRecords, 0)
  assert.equal((await ctx.checkin.list(signal)).topics.length, 0)
  for (const dispose of disposers) dispose()
  assert.equal(tools.size, 0)
  await ctx.fiber.dispose()
  disposed = true
  const db = new DatabaseSync(databasePath, { readOnly: true })
  assert.equal(db.prepare('PRAGMA integrity_check').get().integrity_check, 'ok')
  assert.equal(db.prepare('PRAGMA user_version').get().user_version, 2)
  db.close()
  console.log(JSON.stringify({ node: process.version, packedHost: 'passed', tools: 6, remoteMethods: 9, sqlite: 'ok', schema: 2, persistence: 'passed', backupRoundTrip: 'passed' }))
} finally {
  if (!disposed) await ctx.fiber.dispose()
  rmSync(dir, { recursive: true, force: true })
}
