import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PubDatabase } from '../src/host/database.ts'
import { config, databaseId, mockDatabase, queryPath, schemaPath, sqlFields, sqlRequest, timestamp } from './helpers/pub-database.ts'

let database: PubDatabase, server: ReturnType<typeof mockDatabase>
beforeEach(() => { server = mockDatabase(); database = new PubDatabase(config) })
afterEach(() => { database.close(); vi.unstubAllGlobals(); vi.unstubAllEnvs() })

describe('Pub database transport', () => {
  it('reads configuration from Host environment without exposing credentials', async () => {
    vi.stubEnv('PUB_DATABASE_KEY', config.apiKey!)
    vi.stubEnv('PUB_DATABASE_ID', databaseId)
    const fromEnv = new PubDatabase({})
    try {
      expect(await fromEnv.list()).toEqual([])
      for (const [url, init] of server.fetcher.mock.calls) {
        expect(String(url)).not.toContain(config.apiKey)
        expect(init).toMatchObject({ redirect: 'error', credentials: 'omit' })
        expect(new Headers(init?.headers).get('authorization')).toBeNull()
      }
    } finally { fromEnv.close() }
    vi.stubEnv('PUB_DATABASE_KEY', '')
    expect(() => new PubDatabase({})).toThrow('invalid-config')
    expect(() => new PubDatabase({ ...config, databaseId: 'not-a-uuid' })).toThrow('invalid-config')
    expect(() => new PubDatabase({ ...config, tableName: '../private' })).toThrow('invalid-config')
    expect(() => new PubDatabase({ ...config, requestTimeoutMs: 0 })).toThrow('invalid-config')
  })

  it('uses primary-key SQL pagination with a lookahead row instead of estimated recordCount', async () => {
    for (let index = 0; index < 212; index++) server.seed(`topic-${index}`)
    const records = await database.list()
    expect(records).toHaveLength(212)
    expect(new Set(records.map(record => record.id))).toEqual(new Set(server.records.keys()))
    const pages = server.fetcher.mock.calls.map(([, init]) => sqlRequest(init)).filter(request => request.sql.includes('ORDER BY'))
    expect(pages).toHaveLength(3)
    expect(pages[0]?.params).toEqual([])
    expect(pages[1]?.params).toEqual([records[99]?.id])
    expect(pages.every(page => page.sql.endsWith('ORDER BY `id` LIMIT 101'))).toBe(true)
    expect(server.fetcher.mock.calls.every(([, init]) => !sqlRequest(init).sql.includes('COUNT(*)'))).toBe(true)
    expect(server.fetcher.mock.calls.every(([url]) => !String(url).includes('/records'))).toBe(true)
    const paths = server.fetcher.mock.calls.map(([url]) => new URL(String(url)).pathname)
    expect(paths.indexOf(schemaPath)).toBeLessThan(paths.indexOf(queryPath))
  })

  it.each([
    [{ enabled: false }, 'service-disabled'],
    [{ exists: false }, 'database-not-found'],
    [{ status: 'provisioning' }, 'database-not-ready'],
    [{ status: 'deleting' }, 'database-not-ready'],
    [{ tableExists: false }, 'table-not-found'],
  ])('does not create or modify resources when state is %j', async (state, error) => {
    Object.assign(server.state, state)
    await expect(database.list()).rejects.toThrow(error)
    await expect(database.create('test', timestamp)).rejects.toThrow(error)
    expect(server.fetcher.mock.calls.every(([, init]) => init?.method === 'GET')).toBe(true)
  })

  it.each([
    [401, 'unauthorized'], [403, 'unauthorized'], [409, 'database-conflict'],
    [400, 'query-rejected'], [404, 'api-unavailable'], [413, 'request-too-large'],
    [429, 'rate-limited'], [503, 'service-unavailable'],
  ])('maps HTTP %s without leaking response content or retrying', async (status, error) => {
    server.fetcher.mockResolvedValueOnce(Response.json({ message: config.apiKey }, { status }))
    const result = database.list()
    await expect(result).rejects.toThrow(error)
    await expect(result).rejects.not.toThrow(config.apiKey!)
    expect(server.fetcher).toHaveBeenCalledTimes(1)
  })

  it('rejects login HTML and malformed successful responses', async () => {
    server.fetcher.mockResolvedValueOnce(new Response('<html>login</html>'))
    await expect(database.list()).rejects.toThrow('invalid-response')
    server.fetcher.mockResolvedValueOnce(Response.json({ enabled: true }))
    await expect(database.list()).rejects.toThrow('invalid-response')
  })

  it('refuses duplicate rows in a listing page', async () => {
    const record = server.seed('reading')
    const normal = server.fetcher.getMockImplementation()!
    server.fetcher.mockImplementation(async (input, init) => {
      const response = await normal(input, init), { sql } = sqlRequest(init)
      if (!sql.includes('ORDER BY')) return response
      const result = await response.json()
      return Response.json({ ...result, rows: [result.rows[0], result.rows[0]] })
    })
    await expect(database.list()).rejects.toThrow('inconsistent-read')
    expect(server.records.has(record.id)).toBe(true)
  })

  it('blocks INSERT and every UPDATE over physical quota but permits DELETE', async () => {
    const record = server.seed('阅读')
    server.state.limits.maxBytes = 1
    await expect(database.create('another', timestamp)).rejects.toThrow('quota-exceeded')
    await expect(database.update(record, { name: '读' }, timestamp)).rejects.toThrow('quota-exceeded')
    await expect(database.set(record, '2026-09-10', true, timestamp)).rejects.toThrow('quota-exceeded')
    expect(server.fetcher.mock.calls.every(([, init]) => !/^(INSERT|UPDATE)/u.test(sqlRequest(init).sql))).toBe(true)
    expect(await database.get(record.id)).toEqual(record)
    await database.delete(record)
    expect(server.records.size).toBe(0)
    expect(server.state.usedBytes).toBe(16384)
  })

  it('maps reordered columns by position and verifies SQL DELETE JSON', async () => {
    const normal = server.fetcher.getMockImplementation()!
    server.fetcher.mockImplementation(async (input, init) => {
      const response = await normal(input, init)
      if (!sqlRequest(init).sql.includes('LIMIT')) return response
      const result = await response.json()
      return Response.json({ ...result, columns: [...result.columns].reverse(), rows: result.rows.map((row: unknown[]) => [...row].reverse()) })
    })
    const saved = await database.create('reading', timestamp)
    expect(saved).toMatchObject({ name: 'reading', createdAt: timestamp })
    await database.delete(saved)
    expect(server.records.size).toBe(0)
    await expect(database.delete(saved)).rejects.toThrow('concurrent-change')
  })

  it('does not resend INSERT after an unknown network outcome', async () => {
    const normal = server.fetcher.getMockImplementation()!
    server.fetcher.mockImplementation(async (input, init) => {
      const response = await normal(input, init)
      if (sqlRequest(init).sql.startsWith('INSERT')) throw new Error(`lost reply ${config.apiKey}`)
      return response
    })
    await expect(database.create('reading', timestamp)).rejects.toThrow('write-uncertain')
    expect(server.records.size).toBe(1)
    expect(server.fetcher.mock.calls.filter(([, init]) => sqlRequest(init).sql.startsWith('INSERT'))).toHaveLength(1)
  })

  it('reports uncertainty when verification differs from requested data', async () => {
    const normal = server.fetcher.getMockImplementation()!
    server.fetcher.mockImplementation(async (input, init) => {
      const response = await normal(input, init)
      if (sqlRequest(init).sql.startsWith('INSERT')) {
        const record = [...server.records.values()][0]!
        record.name = 'wrong'
      }
      return response
    })
    await expect(database.create('reading', timestamp)).rejects.toThrow('write-uncertain')
  })

  it.each(['SELECT', 'INSERT'])('classifies a SQL timeout by statement instead of HTTP POST: %s', async kind => {
    const normal = server.fetcher.getMockImplementation()!
    server.fetcher.mockImplementation(async (input, init) => {
      if (sqlRequest(init).sql.startsWith(kind)) return new Response(null, { status: 504 })
      return normal(input, init)
    })
    if (kind === 'SELECT') await expect(database.list()).rejects.toThrow('service-unavailable')
    else await expect(database.create('test', timestamp)).rejects.toThrow('write-uncertain')
  })

  it.each(['legacy', 'type', 'nullable', 'composite-key', 'no-name-index', 'required-extra'])('refuses incompatible schema before executing SQL: %s', async mode => {
    if (mode === 'legacy') server.schema.columns[1]!.name = 'data'
    if (mode === 'type') server.schema.columns[2]!.type = 'text'
    if (mode === 'nullable') server.schema.columns[2]!.nullable = true
    if (mode === 'composite-key') server.schema.indexes.push({ name: 'PRIMARY', column: 'name', unique: true, sequence: 2 })
    if (mode === 'no-name-index') server.schema.indexes.pop()
    if (mode === 'required-extra') server.schema.columns.push({ name: 'required', type: 'int', nullable: false, defaultValue: null, key: '', extra: '' })
    await expect(database.create('test', timestamp)).rejects.toThrow('invalid-schema')
    expect(server.fetcher.mock.calls.every(([, init]) => !sqlRequest(init).sql)).toBe(true)
  })

  it('uses the literal physical table name including legacy prefixes and 64-character names', async () => {
    server.schema.name = `t_${'a'.repeat(62)}`
    const custom = new PubDatabase({ ...config, tableName: server.schema.name })
    try {
      expect(await custom.list()).toEqual([])
      expect(server.fetcher.mock.calls.some(([, init]) => sqlRequest(init).sql.includes(`FROM \`${server.schema.name}\``))).toBe(true)
    } finally { custom.close() }
    expect(() => new PubDatabase({ ...config, tableName: 'a'.repeat(65) })).toThrow('invalid-config')
  })

  it('parameterizes user text and updates only the requested column with revision protection', async () => {
    const name = "阅读'; DROP TABLE topics --\\"
    const record = await database.create(name, timestamp)
    await database.update(record, { name: '读书' }, timestamp)
    const requests = server.fetcher.mock.calls.map(([, init]) => sqlRequest(init)).filter(request => request.sql)
    expect(requests.every(request => !request.sql.includes(name))).toBe(true)
    expect(requests.find(request => request.sql.startsWith('INSERT'))?.params).toContain(name)
    const update = requests.find(request => request.sql.startsWith('UPDATE'))!
    expect(update.sql).toContain('WHERE `id` = ? AND `revision` = ?')
    expect(update.sql).not.toContain('completed_dates')
    await expect(database.update(record, { name: 'stale rename' }, timestamp)).rejects.toThrow('concurrent-change')
    await expect(database.delete(record)).rejects.toThrow('concurrent-change')
    expect(server.records.get(record.id)?.name).toBe('读书')
  })

  it('enforces the SQL parameter byte limit without using removed record quotas', async () => {
    const record = server.seed('test')
    await expect(database.update(record, { name: 'a'.repeat(65536) }, timestamp)).rejects.toThrow('request-too-large')
    expect(server.fetcher.mock.calls.every(([, init]) => !sqlRequest(init).sql.startsWith('UPDATE'))).toBe(true)
  })

  it('rejects duplicate or malformed SQL result columns', async () => {
    server.seed('reading')
    const normal = server.fetcher.getMockImplementation()!
    server.fetcher.mockImplementation(async (input, init) => {
      const response = await normal(input, init)
      if (!sqlRequest(init).sql.includes('ORDER BY')) return response
      return Response.json({ ...await response.json(), columns: sqlFields.map(() => 'id') })
    })
    await expect(database.list()).rejects.toThrow('invalid-response')
  })

  it('rejects a repeated second page instead of looping or deduplicating', async () => {
    for (let index = 0; index < 101; index++) server.seed(`topic-${index}`)
    const normal = server.fetcher.getMockImplementation()!
    let firstPage: unknown
    server.fetcher.mockImplementation(async (input, init) => {
      const response = await normal(input, init)
      if (!sqlRequest(init).sql.includes('ORDER BY')) return response
      if (firstPage) return Response.json(firstPage)
      firstPage = await response.json()
      return Response.json(firstPage)
    })
    await expect(database.list()).rejects.toThrow('inconsistent-read')
    expect(server.fetcher.mock.calls.filter(([, init]) => sqlRequest(init).sql.includes('ORDER BY'))).toHaveLength(2)
  })

  it('caches schema validation for repeated reads on the same connection', async () => {
    server.seed('reading')
    await database.list()
    await database.list()
    const paths = server.fetcher.mock.calls.map(([url]) => new URL(String(url)).pathname)
    expect(paths.filter(path => path === '/api/databases')).toHaveLength(1)
    expect(paths.filter(path => path.endsWith('/schema'))).toHaveLength(2)
  })

  it.each(['INSERT', 'UPDATE'])('never reports success for an unexpected affectedRows on %s', async kind => {
    const record = server.seed('reading')
    const normal = server.fetcher.getMockImplementation()!
    server.fetcher.mockImplementation(async (input, init) => {
      const response = await normal(input, init)
      if (sqlRequest(init).sql.startsWith(kind)) return Response.json({ ...await response.json(), affectedRows: 2 })
      return response
    })
    const pending = kind === 'INSERT' ? database.create('another', timestamp)
      : kind === 'UPDATE' ? database.update(record, { name: 'renamed' }, timestamp)
        : database.delete(record)
    await expect(pending).rejects.toThrow('write-uncertain')
    expect(server.fetcher.mock.calls.filter(([, init]) => sqlRequest(init).sql.startsWith(kind))).toHaveLength(1)
  })

  it('retains large custom SQL column values without projecting them into plugin results', async () => {
    server.schema.columns.push({ name: 'external_count', type: 'bigint', nullable: true, defaultValue: null, key: '', extra: '' })
    const record = server.seed('reading')
    record.metadata = '9007199254740993'
    const previous = await database.get(record.id)
    await database.update(previous!, { name: 'renamed' }, timestamp)
    expect(server.records.get(record.id)?.metadata).toBe('9007199254740993')
    expect(await database.get(record.id)).not.toHaveProperty('metadata')
  })

  it('treats SQL 404 as deployment failure rather than an absent record', async () => {
    const record = server.seed('reading')
    const normal = server.fetcher.getMockImplementation()!
    server.fetcher.mockImplementation(async (input, init) => {
      if (sqlRequest(init).sql) return new Response(null, { status: 404 })
      return normal(input, init)
    })
    await expect(database.get(record.id)).rejects.toThrow('api-unavailable')
  })

  it('propagates cancellation and enforces a request timeout', async () => {
    const abort = new AbortController()
    abort.abort()
    await expect(database.list(abort.signal)).rejects.toThrow()
    expect(server.fetcher).not.toHaveBeenCalled()
    server.fetcher.mockImplementation((_input, init) => new Promise((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => { reject(new Error('aborted')) }, { once: true })
    }))
    const shortTimeout = new PubDatabase({ ...config, requestTimeoutMs: 10 })
    try { await expect(shortTimeout.list()).rejects.toThrow('service-unavailable') }
    finally { shortTimeout.close() }
    const pending = database.list()
    database.close()
    await expect(pending).rejects.toThrow('service-unavailable')
  })

  it.each(['legacy-json', 'missing-records', 'primary', 'date-index', 'nullable'])('validates both tables before writes: %s', async mode => {
    if (mode === 'legacy-json') server.schema.columns.push({ name: 'completed_dates', type: 'json', nullable: true, defaultValue: null, key: '', extra: '' })
    if (mode === 'missing-records') server.state.recordsTableExists = false
    if (mode === 'primary') server.recordsSchema.indexes[1]!.column = 'revision'
    if (mode === 'date-index') server.recordsSchema.indexes.pop()
    if (mode === 'nullable') server.recordsSchema.columns[1]!.nullable = true
    await expect(database.create('test', timestamp)).rejects.toThrow(mode === 'missing-records' ? 'table-not-found' : 'invalid-schema')
    expect(server.fetcher.mock.calls.every(([, init]) => !sqlRequest(init).sql)).toBe(true)
  })

  it('pages date-filtered records by date/topic with a lookahead row', async () => {
    for (let index = 0; index < 205; index++) server.seed(`topic-${index}`, ['2026-08-31', '2026-09-01', '2026-09-02'])
    const rows = await database.completions('2026-09-01', '2026-09-02')
    expect(rows).toHaveLength(410)
    expect(new Set(rows.map(row => `${row.date}:${row.topicId}`)).size).toBe(410)
    const pages = server.fetcher.mock.calls.map(([, init]) => sqlRequest(init)).filter(request => request.sql.includes('ORDER BY'))
    expect(pages).toHaveLength(5)
    expect(pages.every(request => request.sql.includes('WHERE `date` >= ? AND `date` <= ?'))).toBe(true)
    expect(pages.every(request => request.sql.endsWith('LIMIT 101'))).toBe(true)
    expect(pages.every(request => !request.sql.includes('COUNT(*)'))).toBe(true)
    expect(await database.completions('2026-09-01', '2026-09-02', rows[0]!.topicId)).toHaveLength(2)
  })

  it('refuses duplicate record pages and count changes', async () => {
    server.seed('reading', ['2026-09-01'])
    const normal = server.fetcher.getMockImplementation()!
    server.fetcher.mockImplementation(async (input, init) => {
      const response = await normal(input, init)
      if (!sqlRequest(init).sql.includes('ORDER BY')) return response
      const value = await response.json()
      return Response.json({ ...value, rows: [value.rows[0], value.rows[0]] })
    })
    await expect(database.completions('2026-09-01', '2026-09-30')).rejects.toThrow('inconsistent-read')
  })

  it('uses one guarded delete for the topic and all its dates', async () => {
    const record = server.seed('reading', ['2026-09-01', '2026-09-02'])
    server.seed('other', ['2026-09-01'])
    expect(await database.delete(record)).toBe(2)
    expect(server.completions.size).toBe(1)
    const deletes = server.fetcher.mock.calls.map(([, init]) => sqlRequest(init)).filter(request => request.sql.startsWith('DELETE'))
    expect(deletes).toHaveLength(1)
    expect(deletes[0]?.sql).toContain('LEFT JOIN `checkin_records`')
  })

  it('does not insert orphan rows if another Host deletes the parent first', async () => {
    const record = server.seed('reading')
    const normal = server.fetcher.getMockImplementation()!
    server.fetcher.mockImplementation(async (input, init) => {
      if (sqlRequest(init).sql.startsWith('INSERT')) server.records.delete(record.id)
      return normal(input, init)
    })
    await expect(database.set(record, '2026-09-01', true, timestamp)).rejects.toThrow('concurrent-change')
    expect(server.completions.size).toBe(0)
  })

  it('uses a top-level anti-join for conditional inserts instead of a target-table subquery', async () => {
    const record = server.seed('reading')
    await database.set(record, '2026-09-01', true, timestamp)
    const insert = server.fetcher.mock.calls.map(([, init]) => sqlRequest(init)).find(request => request.sql.startsWith('INSERT'))!
    expect(insert.sql).toContain('LEFT JOIN `checkin_records`')
    expect(insert.sql).toContain('`checkin_records`.`topic_id` IS NULL')
    expect(insert.sql).not.toContain('(SELECT')
    expect(insert.params).toEqual(['2026-09-01', timestamp, expect.any(String), '2026-09-01', record.id, record.revision])
  })

  it('preserves a concurrent completion of the same pair and does not duplicate it', async () => {
    const record = server.seed('reading')
    const normal = server.fetcher.getMockImplementation()!
    server.fetcher.mockImplementation(async (input, init) => {
      if (sqlRequest(init).sql.startsWith('INSERT')) server.completions.set(`${record.id}:2026-09-01`, {
        topicId: record.id, date: '2026-09-01', createdAt: timestamp, revision: record.revision,
      })
      return normal(input, init)
    })
    await expect(database.set(record, '2026-09-01', true, timestamp)).rejects.toThrow('concurrent-change')
    expect(server.completions.size).toBe(1)
  })

  it('reports an uncertain outcome when parent removal occurs after the insert', async () => {
    const record = server.seed('reading')
    const normal = server.fetcher.getMockImplementation()!
    server.fetcher.mockImplementation(async (input, init) => {
      const response = await normal(input, init)
      if (sqlRequest(init).sql.startsWith('INSERT')) { server.records.delete(record.id); server.completions.clear() }
      return response
    })
    await expect(database.set(record, '2026-09-01', true, timestamp)).rejects.toThrow('write-uncertain')
    expect(server.completions.size).toBe(0)
  })

  it('keeps another Host recheck-in when cancellation has an old record revision', async () => {
    const record = server.seed('reading', ['2026-09-01'])
    const normal = server.fetcher.getMockImplementation()!
    server.fetcher.mockImplementation(async (input, init) => {
      if (sqlRequest(init).sql.startsWith('DELETE')) server.completions.get(`${record.id}:2026-09-01`)!.revision = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
      return normal(input, init)
    })
    await expect(database.set(record, '2026-09-01', false, timestamp)).rejects.toThrow('concurrent-change')
    expect(server.completions.size).toBe(1)
  })

  it('does not resend record writes after lost replies', async () => {
    const record = server.seed('reading')
    const normal = server.fetcher.getMockImplementation()!
    server.fetcher.mockImplementation(async (input, init) => {
      const response = await normal(input, init)
      if (sqlRequest(init).sql.startsWith('INSERT')) throw new Error('lost')
      return response
    })
    await expect(database.set(record, '2026-09-01', true, timestamp)).rejects.toThrow('write-uncertain')
    expect(server.completions.size).toBe(1)
    expect(server.fetcher.mock.calls.filter(([, init]) => sqlRequest(init).sql.startsWith('INSERT'))).toHaveLength(1)
  })
})
