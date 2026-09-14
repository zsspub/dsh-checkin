import { credentialKey } from '@deepseek-ai/dsh-credentials';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { CheckinStore } from "./store.js";
import { failure, PubClient } from "./http.js";
import { recordsTableSql, topicColumns, validateTable } from "./database.js";
const savedSchema = z.object({
    version: z.union([z.literal(1), z.literal(2)]), apiKey: z.string().min(1), revision: z.uuid(),
    phase: z.enum(['setup', 'connected']), databaseId: z.uuid().optional(),
    tableName: z.string().optional(), recordsTableName: z.string().optional(), pendingDatabaseName: z.string().optional(),
});
const resourceSchema = z.object({
    enabled: z.boolean(),
    limits: z.object({ maxDatabases: z.number().int().nonnegative(), maxTables: z.number().int().nonnegative(), maxBytes: z.number().int().nonnegative() }),
    databases: z.array(z.object({
        id: z.uuid(), name: z.string(), status: z.enum(['ready', 'provisioning', 'deleting']),
        usedBytes: z.number().int().nonnegative(), tables: z.array(z.object({ name: z.string() })),
    })),
});
const targetSchema = z.object({
    databaseId: z.uuid(), tableName: z.string().regex(/^[a-z][a-z0-9_]{0,63}$/u),
    recordsTableName: z.string().regex(/^[a-z][a-z0-9_]{0,63}$/u),
}).refine(target => target.tableName !== target.recordsTableName);
const nameSchema = z.string().regex(/^[a-z][a-z0-9_]{0,47}$/u);
const recordKey = credentialKey('dsh-checkin', 'connection');
export class CheckinConnection {
    ctx;
    config;
    queue = Promise.resolve();
    lifetime = new AbortController();
    store;
    storeSignature;
    constructor(ctx, config) {
        this.ctx = ctx;
        this.config = config;
    }
    close() { this.lifetime.abort(); this.store?.close(); }
    serial(signal, action) {
        const combined = AbortSignal.any([signal, this.lifetime.signal]);
        const work = this.queue.then(() => { combined.throwIfAborted(); return action(combined); });
        this.queue = work.catch(() => undefined);
        return work;
    }
    external() {
        const apiKey = this.config.apiKey ?? process.env.PUB_DATABASE_KEY ?? '';
        const databaseId = this.config.databaseId ?? process.env.PUB_DATABASE_ID ?? '';
        if (this.config.apiKey === undefined && this.config.databaseId === undefined && !apiKey && !databaseId)
            return undefined;
        return { ...this.config, apiKey, databaseId };
    }
    provider() {
        const provider = this.ctx.get('credentials');
        if (!provider)
            throw failure('checkin/credentials-unavailable');
        return provider;
    }
    async saved() {
        try {
            const record = await this.provider().readRecord(recordKey);
            if (!record)
                return undefined;
            if (record.kind !== 'grant')
                throw new Error('invalid record');
            return savedSchema.parse(record.payload);
        }
        catch {
            throw failure('checkin/credentials-unavailable');
        }
    }
    async save(saved, expectedRevision) {
        try {
            if (!saved) {
                if ((await this.saved())?.revision !== expectedRevision)
                    throw failure('checkin/connection-changed');
                await this.provider().deleteRecord(recordKey);
            }
            else {
                await this.provider().modifyRecord(recordKey, async (current) => {
                    const previous = current?.kind === 'grant' ? savedSchema.parse(current.payload) : undefined;
                    if (previous?.revision !== expectedRevision)
                        throw failure('checkin/connection-changed');
                    return { kind: 'grant', payload: saved };
                });
            }
        }
        catch (error) {
            if (error instanceof Error && 'code' in error && error.code === 'checkin/connection-changed')
                throw error;
            throw failure('checkin/credentials-unavailable');
        }
        this.store?.close();
        this.store = undefined;
        this.storeSignature = undefined;
    }
    editable() { if (this.external())
        throw failure('checkin/managed-connection'); }
    async overview(apiKey, signal) {
        const client = new PubClient(apiKey, this.config.requestTimeoutMs);
        try {
            const result = await client.parse(await client.request('/databases', signal), resourceSchema);
            if (!result.enabled)
                throw failure('checkin/service-disabled');
            return result;
        }
        finally {
            client.close();
        }
    }
    async state() {
        const external = this.external();
        if (external) {
            let phase = 'connected';
            try {
                const store = new CheckinStore(external);
                store.close();
            }
            catch {
                phase = 'invalid';
            }
            return { phase, source: 'host', revision: `host:${external.databaseId}:${external.tableName}:${external.recordsTableName}`, writable: false,
                ...(external.databaseId ? { databaseId: external.databaseId } : {}), tableName: external.tableName ?? 'checkin_topics',
                recordsTableName: external.recordsTableName ?? 'checkin_records' };
        }
        const saved = await this.saved();
        if (!saved)
            return { phase: 'login', source: 'none', revision: 'none', writable: true };
        return { phase: saved.version === 1 || saved.phase === 'connected' && !saved.recordsTableName ? 'setup' : saved.phase, source: 'saved', revision: saved.revision, writable: true,
            ...(saved.databaseId ? { databaseId: saved.databaseId } : {}),
            ...(saved.tableName ? { tableName: saved.tableName } : {}),
            ...(saved.recordsTableName ? { recordsTableName: saved.recordsTableName } : {}),
            ...(saved.pendingDatabaseName ? { pendingDatabaseName: saved.pendingDatabaseName } : {}) };
    }
    connection(signal) { return this.serial(signal, () => this.state()); }
    login(apiKey, signal) {
        return this.serial(signal, async (currentSignal) => {
            this.editable();
            const previous = await this.saved();
            const key = apiKey.trim();
            await this.overview(key, currentSignal);
            currentSignal.throwIfAborted();
            await this.save({ version: 2, apiKey: key, revision: randomUUID(), phase: 'setup' }, previous?.revision);
            return this.state();
        });
    }
    resources(signal) {
        return this.serial(signal, async (currentSignal) => {
            const apiKey = this.external()?.apiKey ?? (await this.saved())?.apiKey;
            if (!apiKey)
                throw failure('checkin/invalid-config');
            return this.overview(apiKey, currentSignal);
        });
    }
    async activate(saved, target, signal) {
        if (!targetSchema.safeParse(target).success)
            throw failure('checkin/invalid-config');
        const store = new CheckinStore({ ...this.config, apiKey: saved.apiKey, ...target });
        try {
            await store.query({ from: '0001-01-01', to: '9999-12-31' }, signal);
        }
        finally {
            store.close();
        }
        signal.throwIfAborted();
        await this.save({ version: 2, apiKey: saved.apiKey, revision: randomUUID(), phase: 'connected', ...target }, saved.revision);
        return this.state();
    }
    connect(target, signal) {
        return this.serial(signal, async (currentSignal) => {
            this.editable();
            const saved = await this.saved();
            if (!saved)
                throw failure('checkin/invalid-config');
            return this.activate(saved, target, currentSignal);
        });
    }
    initialize(request, signal) {
        return this.serial(signal, async (currentSignal) => {
            this.editable();
            if (request.confirmed !== true)
                throw failure('checkin/confirmation-required');
            const validTable = (name, existing) => (existing ? z.string().regex(/^[a-z][a-z0-9_]{0,63}$/u) : nameSchema).safeParse(name).success;
            if (!validTable(request.tableName, request.useExistingTopics) || !validTable(request.recordsTableName, request.useExistingRecords) || request.tableName === request.recordsTableName ||
                !request.databaseId && (request.useExistingTopics || request.useExistingRecords) ||
                (request.databaseId ? !z.uuid().safeParse(request.databaseId).success : !nameSchema.safeParse(request.databaseName).success))
                throw failure('checkin/invalid-config');
            let saved = await this.saved();
            if (!saved || saved.version === 2 && saved.phase !== 'setup')
                throw failure('checkin/invalid-config');
            let resources = await this.overview(saved.apiKey, currentSignal);
            const creations = Number(!request.useExistingTopics) + Number(!request.useExistingRecords);
            if (creations && (resources.databases.reduce((sum, entry) => sum + entry.usedBytes, 0) >= resources.limits.maxBytes || resources.limits.maxTables < creations))
                throw failure('checkin/quota-exceeded');
            const client = new PubClient(saved.apiKey, this.config.requestTimeoutMs);
            try {
                let database = resources.databases.find(candidate => request.databaseId ? candidate.id === request.databaseId : candidate.name === request.databaseName);
                if (request.databaseId && !database)
                    throw failure('checkin/database-not-found');
                if (request.databaseId && database?.status !== 'ready')
                    throw failure('checkin/database-not-ready');
                if (!request.databaseId && database && !(database.status === 'provisioning' && saved.pendingDatabaseName === request.databaseName))
                    throw failure('checkin/database-conflict');
                if (!database || database.status === 'provisioning') {
                    if (!database && resources.databases.length >= resources.limits.maxDatabases)
                        throw failure('checkin/quota-exceeded');
                    const pending = { ...saved, version: 2, phase: 'setup', pendingDatabaseName: request.databaseName, tableName: request.tableName, recordsTableName: request.recordsTableName, revision: randomUUID() };
                    await this.save(pending, saved.revision);
                    saved = pending;
                    await client.request('/databases', currentSignal, { name: request.databaseName }, true);
                    resources = await this.overview(saved.apiKey, currentSignal);
                    database = resources.databases.find(candidate => candidate.name === request.databaseName);
                    if (!database)
                        throw failure('checkin/write-uncertain');
                }
                if (database.status !== 'ready')
                    throw failure('checkin/database-not-ready');
                const pending = { ...saved, version: 2, phase: 'setup', databaseId: database.id, tableName: request.tableName, recordsTableName: request.recordsTableName, revision: randomUUID() };
                await this.save(pending, saved.revision);
                saved = pending;
                const targets = [
                    { name: request.tableName, role: 'topics', existing: request.useExistingTopics },
                    { name: request.recordsTableName, role: 'records', existing: request.useExistingRecords },
                ];
                for (const target of targets) {
                    const exists = database.tables.some(table => table.name === target.name);
                    if (target.existing) {
                        if (!exists)
                            throw failure('checkin/table-not-found');
                        await validateTable(client, database.id, target.name, target.role, currentSignal);
                    }
                    else if (exists)
                        throw failure('checkin/database-conflict');
                }
                if (database.tables.length + creations > resources.limits.maxTables)
                    throw failure('checkin/quota-exceeded');
                for (const target of targets.filter(target => !target.existing)) {
                    resources = await this.overview(saved.apiKey, currentSignal);
                    const currentDatabase = resources.databases.find(candidate => candidate.id === database.id);
                    if (!currentDatabase || currentDatabase.status !== 'ready')
                        throw failure('checkin/database-not-ready');
                    if (currentDatabase.tables.some(table => table.name === target.name))
                        throw failure('checkin/database-conflict');
                    if (currentDatabase.tables.length >= resources.limits.maxTables || resources.databases.reduce((sum, entry) => sum + entry.usedBytes, 0) >= resources.limits.maxBytes)
                        throw failure('checkin/quota-exceeded');
                    if (target.role === 'topics')
                        await client.request(`/databases/${encodeURIComponent(database.id)}/tables`, currentSignal, { name: target.name, columns: topicColumns }, true);
                    else
                        await client.request(`/databases/${encodeURIComponent(database.id)}/query`, currentSignal, { sql: recordsTableSql(target.name), params: [] }, true);
                    await validateTable(client, database.id, target.name, target.role, currentSignal);
                }
                return await this.activate(saved, { databaseId: database.id, tableName: request.tableName, recordsTableName: request.recordsTableName }, currentSignal);
            }
            finally {
                client.close();
            }
        });
    }
    logout(signal) {
        return this.serial(signal, async () => {
            this.editable();
            const saved = await this.saved();
            await this.save(undefined, saved?.revision);
            return this.state();
        });
    }
    use(signal, action) {
        return this.serial(signal, async (currentSignal) => {
            let config = this.external();
            if (!config) {
                if (!this.ctx.get('credentials'))
                    throw failure('checkin/invalid-config');
                const saved = await this.saved();
                if (!saved || saved.version !== 2 || saved.phase !== 'connected' || !saved.databaseId || !saved.tableName || !saved.recordsTableName)
                    throw failure('checkin/invalid-config');
                config = { ...this.config, apiKey: saved.apiKey, databaseId: saved.databaseId, tableName: saved.tableName, recordsTableName: saved.recordsTableName };
            }
            const signature = JSON.stringify(config);
            if (signature !== this.storeSignature) {
                this.store?.close();
                this.store = undefined;
                this.store = new CheckinStore(config);
                this.storeSignature = signature;
            }
            return action(this.store, currentSignal);
        });
    }
}
//# sourceMappingURL=connection.js.map
