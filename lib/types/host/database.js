import { randomUUID } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { z } from 'zod';
import { failure, PubClient } from "./http.js";
export { failure } from "./http.js";
const recordSchema = z.object({
    id: z.uuid(),
    name: z.string().min(1).max(200),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
    revision: z.uuid(),
});
const completionSchema = z.object({
    topicId: z.uuid(),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/u).refine(value => value >= '0001-01-01' && Number.isFinite(Date.parse(`${value}T00:00:00Z`)) && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value),
    createdAt: z.iso.datetime(),
    revision: z.uuid(),
});
const overviewSchema = z.object({
    enabled: z.boolean(),
    limits: z.object({
        maxDatabases: z.number().int().nonnegative(),
        maxTables: z.number().int().nonnegative(),
        maxBytes: z.number().int().nonnegative(),
    }),
    databases: z.array(z.object({
        id: z.uuid(),
        status: z.enum(['ready', 'provisioning', 'deleting']),
        usedBytes: z.number().int().nonnegative(),
        tables: z.array(z.object({ name: z.string() })),
    })),
});
const tableSchema = z.object({
    name: z.string(),
    columns: z.array(z.object({
        name: z.string(), type: z.string(), nullable: z.boolean(),
        defaultValue: z.unknown(), key: z.string(), extra: z.string(),
    })),
    indexes: z.array(z.object({ name: z.string(), column: z.string(), unique: z.boolean(), sequence: z.number().int() })),
});
const resultSchema = z.object({
    kind: z.enum(['select', 'insert', 'update', 'delete']),
    columns: z.array(z.string()),
    rows: z.array(z.array(z.unknown())).max(500),
    affectedRows: z.number().int().nonnegative(),
    insertId: z.union([z.string(), z.number().int().safe()]),
});
const fields = ['id', 'name', 'created_at', 'updated_at', 'revision'];
const projection = fields.map(field => `\`${field}\``).join(', ');
const completionFields = ['topic_id', 'date', 'created_at', 'revision'];
const completionProjection = completionFields.map(field => `\`${field}\``).join(', ');
const pageSize = 100;
const pageLimit = pageSize + 1;
const schemaValidationTtlMs = 5 * 60_000;
export const topicColumns = [
    { name: 'id', type: 'VARCHAR', length: 36, primaryKey: true },
    { name: 'name', type: 'VARCHAR', length: 200, unique: true },
    { name: 'created_at', type: 'VARCHAR', length: 24 },
    { name: 'updated_at', type: 'VARCHAR', length: 24 },
    { name: 'revision', type: 'VARCHAR', length: 36 },
];
export function recordsTableSql(name) {
    if (!/^[a-z][a-z0-9_]{0,63}$/u.test(name))
        throw failure('checkin/invalid-config');
    return `CREATE TABLE \`${name}\` (\`topic_id\` VARCHAR(36) NOT NULL, \`date\` VARCHAR(10) NOT NULL, \`created_at\` VARCHAR(24) NOT NULL, \`revision\` VARCHAR(36) NOT NULL, PRIMARY KEY (\`topic_id\`, \`date\`), INDEX \`by_date\` (\`date\`, \`topic_id\`))`;
}
export async function validateTable(client, databaseId, name, role, signal) {
    const schema = await client.parse(await client.request(`/databases/${encodeURIComponent(databaseId)}/tables/${encodeURIComponent(name)}/schema`, signal), tableSchema);
    const indexMatches = (columns, primary = false, unique = false) => schema.indexes.some(index => {
        const group = schema.indexes.filter(candidate => candidate.name === index.name).sort((left, right) => left.sequence - right.sequence);
        return (!primary || index.name === 'PRIMARY') && (!unique || group.every(item => item.unique)) &&
            group.length === columns.length && group.every((item, position) => item.column === columns[position] && item.sequence === position + 1);
    });
    const required = role === 'topics'
        ? { id: 36, name: 200, created_at: 24, updated_at: 24, revision: 36 }
        : { topic_id: 36, date: 10, created_at: 24, revision: 36 };
    if (schema.name !== name || new Set(schema.columns.map(column => column.name)).size !== schema.columns.length ||
        (role === 'topics' ? !indexMatches(['id'], true, true) || !indexMatches(['name'], false, true) || schema.columns.some(column => column.name === 'completed_dates')
            : !indexMatches(['topic_id', 'date'], true, true) || !indexMatches(['date', 'topic_id'])) ||
        Object.entries(required).some(([field, length]) => {
            const column = schema.columns.find(candidate => candidate.name === field);
            const match = /^varchar\((\d+)\)$/iu.exec(column?.type ?? '');
            return !column || column.nullable || column.extra !== '' || !match || Number(match[1]) < length;
        }) ||
        schema.columns.some(column => !Object.hasOwn(required, column.name) && !column.nullable && column.defaultValue == null && !column.extra.includes('auto_increment')))
        throw failure('checkin/invalid-schema');
}
export class PubDatabase {
    apiKey;
    databaseId;
    tableName;
    recordsTableName;
    timeout;
    client;
    databasePath;
    table;
    recordsTable;
    schemaValidatedAt = 0;
    constructor(config) {
        this.apiKey = (config.apiKey ?? process.env.PUB_DATABASE_KEY ?? '').trim();
        this.databaseId = config.databaseId ?? process.env.PUB_DATABASE_ID ?? '';
        this.tableName = config.tableName ?? 'checkin_topics';
        this.recordsTableName = config.recordsTableName ?? 'checkin_records';
        this.timeout = config.requestTimeoutMs ?? 15000;
        if (!this.apiKey || /[\r\n]/u.test(this.apiKey) || !z.uuid().safeParse(this.databaseId).success ||
            [this.tableName, this.recordsTableName].some(name => !/^[a-z][a-z0-9_]{0,63}$/u.test(name)) ||
            this.tableName === this.recordsTableName || !Number.isSafeInteger(this.timeout) || this.timeout < 1)
            throw failure('checkin/invalid-config');
        this.databasePath = `/databases/${encodeURIComponent(this.databaseId)}`;
        this.table = `\`${this.tableName}\``;
        this.recordsTable = `\`${this.recordsTableName}\``;
        this.client = new PubClient(this.apiKey, this.timeout);
    }
    close() { this.client.close(); }
    async request(path, signal, body, write = false) {
        return this.client.request(path, signal, body, write);
    }
    async parse(response, schema) {
        return this.client.parse(response, schema);
    }
    async overview(signal) {
        const response = await this.request('/databases', signal);
        const overview = await this.parse(response, overviewSchema);
        if (!overview.enabled)
            throw failure('checkin/service-disabled');
        const database = overview.databases.find(candidate => candidate.id === this.databaseId);
        if (!database)
            throw failure('checkin/database-not-found');
        if (database.status !== 'ready')
            throw failure('checkin/database-not-ready');
        const table = database.tables.find(candidate => candidate.name === this.tableName);
        if (!table || !database.tables.some(candidate => candidate.name === this.recordsTableName))
            throw failure('checkin/table-not-found');
        return { limits: overview.limits, database, table };
    }
    async prepare(signal, growth = false) {
        const validateSchema = Date.now() - this.schemaValidatedAt >= schemaValidationTtlMs;
        const state = growth || validateSchema ? await this.overview(signal) : undefined;
        if (validateSchema) {
            await validateTable(this.client, this.databaseId, this.tableName, 'topics', signal);
            await validateTable(this.client, this.databaseId, this.recordsTableName, 'records', signal);
            this.schemaValidatedAt = Date.now();
        }
        if (growth && state.database.usedBytes >= state.limits.maxBytes)
            throw failure('checkin/quota-exceeded');
    }
    async execute(kind, sql, params, signal) {
        if (Buffer.byteLength(sql, 'utf8') > 16384 || params.length > 1000 || Buffer.byteLength(JSON.stringify(params), 'utf8') > 65536)
            throw failure('checkin/request-too-large');
        const write = kind !== 'select';
        const response = await this.request(`${this.databasePath}/query`, signal, { sql, params }, write);
        try {
            const result = await this.parse(response, resultSchema);
            if (result.kind !== kind || new Set(result.columns).size !== result.columns.length || result.rows.some(row => row.length !== result.columns.length))
                throw failure('checkin/invalid-response');
            return result;
        }
        catch {
            throw failure(write ? 'checkin/write-uncertain' : 'checkin/invalid-response');
        }
    }
    async select(sql, params, signal) {
        const result = await this.execute('select', sql, params, signal);
        if (result.columns.length !== fields.length || fields.some(field => !result.columns.includes(field)))
            throw failure('checkin/invalid-response');
        return result.rows.map(row => {
            const value = (field) => row[result.columns.indexOf(field)];
            try {
                return recordSchema.parse({
                    id: value('id'), name: value('name'),
                    createdAt: value('created_at'), updatedAt: value('updated_at'), revision: value('revision'),
                });
            }
            catch {
                throw failure('checkin/invalid-data');
            }
        });
    }
    async count(signal, table = this.table, where = '', params = []) {
        const result = await this.execute('select', `SELECT COUNT(*) AS total FROM ${table}${where}`, params, signal);
        const value = result.rows[0]?.[0];
        if (result.columns.length !== 1 || result.columns[0] !== 'total' || result.rows.length !== 1 ||
            !(typeof value === 'string' && /^\d+$/u.test(value) || typeof value === 'number' && Number.isSafeInteger(value) && value >= 0))
            throw failure('checkin/invalid-response');
        return BigInt(value);
    }
    async list(signal) {
        await this.prepare(signal);
        const records = [];
        const ids = new Set();
        let cursor;
        while (true) {
            const page = await this.select(`SELECT ${projection} FROM ${this.table}${cursor ? ' WHERE `id` > ?' : ''} ORDER BY \`id\` LIMIT ${pageLimit}`, cursor ? [cursor] : [], signal);
            if (page.length > pageLimit)
                throw failure('checkin/invalid-response');
            const hasMore = page.length > pageSize;
            for (const record of page.slice(0, pageSize)) {
                if (ids.has(record.id) || cursor !== undefined && record.id <= cursor)
                    throw failure('checkin/inconsistent-read');
                ids.add(record.id);
                records.push(record);
                cursor = record.id;
            }
            if (!hasMore)
                break;
        }
        return records;
    }
    async read(id, signal) {
        const rows = await this.select(`SELECT ${projection} FROM ${this.table} WHERE \`id\` = ? LIMIT 1`, [id], signal);
        if (rows.length > 1 || rows[0] && rows[0].id !== id)
            throw failure('checkin/invalid-response');
        return rows[0] ?? null;
    }
    async get(id, signal) {
        if (!z.uuid().safeParse(id).success)
            throw failure('checkin/topic-not-found');
        await this.prepare(signal);
        return this.read(id, signal);
    }
    async verify(expected, id, signal) {
        try {
            await this.prepare(signal);
            if (!isDeepStrictEqual(await this.read(id, signal), expected))
                throw failure('checkin/write-uncertain');
        }
        catch {
            throw failure('checkin/write-uncertain');
        }
    }
    async create(name, timestamp, signal) {
        await this.prepare(signal, true);
        const record = { id: randomUUID(), name, createdAt: timestamp, updatedAt: timestamp, revision: randomUUID() };
        const result = await this.execute('insert', `INSERT INTO ${this.table} (${projection}) VALUES (?, ?, ?, ?, ?)`, [record.id, name, timestamp, timestamp, record.revision], signal);
        if (result.affectedRows !== 1)
            throw failure('checkin/write-uncertain');
        await this.verify(record, record.id, signal);
        return record;
    }
    async update(previous, patch, timestamp, signal) {
        await this.prepare(signal, true);
        const record = { ...previous, ...patch, updatedAt: timestamp, revision: randomUUID() };
        const result = await this.execute('update', `UPDATE ${this.table} SET \`name\` = ?, \`updated_at\` = ?, \`revision\` = ? WHERE \`id\` = ? AND \`revision\` = ?`, [patch.name, timestamp, record.revision, previous.id, previous.revision], signal);
        if (result.affectedRows === 0)
            throw failure('checkin/concurrent-change');
        if (result.affectedRows !== 1)
            throw failure('checkin/write-uncertain');
        await this.verify(record, record.id, signal);
        return record;
    }
    async delete(previous, signal) {
        await this.prepare(signal);
        const result = await this.execute('delete', `DELETE ${this.table}, ${this.recordsTable} FROM ${this.table} LEFT JOIN ${this.recordsTable} ON ${this.recordsTable}.\`topic_id\` = ${this.table}.\`id\` WHERE ${this.table}.\`id\` = ? AND ${this.table}.\`revision\` = ?`, [previous.id, previous.revision], signal);
        if (result.affectedRows === 0)
            throw failure('checkin/concurrent-change');
        await this.verify(null, previous.id, signal);
        try {
            if (await this.count(signal, this.recordsTable, ' WHERE `topic_id` = ?', [previous.id]) !== 0n)
                throw failure('checkin/write-uncertain');
        }
        catch {
            throw failure('checkin/write-uncertain');
        }
        return result.affectedRows - 1;
    }
    async selectCompletions(where, params, signal, limit = pageSize) {
        const result = await this.execute('select', `SELECT ${completionProjection} FROM ${this.recordsTable}${where} ORDER BY \`date\`, \`topic_id\` LIMIT ${limit}`, params, signal);
        if (result.columns.length !== completionFields.length || completionFields.some(field => !result.columns.includes(field)) || result.rows.length > limit)
            throw failure('checkin/invalid-response');
        return result.rows.map(row => {
            const value = (field) => row[result.columns.indexOf(field)];
            const parsed = completionSchema.safeParse({ topicId: value('topic_id'), date: value('date'), createdAt: value('created_at'), revision: value('revision') });
            if (!parsed.success)
                throw failure('checkin/invalid-data');
            return parsed.data;
        });
    }
    async completions(from, to, topicId, signal) {
        await this.prepare(signal);
        const where = ' WHERE `date` >= ? AND `date` <= ?' + (topicId ? ' AND `topic_id` = ?' : '');
        const params = [from, to, ...(topicId ? [topicId] : [])];
        const records = [];
        let cursor;
        while (true) {
            const page = await this.selectCompletions(where + (cursor ? ' AND (`date` > ? OR (`date` = ? AND `topic_id` > ?))' : ''), [...params, ...(cursor ? [cursor.date, cursor.date, cursor.topicId] : [])], signal, pageLimit);
            if (page.length > pageLimit)
                throw failure('checkin/invalid-response');
            const hasMore = page.length > pageSize;
            for (const record of page.slice(0, pageSize)) {
                if (record.date < from || record.date > to || topicId && record.topicId !== topicId ||
                    cursor && (record.date < cursor.date || record.date === cursor.date && record.topicId <= cursor.topicId))
                    throw failure('checkin/inconsistent-read');
                records.push(record);
                cursor = record;
            }
            if (!hasMore)
                break;
        }
        return records;
    }
    async set(previous, date, completed, timestamp, signal) {
        await this.prepare(signal);
        const where = ' WHERE `topic_id` = ? AND `date` = ?';
        const existing = (await this.selectCompletions(where, [previous.id, date], signal, 1))[0];
        if (Boolean(existing) === completed)
            return;
        if (completed)
            await this.prepare(signal, true);
        const revision = randomUUID();
        const result = completed
            ? await this.execute('insert', `INSERT INTO ${this.recordsTable} (${completionProjection}) SELECT ${this.table}.\`id\`, ?, ?, ? FROM ${this.table} LEFT JOIN ${this.recordsTable} ON ${this.recordsTable}.\`topic_id\` = ${this.table}.\`id\` AND ${this.recordsTable}.\`date\` = ? WHERE ${this.table}.\`id\` = ? AND ${this.table}.\`revision\` = ? AND ${this.recordsTable}.\`topic_id\` IS NULL`, [date, timestamp, revision, date, previous.id, previous.revision], signal)
            : await this.execute('delete', `DELETE FROM ${this.recordsTable}${where} AND \`revision\` = ?`, [previous.id, date, existing.revision], signal);
        if (result.affectedRows === 0)
            throw failure('checkin/concurrent-change');
        if (result.affectedRows !== 1)
            throw failure('checkin/write-uncertain');
        try {
            const current = (await this.selectCompletions(where, [previous.id, date], signal, 1))[0];
            if (completed ? !isDeepStrictEqual(current, { topicId: previous.id, date, createdAt: timestamp, revision }) : current !== undefined)
                throw failure('checkin/write-uncertain');
            if (!await this.read(previous.id, signal))
                throw failure('checkin/write-uncertain');
        }
        catch {
            throw failure('checkin/write-uncertain');
        }
    }
}
//# sourceMappingURL=database.js.map
