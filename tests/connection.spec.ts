import { Context } from '@deepseek-ai/cordis'
import type { CredentialProvider, CredentialRecord } from '@deepseek-ai/dsh-credentials'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import CheckinService from '../src/index.ts'
import { config, databaseId, mockDatabase, sqlRequest } from './helpers/pub-database.ts'

const contexts: Context[] = []
const signal = () => new AbortController().signal
const tables = { tableName: 'checkin_topics', recordsTableName: 'checkin_records' }
beforeEach(() => { vi.stubEnv('PUB_DATABASE_KEY', ''); vi.stubEnv('PUB_DATABASE_ID', '') })
afterEach(async () => { for (const ctx of contexts.splice(0)) await ctx.fiber.dispose(); vi.unstubAllGlobals(); vi.unstubAllEnvs() })
function credentials() {
  let record: CredentialRecord | undefined
  return {
    readRecord: vi.fn(async () => record),
    modifyRecord: vi.fn(async (_key, mutate: (current: CredentialRecord | undefined) => Promise<CredentialRecord | undefined>) => {
      const next = await mutate(record)
      if (next !== undefined) record = structuredClone(next)
      return record
    }),
    deleteRecord: vi.fn(async () => { record = undefined }),
  }
}
async function mount(provider = credentials(), external = {}) {
  const ctx = new Context(); contexts.push(ctx)
  ctx.provide('credentials')
  ctx.set('credentials', provider as unknown as CredentialProvider)
  await ctx.plugin(CheckinService, { ...CheckinService.Config(), ...external })
  return { service: ctx.checkin, provider }
}
it('starts logged out, verifies without writes, persists setup and never returns the key', async () => {
  const mock = mockDatabase(), { service, provider } = await mount()
  expect((await service.connection(signal())).phase).toBe('login')
  const state = await service.login({ apiKey: config.apiKey! }, signal())
  expect(state.phase).toBe('setup')
  expect(JSON.stringify(state)).not.toContain(config.apiKey)
  expect(mock.fetcher.mock.calls.every(([, init]) => init?.method === 'GET')).toBe(true)
  const restarted = await mount(provider)
  expect((await restarted.service.connection(signal())).phase).toBe('setup')
  await service.connect({ databaseId, ...tables }, signal())
  expect((await restarted.service.connection(signal())).phase).toBe('connected')
  expect((await restarted.service.list(signal())).topics).toEqual([])
  await service.logout(signal())
  expect((await restarted.service.connection(signal())).phase).toBe('login')
  expect(provider.deleteRecord).toHaveBeenCalledTimes(1)
  await expect(restarted.service.list(signal())).rejects.toMatchObject({ code: 'checkin/invalid-config' })
  expect(mock.fetcher.mock.calls.every(([, init]) => init?.method !== 'DELETE')).toBe(true)
})
it.each([401, 403, 503])('does not persist rejected credentials or leak API error bodies (%s)', async status => {
  vi.stubGlobal('fetch', vi.fn(async () => Response.json({ message: config.apiKey }, { status })))
  const { service, provider } = await mount()
  await expect(service.login({ apiKey: config.apiKey! }, signal())).rejects.not.toThrow(config.apiKey!)
  expect(provider.modifyRecord).not.toHaveBeenCalled()
})
it('keeps Host configuration authoritative, including incomplete configuration', async () => {
  mockDatabase()
  const { service } = await mount(undefined, config)
  expect(await service.connection(signal())).toMatchObject({ source: 'host', writable: false, phase: 'connected' })
  await expect(service.login({ apiKey: config.apiKey! }, signal())).rejects.toMatchObject({ code: 'checkin/managed-connection' })
  await expect(service.logout(signal())).rejects.toMatchObject({ code: 'checkin/managed-connection' })
  const partial = await mount(undefined, { databaseId })
  expect((await partial.service.connection(signal())).phase).toBe('invalid')
  await expect(partial.service.list(signal())).rejects.toMatchObject({ code: 'checkin/invalid-config' })
})
it('reports absent and failing credential storage without blocking Host startup', async () => {
  mockDatabase()
  const ctx = new Context(); contexts.push(ctx)
  await ctx.plugin(CheckinService, CheckinService.Config())
  await expect(ctx.checkin.connection(signal())).rejects.toMatchObject({ code: 'checkin/credentials-unavailable' })
  const { service, provider } = await mount()
  provider.modifyRecord.mockRejectedValue(new Error(config.apiKey))
  await expect(service.login({ apiKey: config.apiKey! }, signal())).rejects.toMatchObject({ code: 'checkin/credentials-unavailable' })
  expect((await service.connection(signal())).phase).toBe('login')
})
function initializationMock() {
  const mock = mockDatabase()
  mock.state.exists = false
  mock.state.tableExists = false
  mock.state.recordsTableExists = false
  const original = mock.fetcher.getMockImplementation()!
  let databaseName = 'dsh_checkin'
  const writes: string[] = []
  const behavior = { failTable: false, failRecords: false, loseTableResponse: false, denyWrite: false }
  mock.fetcher.mockImplementation(async (input, init) => {
    const url = new URL(String(input))
    if (init?.method === 'POST' && (!url.pathname.endsWith('/query') || sqlRequest(init).sql?.startsWith('CREATE TABLE'))) {
      writes.push(url.pathname)
      if (behavior.denyWrite) return new Response(null, { status: 403 })
      if (url.pathname === '/api/databases') {
        databaseName = JSON.parse(String(init.body)).name
        mock.state.exists = true
        return Response.json({ id: databaseId, name: databaseName, status: 'ready' }, { status: 201 })
      }
      if (behavior.failTable) return new Response(null, { status: 503 })
      if (url.pathname.endsWith('/query')) {
        if (behavior.failRecords) return new Response(null, { status: 503 })
        mock.state.recordsTableExists = true
      } else mock.state.tableExists = true
      if (behavior.loseTableResponse) throw new Error('response lost')
      return Response.json({ kind: 'create', affectedRows: 0 }, { status: 201 })
    }
    const response = await original(input, init)
    if (url.pathname === '/api/databases') {
      const value = await response.json()
      for (const database of value.databases) database.name = databaseName
      return Response.json(value)
    }
    return response
  })
  return { ...mock, writes, behavior }
}
it('requires confirmation, creates the exact schema and activates only after verification', async () => {
  const mock = initializationMock(), { service } = await mount()
  await service.login({ apiKey: config.apiKey! }, signal())
  const request = { databaseName: 'dsh_checkin', ...tables, confirmed: true }
  await expect(service.initialize({ ...request, confirmed: false }, signal())).rejects.toMatchObject({ code: 'checkin/confirmation-required' })
  expect(mock.writes).toEqual([])
  expect((await service.initialize(request, signal())).phase).toBe('connected')
  expect(mock.writes).toEqual(['/api/databases', `/api/databases/${databaseId}/tables`, `/api/databases/${databaseId}/query`])
  const tableCall = mock.fetcher.mock.calls.find(([input]) => String(input).endsWith('/tables'))!
  const body = JSON.parse(String(tableCall[1]!.body))
  expect(body.columns).toHaveLength(5)
  expect(body.columns[0]).toMatchObject({ name: 'id', primaryKey: true, length: 36 })
  expect(body.columns[1]).toMatchObject({ name: 'name', unique: true, length: 200 })
  expect(mock.fetcher.mock.calls.map(([, init]) => sqlRequest(init).sql).find(sql => sql?.startsWith('CREATE TABLE'))).toContain('PRIMARY KEY (`topic_id`, `date`)')
})
it('retains partial resources and resumes by selecting the existing database', async () => {
  const mock = initializationMock(), { service } = await mount()
  await service.login({ apiKey: config.apiKey! }, signal())
  mock.behavior.failTable = true
  await expect(service.initialize({ databaseName: 'dsh_checkin', ...tables, confirmed: true }, signal())).rejects.toThrow()
  expect(await service.connection(signal())).toMatchObject({ phase: 'setup', databaseId })
  mock.behavior.failTable = false
  await service.initialize({ databaseId, ...tables, confirmed: true }, signal())
  expect(mock.writes.filter(path => path === '/api/databases')).toHaveLength(1)
})
it('does not resend an uncertain table creation and permits explicit connection after inspection', async () => {
  const mock = initializationMock(), { service } = await mount()
  await service.login({ apiKey: config.apiKey! }, signal())
  mock.behavior.loseTableResponse = true
  await expect(service.initialize({ databaseName: 'dsh_checkin', ...tables, confirmed: true }, signal())).rejects.toMatchObject({ code: 'checkin/write-uncertain' })
  expect((await service.resources(signal())).databases[0]?.tables).toHaveLength(1)
  await expect(service.initialize({ databaseId, ...tables, confirmed: true }, signal())).rejects.toMatchObject({ code: 'checkin/database-conflict' })
  expect(mock.writes).toHaveLength(2)
  mock.behavior.loseTableResponse = false
  expect((await service.initialize({ databaseId, ...tables, useExistingTopics: true, confirmed: true }, signal())).phase).toBe('connected')
})
it('does not mistake read access for write access', async () => {
  const mock = initializationMock(), { service } = await mount()
  mock.behavior.denyWrite = true
  await service.login({ apiKey: config.apiKey! }, signal())
  await expect(service.initialize({ databaseName: 'dsh_checkin', ...tables, confirmed: true }, signal())).rejects.toMatchObject({ code: 'checkin/unauthorized' })
  expect((await service.connection(signal())).phase).toBe('setup')
})
it('blocks disabled service, exhausted quota and incompatible existing schema', async () => {
  const mock = initializationMock(), { service } = await mount()
  mock.state.enabled = false
  await expect(service.login({ apiKey: config.apiKey! }, signal())).rejects.toMatchObject({ code: 'checkin/service-disabled' })
  mock.state.enabled = true
  await service.login({ apiKey: config.apiKey! }, signal())
  mock.state.limits.maxDatabases = 0
  await expect(service.initialize({ databaseName: 'dsh_checkin', ...tables, confirmed: true }, signal())).rejects.toMatchObject({ code: 'checkin/quota-exceeded' })
  expect(mock.writes).toEqual([])
  mock.state.exists = true; mock.state.tableExists = true; mock.state.recordsTableExists = true
  mock.schema.columns[0]!.nullable = true
  await expect(service.connect({ databaseId, ...tables }, signal())).rejects.toMatchObject({ code: 'checkin/invalid-schema' })
  expect((await service.connection(signal())).phase).toBe('setup')
})
it('refuses same-name resources, non-ready databases and invalid identifiers without creation', async () => {
  const mock = initializationMock(), { service } = await mount()
  await service.login({ apiKey: config.apiKey! }, signal())
  mock.state.exists = true
  await expect(service.initialize({ databaseName: 'dsh_checkin', ...tables, confirmed: true }, signal())).rejects.toMatchObject({ code: 'checkin/database-conflict' })
  mock.state.status = 'provisioning'
  await expect(service.initialize({ databaseId, ...tables, confirmed: true }, signal())).rejects.toMatchObject({ code: 'checkin/database-not-ready' })
  await expect(service.initialize({ databaseName: 'invalid-name', ...tables, confirmed: true }, signal())).rejects.toMatchObject({ code: 'checkin/invalid-config' })
  expect(mock.writes).toEqual([])
})
it.each(['bytes', 'tables'])('preflights %s quota before creating a database', async quota => {
  const mock = initializationMock(), { service } = await mount()
  await service.login({ apiKey: config.apiKey! }, signal())
  if (quota === 'bytes') mock.state.limits.maxBytes = 0
  else mock.state.limits.maxTables = 1
  await expect(service.initialize({ databaseName: 'dsh_checkin', ...tables, confirmed: true }, signal())).rejects.toMatchObject({ code: 'checkin/quota-exceeded' })
  expect(mock.writes).toEqual([])
})
it('does no credential or HTTP work for cancelled calls', async () => {
  const mock = mockDatabase(), { service, provider } = await mount()
  await expect(service.login({ apiKey: config.apiKey! }, AbortSignal.abort())).rejects.toThrow()
  expect(provider.modifyRecord).not.toHaveBeenCalled()
  expect(mock.fetcher).not.toHaveBeenCalled()
})
it('retains the topic table when record creation fails and requires explicit reuse', async () => {
  const mock = initializationMock(), { service } = await mount()
  await service.login({ apiKey: config.apiKey! }, signal())
  mock.behavior.failRecords = true
  await expect(service.initialize({ databaseName: 'dsh_checkin', ...tables, confirmed: true }, signal())).rejects.toThrow()
  expect(await service.connection(signal())).toMatchObject({ phase: 'setup', databaseId, ...tables })
  expect(mock.state.tableExists).toBe(true)
  expect(mock.state.recordsTableExists).toBe(false)
  mock.behavior.failRecords = false
  await expect(service.initialize({ databaseId, ...tables, confirmed: true }, signal())).rejects.toThrow('database-conflict')
  await service.initialize({ databaseId, ...tables, useExistingTopics: true, confirmed: true }, signal())
  expect(mock.writes.filter(path => path.endsWith('/tables'))).toHaveLength(1)
})
it('checks a reused table before creating its partner and rejects equal names', async () => {
  const mock = initializationMock(), { service } = await mount()
  await service.login({ apiKey: config.apiKey! }, signal())
  mock.state.exists = true; mock.state.tableExists = true
  mock.schema.columns.push({ name: 'completed_dates', type: 'json', nullable: true, defaultValue: null, key: '', extra: '' })
  await expect(service.initialize({ databaseId, ...tables, useExistingTopics: true, confirmed: true }, signal())).rejects.toThrow('invalid-schema')
  await expect(service.connect({ databaseId, ...tables, recordsTableName: tables.tableName }, signal())).rejects.toThrow('invalid-config')
  expect(mock.writes).toEqual([])
})
it('returns legacy saved single-table connections to setup without rewriting or migrating', async () => {
  const mock = mockDatabase(), provider = credentials()
  await provider.modifyRecord('test', async () => ({
    kind: 'grant', payload: { version: 1, apiKey: config.apiKey, revision: databaseId, phase: 'connected', databaseId, tableName: tables.tableName },
  }))
  const { service } = await mount(provider)
  expect((await service.connection(signal())).phase).toBe('setup')
  await expect(service.list(signal())).rejects.toThrow('invalid-config')
  expect(mock.fetcher).not.toHaveBeenCalled()
})
