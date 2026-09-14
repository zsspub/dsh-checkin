import { randomUUID } from 'node:crypto'
import { vi } from 'vitest'
import type { DatabaseCompletion, DatabaseRecord, StoreConfig } from '../../src/host/database.ts'

export const databaseId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
export const config: StoreConfig = { apiKey: 'test-database-key', databaseId, tableName: 'checkin_topics', recordsTableName: 'checkin_records', requestTimeoutMs: 1000 }
export const queryPath = `/api/databases/${databaseId}/query`
export const schemaPath = `/api/databases/${databaseId}/tables/checkin_topics/schema`
export const timestamp = '2026-09-10T00:00:00.000Z'
export const sqlFields = ['id', 'name', 'created_at', 'updated_at', 'revision']

export function sqlRequest(init?: RequestInit): { sql: string; params: (string | number | boolean | null)[] } {
  return init?.body ? JSON.parse(String(init.body)) : { sql: '', params: [] }
}

export function mockDatabase() {
  const records = new Map<string, DatabaseRecord & { metadata?: unknown }>()
  const completions = new Map<string, DatabaseCompletion>()
  const state = {
    enabled: true,
    status: 'ready',
    exists: true,
    tableExists: true,
    recordsTableExists: true,
    usedBytes: 16384,
    estimatedCount: 999,
    limits: { maxDatabases: 3, maxTables: 20, maxBytes: 104857600 },
  }
  const schema = {
    name: 'checkin_topics',
    columns: sqlFields.map(name => ({
      name, type: `varchar(${name === 'name' ? 200 : name.endsWith('_at') ? 24 : 36})`,
      nullable: false, defaultValue: null, key: name === 'id' ? 'PRI' : name === 'name' ? 'UNI' : '', extra: '',
    })),
    indexes: [{ name: 'PRIMARY', column: 'id', unique: true, sequence: 1 }, { name: 'by_name', column: 'name', unique: true, sequence: 1 }],
  }
  const recordsSchema = {
    name: 'checkin_records',
    columns: ['topic_id', 'date', 'created_at', 'revision'].map(name => ({
      name, type: `varchar(${name === 'date' ? 10 : name === 'created_at' ? 24 : 36})`,
      nullable: false, defaultValue: null, key: name === 'topic_id' || name === 'date' ? 'PRI' : '', extra: '',
    })),
    indexes: [
      { name: 'PRIMARY', column: 'topic_id', unique: true, sequence: 1 }, { name: 'PRIMARY', column: 'date', unique: true, sequence: 2 },
      { name: 'by_date', column: 'date', unique: false, sequence: 1 }, { name: 'by_date', column: 'topic_id', unique: false, sequence: 2 },
    ],
  }
  const seed = (name: string, completedDates: string[] = []) => {
    const record: DatabaseRecord & { metadata?: unknown } = { id: randomUUID(), name, createdAt: timestamp, updatedAt: timestamp, revision: randomUUID() }
    records.set(record.id, record)
    for (const date of completedDates) completions.set(`${record.id}:${date}`, { topicId: record.id, date, createdAt: timestamp, revision: randomUUID() })
    return record
  }
  const result = (kind: string, columns: string[] = [], rows: unknown[][] = [], affectedRows = 0) =>
    Response.json({ kind, columns, rows, affectedRows, insertId: '0' })
  const fetcher = vi.fn<typeof fetch>(async (input, init) => {
    const url = new URL(String(input)), method = init?.method ?? 'GET'
    if (url.origin !== 'https://zss.pub' || init?.redirect !== 'error' || new Headers(init?.headers).get('x-api-key') !== config.apiKey) throw new Error('Unsafe test request')
    init?.signal?.throwIfAborted()
    if (url.pathname === '/api/databases' && method === 'GET') {
      return Response.json({
        enabled: state.enabled,
        limits: state.limits,
        databases: state.exists ? [{
          id: databaseId, name: 'checkin', status: state.status,
          usedBytes: state.usedBytes,
          tables: [
            ...(state.tableExists ? [{ name: schema.name, recordCount: state.estimatedCount }] : []),
            ...(state.recordsTableExists ? [{ name: recordsSchema.name, recordCount: state.estimatedCount }] : []),
          ],
        }] : [],
      })
    }
    if (url.pathname === `/api/databases/${databaseId}/tables/${schema.name}/schema` && method === 'GET') return Response.json(schema)
    if (url.pathname === `/api/databases/${databaseId}/tables/${recordsSchema.name}/schema` && method === 'GET') return Response.json(recordsSchema)
    if (url.pathname === queryPath && method === 'POST') {
      const { sql, params } = sqlRequest(init)
      if (/[;\\]|--|\/\*/u.test(sql) || (sql.match(/\?/gu) ?? []).length !== params.length) throw new Error('Unsafe SQL')
      if (sql.startsWith(`DELETE \`${schema.name}\`, `)) {
        const record = records.get(String(params[0]))
        if (!record || record.revision !== params[1]) return result('delete')
        records.delete(record.id)
        let affected = 1
        for (const [key, row] of completions) if (row.topicId === record.id) { completions.delete(key); affected++ }
        return result('delete', [], [], affected)
      }
      if (sql.includes(`FROM \`${recordsSchema.name}\``) || sql.startsWith(`INSERT INTO \`${recordsSchema.name}\``)) {
        if (sql.startsWith('INSERT')) {
          const [date, createdAt, revision, , topicId, previousRevision] = params.map(String)
          const topic = records.get(topicId!), key = `${topicId}:${date}`
          if (!topic || topic.revision !== previousRevision || completions.has(key)) return result('insert')
          completions.set(key, { topicId: topicId!, date: date!, createdAt: createdAt!, revision: revision! })
          return result('insert', [], [], 1)
        }
        if (sql.startsWith('DELETE')) {
          const key = `${params[0]}:${params[1]}`, row = completions.get(key)
          if (!row || row.revision !== params[2]) return result('delete')
          completions.delete(key)
          return result('delete', [], [], 1)
        }
        let selected = [...completions.values()].sort((left, right) => left.date.localeCompare(right.date) || left.topicId.localeCompare(right.topicId))
        if (sql.includes('WHERE `topic_id` = ?')) {
          selected = selected.filter(row => row.topicId === params[0] && (!sql.includes('AND `date` = ?') || row.date === params[1]))
        } else {
          selected = selected.filter(row => row.date >= String(params[0]) && row.date <= String(params[1]))
          if (sql.includes('AND `topic_id` = ?')) selected = selected.filter(row => row.topicId === params[2])
        }
        if (sql.includes('COUNT(*)')) return result('select', ['total'], [[String(selected.length)]])
        if (sql.includes('AND (`date` > ?')) {
          const [date, , topicId] = params.slice(-3).map(String)
          selected = selected.filter(row => row.date > date! || row.date === date && row.topicId > topicId!)
        }
        const limit = Number(/ LIMIT (\d+)$/u.exec(sql)?.[1])
        if (!limit || limit > 101) throw new Error('Missing safe LIMIT')
        return result('select', ['topic_id', 'date', 'created_at', 'revision'], selected.slice(0, limit).map(row => [row.topicId, row.date, row.createdAt, row.revision]))
      }
      if (sql === `SELECT COUNT(*) AS total FROM \`${schema.name}\``) return result('select', ['total'], [[String(records.size)]])
      if (sql.startsWith('SELECT ')) {
        let selected = [...records.values()].sort((left, right) => left.id.localeCompare(right.id))
        if (sql.includes('WHERE `id` = ?')) selected = selected.filter(record => record.id === params[0])
        else if (sql.includes('WHERE `id` > ?')) selected = selected.filter(record => record.id > String(params[0]))
        const limit = Number(/ LIMIT (\d+)$/u.exec(sql)?.[1])
        if (!limit || limit > 101) throw new Error('Missing safe LIMIT')
        selected = selected.slice(0, limit)
        return result('select', sqlFields, selected.map(record => [record.id, record.name, record.createdAt, record.updatedAt, record.revision]))
      }
      if (sql.startsWith('INSERT INTO ')) {
        const [id, name, createdAt, updatedAt, revision] = params.map(String)
        if ([...records.values()].some(record => record.id === id || record.name === name)) return Response.json({ message: 'duplicate' }, { status: 400 })
        records.set(id!, { id: id!, name: name!, createdAt: createdAt!, updatedAt: updatedAt!, revision: revision! })
        return result('insert', [], [], 1)
      }
      if (sql.startsWith('UPDATE ')) {
        const [value, updatedAt, revision, id, previousRevision] = params.map(String), record = records.get(id!)
        if (!record || record.revision !== previousRevision) return result('update')
        records.set(id!, { ...record, name: value!, updatedAt: updatedAt!, revision: revision! })
        return result('update', [], [], 1)
      }
      if (sql.startsWith('DELETE FROM ')) {
        const record = records.get(String(params[0]))
        if (!record || record.revision !== params[1]) return result('delete')
        records.delete(record.id)
        return result('delete', [], [], 1)
      }
    }
    throw new Error(`Unexpected test request: ${method} ${url.pathname}`)
  })
  vi.stubGlobal('fetch', fetcher)
  return { records, completions, state, schema, recordsSchema, seed, fetcher }
}
