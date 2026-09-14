import Schema from "@deepseek-ai/schemastery";
import { Remote, RemoteError, TypertRemoteService } from "@deepseek-ai/dsh-typert-protocol";
import { randomUUID } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { z } from "zod";
import { credentialKey } from "@deepseek-ai/dsh-credentials";
//#region lib/types/host/http.js
function failure(code) {
	return new RemoteError(code, code, {});
}
var PubClient = class {
	apiKey;
	timeout;
	lifetime = new AbortController();
	constructor(apiKey, timeout = 15e3) {
		this.apiKey = apiKey;
		this.timeout = timeout;
		if (!apiKey.trim() || /[\r\n]/u.test(apiKey) || !Number.isSafeInteger(timeout) || timeout < 1) throw failure("checkin/invalid-config");
	}
	close() {
		this.lifetime.abort();
	}
	async request(path, signal, body, write = false) {
		const combined = AbortSignal.any([
			this.lifetime.signal,
			AbortSignal.timeout(this.timeout),
			...signal ? [signal] : []
		]);
		combined.throwIfAborted();
		let response;
		try {
			response = await fetch(`https://zss.pub/api${path}`, {
				method: body === void 0 ? "GET" : "POST",
				headers: {
					"x-api-key": this.apiKey,
					...body === void 0 ? {} : { "Content-Type": "application/json" }
				},
				...body === void 0 ? {} : { body: JSON.stringify(body) },
				signal: combined,
				redirect: "error",
				credentials: "omit"
			});
		} catch {
			throw failure(write ? "checkin/write-uncertain" : "checkin/service-unavailable");
		}
		if (response.ok) return response;
		if (response.status === 400) throw failure("checkin/query-rejected");
		if (response.status === 401 || response.status === 403) throw failure("checkin/unauthorized");
		if (response.status === 404) throw failure("checkin/api-unavailable");
		if (response.status === 409) throw failure("checkin/database-conflict");
		if (response.status === 413) throw failure("checkin/request-too-large");
		if (response.status === 429) throw failure("checkin/rate-limited");
		if (response.status === 503) throw failure("checkin/service-unavailable");
		throw failure(write ? "checkin/write-uncertain" : "checkin/service-unavailable");
	}
	async parse(response, schema) {
		try {
			return schema.parse(await response.json());
		} catch {
			throw failure("checkin/invalid-response");
		}
	}
};
//#endregion
//#region lib/types/host/database.js
const recordSchema = z.object({
	id: z.uuid(),
	name: z.string().min(1).max(200),
	createdAt: z.iso.datetime(),
	updatedAt: z.iso.datetime(),
	revision: z.uuid()
});
const completionSchema = z.object({
	topicId: z.uuid(),
	date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/u).refine((value) => value >= "0001-01-01" && Number.isFinite(Date.parse(`${value}T00:00:00Z`)) && (/* @__PURE__ */ new Date(`${value}T00:00:00Z`)).toISOString().slice(0, 10) === value),
	createdAt: z.iso.datetime(),
	revision: z.uuid()
});
const overviewSchema = z.object({
	enabled: z.boolean(),
	limits: z.object({
		maxDatabases: z.number().int().nonnegative(),
		maxTables: z.number().int().nonnegative(),
		maxBytes: z.number().int().nonnegative()
	}),
	databases: z.array(z.object({
		id: z.uuid(),
		status: z.enum([
			"ready",
			"provisioning",
			"deleting"
		]),
		usedBytes: z.number().int().nonnegative(),
		tables: z.array(z.object({ name: z.string() }))
	}))
});
const tableSchema = z.object({
	name: z.string(),
	columns: z.array(z.object({
		name: z.string(),
		type: z.string(),
		nullable: z.boolean(),
		defaultValue: z.unknown(),
		key: z.string(),
		extra: z.string()
	})),
	indexes: z.array(z.object({
		name: z.string(),
		column: z.string(),
		unique: z.boolean(),
		sequence: z.number().int()
	}))
});
const resultSchema = z.object({
	kind: z.enum([
		"select",
		"insert",
		"update",
		"delete"
	]),
	columns: z.array(z.string()),
	rows: z.array(z.array(z.unknown())).max(500),
	affectedRows: z.number().int().nonnegative(),
	insertId: z.union([z.string(), z.number().int().safe()])
});
const fields = [
	"id",
	"name",
	"created_at",
	"updated_at",
	"revision"
];
const projection = fields.map((field) => `\`${field}\``).join(", ");
const completionFields = [
	"topic_id",
	"date",
	"created_at",
	"revision"
];
const completionProjection = completionFields.map((field) => `\`${field}\``).join(", ");
const pageSize = 100;
const pageLimit = 101;
const schemaValidationTtlMs = 3e5;
const topicColumns = [
	{
		name: "id",
		type: "VARCHAR",
		length: 36,
		primaryKey: true
	},
	{
		name: "name",
		type: "VARCHAR",
		length: 200,
		unique: true
	},
	{
		name: "created_at",
		type: "VARCHAR",
		length: 24
	},
	{
		name: "updated_at",
		type: "VARCHAR",
		length: 24
	},
	{
		name: "revision",
		type: "VARCHAR",
		length: 36
	}
];
function recordsTableSql(name) {
	if (!/^[a-z][a-z0-9_]{0,63}$/u.test(name)) throw failure("checkin/invalid-config");
	return `CREATE TABLE \`${name}\` (\`topic_id\` VARCHAR(36) NOT NULL, \`date\` VARCHAR(10) NOT NULL, \`created_at\` VARCHAR(24) NOT NULL, \`revision\` VARCHAR(36) NOT NULL, PRIMARY KEY (\`topic_id\`, \`date\`), INDEX \`by_date\` (\`date\`, \`topic_id\`))`;
}
async function validateTable(client, databaseId, name, role, signal) {
	const schema = await client.parse(await client.request(`/databases/${encodeURIComponent(databaseId)}/tables/${encodeURIComponent(name)}/schema`, signal), tableSchema);
	const indexMatches = (columns, primary = false, unique = false) => schema.indexes.some((index) => {
		const group = schema.indexes.filter((candidate) => candidate.name === index.name).sort((left, right) => left.sequence - right.sequence);
		return (!primary || index.name === "PRIMARY") && (!unique || group.every((item) => item.unique)) && group.length === columns.length && group.every((item, position) => item.column === columns[position] && item.sequence === position + 1);
	});
	const required = role === "topics" ? {
		id: 36,
		name: 200,
		created_at: 24,
		updated_at: 24,
		revision: 36
	} : {
		topic_id: 36,
		date: 10,
		created_at: 24,
		revision: 36
	};
	if (schema.name !== name || new Set(schema.columns.map((column) => column.name)).size !== schema.columns.length || (role === "topics" ? !indexMatches(["id"], true, true) || !indexMatches(["name"], false, true) || schema.columns.some((column) => column.name === "completed_dates") : !indexMatches(["topic_id", "date"], true, true) || !indexMatches(["date", "topic_id"])) || Object.entries(required).some(([field, length]) => {
		const column = schema.columns.find((candidate) => candidate.name === field);
		const match = /^varchar\((\d+)\)$/iu.exec(column?.type ?? "");
		return !column || column.nullable || column.extra !== "" || !match || Number(match[1]) < length;
	}) || schema.columns.some((column) => !Object.hasOwn(required, column.name) && !column.nullable && column.defaultValue == null && !column.extra.includes("auto_increment"))) throw failure("checkin/invalid-schema");
}
var PubDatabase = class {
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
		this.apiKey = (config.apiKey ?? process.env.PUB_DATABASE_KEY ?? "").trim();
		this.databaseId = config.databaseId ?? process.env.PUB_DATABASE_ID ?? "";
		this.tableName = config.tableName ?? "checkin_topics";
		this.recordsTableName = config.recordsTableName ?? "checkin_records";
		this.timeout = config.requestTimeoutMs ?? 15e3;
		if (!this.apiKey || /[\r\n]/u.test(this.apiKey) || !z.uuid().safeParse(this.databaseId).success || [this.tableName, this.recordsTableName].some((name) => !/^[a-z][a-z0-9_]{0,63}$/u.test(name)) || this.tableName === this.recordsTableName || !Number.isSafeInteger(this.timeout) || this.timeout < 1) throw failure("checkin/invalid-config");
		this.databasePath = `/databases/${encodeURIComponent(this.databaseId)}`;
		this.table = `\`${this.tableName}\``;
		this.recordsTable = `\`${this.recordsTableName}\``;
		this.client = new PubClient(this.apiKey, this.timeout);
	}
	close() {
		this.client.close();
	}
	async request(path, signal, body, write = false) {
		return this.client.request(path, signal, body, write);
	}
	async parse(response, schema) {
		return this.client.parse(response, schema);
	}
	async overview(signal) {
		const response = await this.request("/databases", signal);
		const overview = await this.parse(response, overviewSchema);
		if (!overview.enabled) throw failure("checkin/service-disabled");
		const database = overview.databases.find((candidate) => candidate.id === this.databaseId);
		if (!database) throw failure("checkin/database-not-found");
		if (database.status !== "ready") throw failure("checkin/database-not-ready");
		const table = database.tables.find((candidate) => candidate.name === this.tableName);
		if (!table || !database.tables.some((candidate) => candidate.name === this.recordsTableName)) throw failure("checkin/table-not-found");
		return {
			limits: overview.limits,
			database,
			table
		};
	}
	async prepare(signal, growth = false) {
		const validateSchema = Date.now() - this.schemaValidatedAt >= schemaValidationTtlMs;
		const state = growth || validateSchema ? await this.overview(signal) : void 0;
		if (validateSchema) {
			await validateTable(this.client, this.databaseId, this.tableName, "topics", signal);
			await validateTable(this.client, this.databaseId, this.recordsTableName, "records", signal);
			this.schemaValidatedAt = Date.now();
		}
		if (growth && state.database.usedBytes >= state.limits.maxBytes) throw failure("checkin/quota-exceeded");
	}
	async execute(kind, sql, params, signal) {
		if (Buffer.byteLength(sql, "utf8") > 16384 || params.length > 1e3 || Buffer.byteLength(JSON.stringify(params), "utf8") > 65536) throw failure("checkin/request-too-large");
		const write = kind !== "select";
		const response = await this.request(`${this.databasePath}/query`, signal, {
			sql,
			params
		}, write);
		try {
			const result = await this.parse(response, resultSchema);
			if (result.kind !== kind || new Set(result.columns).size !== result.columns.length || result.rows.some((row) => row.length !== result.columns.length)) throw failure("checkin/invalid-response");
			return result;
		} catch {
			throw failure(write ? "checkin/write-uncertain" : "checkin/invalid-response");
		}
	}
	async select(sql, params, signal) {
		const result = await this.execute("select", sql, params, signal);
		if (result.columns.length !== fields.length || fields.some((field) => !result.columns.includes(field))) throw failure("checkin/invalid-response");
		return result.rows.map((row) => {
			const value = (field) => row[result.columns.indexOf(field)];
			try {
				return recordSchema.parse({
					id: value("id"),
					name: value("name"),
					createdAt: value("created_at"),
					updatedAt: value("updated_at"),
					revision: value("revision")
				});
			} catch {
				throw failure("checkin/invalid-data");
			}
		});
	}
	async count(signal, table = this.table, where = "", params = []) {
		const result = await this.execute("select", `SELECT COUNT(*) AS total FROM ${table}${where}`, params, signal);
		const value = result.rows[0]?.[0];
		if (result.columns.length !== 1 || result.columns[0] !== "total" || result.rows.length !== 1 || !(typeof value === "string" && /^\d+$/u.test(value) || typeof value === "number" && Number.isSafeInteger(value) && value >= 0)) throw failure("checkin/invalid-response");
		return BigInt(value);
	}
	async list(signal) {
		await this.prepare(signal);
		const records = [];
		const ids = /* @__PURE__ */ new Set();
		let cursor;
		while (true) {
			const page = await this.select(`SELECT ${projection} FROM ${this.table}${cursor ? " WHERE `id` > ?" : ""} ORDER BY \`id\` LIMIT ${pageLimit}`, cursor ? [cursor] : [], signal);
			if (page.length > pageLimit) throw failure("checkin/invalid-response");
			const hasMore = page.length > pageSize;
			for (const record of page.slice(0, pageSize)) {
				if (ids.has(record.id) || cursor !== void 0 && record.id <= cursor) throw failure("checkin/inconsistent-read");
				ids.add(record.id);
				records.push(record);
				cursor = record.id;
			}
			if (!hasMore) break;
		}
		return records;
	}
	async read(id, signal) {
		const rows = await this.select(`SELECT ${projection} FROM ${this.table} WHERE \`id\` = ? LIMIT 1`, [id], signal);
		if (rows.length > 1 || rows[0] && rows[0].id !== id) throw failure("checkin/invalid-response");
		return rows[0] ?? null;
	}
	async get(id, signal) {
		if (!z.uuid().safeParse(id).success) throw failure("checkin/topic-not-found");
		await this.prepare(signal);
		return this.read(id, signal);
	}
	async verify(expected, id, signal) {
		try {
			await this.prepare(signal);
			if (!isDeepStrictEqual(await this.read(id, signal), expected)) throw failure("checkin/write-uncertain");
		} catch {
			throw failure("checkin/write-uncertain");
		}
	}
	async create(name, timestamp, signal) {
		await this.prepare(signal, true);
		const record = {
			id: randomUUID(),
			name,
			createdAt: timestamp,
			updatedAt: timestamp,
			revision: randomUUID()
		};
		if ((await this.execute("insert", `INSERT INTO ${this.table} (${projection}) VALUES (?, ?, ?, ?, ?)`, [
			record.id,
			name,
			timestamp,
			timestamp,
			record.revision
		], signal)).affectedRows !== 1) throw failure("checkin/write-uncertain");
		await this.verify(record, record.id, signal);
		return record;
	}
	async update(previous, patch, timestamp, signal) {
		await this.prepare(signal, true);
		const record = {
			...previous,
			...patch,
			updatedAt: timestamp,
			revision: randomUUID()
		};
		const result = await this.execute("update", `UPDATE ${this.table} SET \`name\` = ?, \`updated_at\` = ?, \`revision\` = ? WHERE \`id\` = ? AND \`revision\` = ?`, [
			patch.name,
			timestamp,
			record.revision,
			previous.id,
			previous.revision
		], signal);
		if (result.affectedRows === 0) throw failure("checkin/concurrent-change");
		if (result.affectedRows !== 1) throw failure("checkin/write-uncertain");
		await this.verify(record, record.id, signal);
		return record;
	}
	async delete(previous, signal) {
		await this.prepare(signal);
		const result = await this.execute("delete", `DELETE ${this.table}, ${this.recordsTable} FROM ${this.table} LEFT JOIN ${this.recordsTable} ON ${this.recordsTable}.\`topic_id\` = ${this.table}.\`id\` WHERE ${this.table}.\`id\` = ? AND ${this.table}.\`revision\` = ?`, [previous.id, previous.revision], signal);
		if (result.affectedRows === 0) throw failure("checkin/concurrent-change");
		await this.verify(null, previous.id, signal);
		try {
			if (await this.count(signal, this.recordsTable, " WHERE `topic_id` = ?", [previous.id]) !== 0n) throw failure("checkin/write-uncertain");
		} catch {
			throw failure("checkin/write-uncertain");
		}
		return result.affectedRows - 1;
	}
	async selectCompletions(where, params, signal, limit = pageSize) {
		const result = await this.execute("select", `SELECT ${completionProjection} FROM ${this.recordsTable}${where} ORDER BY \`date\`, \`topic_id\` LIMIT ${limit}`, params, signal);
		if (result.columns.length !== completionFields.length || completionFields.some((field) => !result.columns.includes(field)) || result.rows.length > limit) throw failure("checkin/invalid-response");
		return result.rows.map((row) => {
			const value = (field) => row[result.columns.indexOf(field)];
			const parsed = completionSchema.safeParse({
				topicId: value("topic_id"),
				date: value("date"),
				createdAt: value("created_at"),
				revision: value("revision")
			});
			if (!parsed.success) throw failure("checkin/invalid-data");
			return parsed.data;
		});
	}
	async completions(from, to, topicId, signal) {
		await this.prepare(signal);
		const where = " WHERE `date` >= ? AND `date` <= ?" + (topicId ? " AND `topic_id` = ?" : "");
		const params = [
			from,
			to,
			...topicId ? [topicId] : []
		];
		const records = [];
		let cursor;
		while (true) {
			const page = await this.selectCompletions(where + (cursor ? " AND (`date` > ? OR (`date` = ? AND `topic_id` > ?))" : ""), [...params, ...cursor ? [
				cursor.date,
				cursor.date,
				cursor.topicId
			] : []], signal, pageLimit);
			if (page.length > pageLimit) throw failure("checkin/invalid-response");
			const hasMore = page.length > pageSize;
			for (const record of page.slice(0, pageSize)) {
				if (record.date < from || record.date > to || topicId && record.topicId !== topicId || cursor && (record.date < cursor.date || record.date === cursor.date && record.topicId <= cursor.topicId)) throw failure("checkin/inconsistent-read");
				records.push(record);
				cursor = record;
			}
			if (!hasMore) break;
		}
		return records;
	}
	async set(previous, date, completed, timestamp, signal) {
		await this.prepare(signal);
		const where = " WHERE `topic_id` = ? AND `date` = ?";
		const existing = (await this.selectCompletions(where, [previous.id, date], signal, 1))[0];
		if (Boolean(existing) === completed) return;
		if (completed) await this.prepare(signal, true);
		const revision = randomUUID();
		const result = completed ? await this.execute("insert", `INSERT INTO ${this.recordsTable} (${completionProjection}) SELECT ${this.table}.\`id\`, ?, ?, ? FROM ${this.table} LEFT JOIN ${this.recordsTable} ON ${this.recordsTable}.\`topic_id\` = ${this.table}.\`id\` AND ${this.recordsTable}.\`date\` = ? WHERE ${this.table}.\`id\` = ? AND ${this.table}.\`revision\` = ? AND ${this.recordsTable}.\`topic_id\` IS NULL`, [
			date,
			timestamp,
			revision,
			date,
			previous.id,
			previous.revision
		], signal) : await this.execute("delete", `DELETE FROM ${this.recordsTable}${where} AND \`revision\` = ?`, [
			previous.id,
			date,
			existing.revision
		], signal);
		if (result.affectedRows === 0) throw failure("checkin/concurrent-change");
		if (result.affectedRows !== 1) throw failure("checkin/write-uncertain");
		try {
			const current = (await this.selectCompletions(where, [previous.id, date], signal, 1))[0];
			if (completed ? !isDeepStrictEqual(current, {
				topicId: previous.id,
				date,
				createdAt: timestamp,
				revision
			}) : current !== void 0) throw failure("checkin/write-uncertain");
			if (!await this.read(previous.id, signal)) throw failure("checkin/write-uncertain");
		} catch {
			throw failure("checkin/write-uncertain");
		}
	}
};
//#endregion
//#region lib/types/host/store.js
/** Calendar date in Beijing, independent of the machine's time zone.
* @param now - Instant to project. @returns YYYY-MM-DD date.
*/
function todayInBeijing(now = /* @__PURE__ */ new Date()) {
	return new Intl.DateTimeFormat("en-CA", {
		timeZone: "Asia/Shanghai",
		year: "numeric",
		month: "2-digit",
		day: "2-digit"
	}).format(now);
}
/** Reject impossible or non-canonical dates at the request boundary.
* @param date - Calendar date. @returns Validated date.
*/
function validDate(date) {
	if (!/^\d{4}-\d{2}-\d{2}$/u.test(date) || date < "0001-01-01" || !Number.isFinite(Date.parse(`${date}T00:00:00Z`)) || (/* @__PURE__ */ new Date(`${date}T00:00:00Z`)).toISOString().slice(0, 10) !== date) throw failure("checkin/invalid-date");
	return date;
}
/** Resolve an inclusive month range without using the local machine time zone.
* @param month - YYYY-MM month. @returns First and last calendar date.
*/
function monthRange(month) {
	const from = validDate(`${month}-01`);
	const end = /* @__PURE__ */ new Date(`${from}T00:00:00Z`);
	end.setUTCMonth(end.getUTCMonth() + 1, 0);
	return {
		from,
		to: end.toISOString().slice(0, 10)
	};
}
function validName(value) {
	const name = value.trim();
	if (!name || name.length > 200) throw failure("checkin/invalid-name");
	return name;
}
var CheckinStore = class {
	now;
	database;
	queue = Promise.resolve();
	constructor(config, now = () => /* @__PURE__ */ new Date()) {
		this.now = now;
		this.database = new PubDatabase(config);
	}
	serialize(run, signal) {
		const pending = this.queue.then(() => {
			signal?.throwIfAborted();
			return run();
		});
		this.queue = pending.catch(() => {});
		return pending;
	}
	data(record) {
		try {
			if (validName(record.name) !== record.name) throw failure("checkin/invalid-data");
		} catch {
			throw failure("checkin/invalid-data");
		}
		return record;
	}
	topic(record) {
		return {
			id: record.id,
			name: this.data(record).name,
			createdAt: record.createdAt,
			updatedAt: record.updatedAt
		};
	}
	async record(id, signal) {
		const record = await this.database.get(id, signal);
		if (!record) throw failure("checkin/topic-not-found");
		this.data(record);
		return record;
	}
	async records(signal) {
		const records = await this.database.list(signal);
		for (const record of records) this.data(record);
		return records.sort((left, right) => left.createdAt.localeCompare(right.createdAt) || left.id.localeCompare(right.id));
	}
	close() {
		this.database.close();
	}
	list(signal) {
		return this.serialize(async () => {
			const records = await this.records(signal);
			return {
				today: todayInBeijing(this.now()),
				timeZone: "Asia/Shanghai",
				topics: records.map((record) => this.topic(record))
			};
		}, signal);
	}
	async create(rawName, signal) {
		const name = validName(rawName);
		return this.serialize(async () => {
			if ((await this.records(signal)).some((record) => this.data(record).name === name)) throw failure("checkin/duplicate-name");
			return this.topic(await this.database.create(name, this.now().toISOString(), signal));
		}, signal);
	}
	async update(id, rawName, signal) {
		const name = validName(rawName);
		return this.serialize(async () => {
			const records = await this.records(signal);
			const record = await this.record(id, signal);
			if (records.some((candidate) => candidate.id !== id && this.data(candidate).name === name)) throw failure("checkin/duplicate-name");
			if (record.name === name) return this.topic(record);
			return this.topic(await this.database.update(record, { name }, this.now().toISOString(), signal));
		}, signal);
	}
	delete(id, signal) {
		return this.serialize(async () => {
			const record = await this.record(id, signal);
			return {
				topic: this.topic(record),
				deletedRecords: await this.database.delete(record, signal)
			};
		}, signal);
	}
	async set(request, signal) {
		const today = todayInBeijing(this.now());
		const date = validDate(request.date ?? today);
		if (date > today) throw failure("checkin/future-date");
		return this.serialize(async () => {
			const record = await this.record(request.topicId, signal);
			const topic = this.topic(record);
			await this.database.set(record, date, request.completed, this.now().toISOString(), signal);
			return {
				topic,
				date,
				completed: request.completed
			};
		}, signal);
	}
	async query(request, signal) {
		const from = validDate(request.from), to = validDate(request.to);
		if (from > to) throw failure("checkin/invalid-range");
		return this.serialize(async () => {
			const records = (await this.records(signal)).filter((record) => request.topicId === void 0 || record.id === request.topicId);
			if (request.topicId !== void 0 && !records.length) throw failure("checkin/topic-not-found");
			const topics = records.map((record) => this.topic(record));
			const rows = await this.database.completions(from, to, request.topicId, signal);
			const ids = new Set(records.map((record) => record.id));
			if (rows.some((row) => !ids.has(row.topicId))) throw failure("checkin/inconsistent-read");
			const completions = rows.map((row) => ({
				topicId: row.topicId,
				date: row.date
			}));
			return {
				today: todayInBeijing(this.now()),
				timeZone: "Asia/Shanghai",
				topics,
				from,
				to,
				completions
			};
		}, signal);
	}
};
//#endregion
//#region lib/types/host/connection.js
const savedSchema = z.object({
	version: z.union([z.literal(1), z.literal(2)]),
	apiKey: z.string().min(1),
	revision: z.uuid(),
	phase: z.enum(["setup", "connected"]),
	databaseId: z.uuid().optional(),
	tableName: z.string().optional(),
	recordsTableName: z.string().optional(),
	pendingDatabaseName: z.string().optional()
});
const resourceSchema = z.object({
	enabled: z.boolean(),
	limits: z.object({
		maxDatabases: z.number().int().nonnegative(),
		maxTables: z.number().int().nonnegative(),
		maxBytes: z.number().int().nonnegative()
	}),
	databases: z.array(z.object({
		id: z.uuid(),
		name: z.string(),
		status: z.enum([
			"ready",
			"provisioning",
			"deleting"
		]),
		usedBytes: z.number().int().nonnegative(),
		tables: z.array(z.object({ name: z.string() }))
	}))
});
const targetSchema = z.object({
	databaseId: z.uuid(),
	tableName: z.string().regex(/^[a-z][a-z0-9_]{0,63}$/u),
	recordsTableName: z.string().regex(/^[a-z][a-z0-9_]{0,63}$/u)
}).refine((target) => target.tableName !== target.recordsTableName);
const nameSchema = z.string().regex(/^[a-z][a-z0-9_]{0,47}$/u);
const recordKey = credentialKey("dsh-checkin", "connection");
var CheckinConnection = class {
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
	close() {
		this.lifetime.abort();
		this.store?.close();
	}
	serial(signal, action) {
		const combined = AbortSignal.any([signal, this.lifetime.signal]);
		const work = this.queue.then(() => {
			combined.throwIfAborted();
			return action(combined);
		});
		this.queue = work.catch(() => void 0);
		return work;
	}
	external() {
		const apiKey = this.config.apiKey ?? process.env.PUB_DATABASE_KEY ?? "";
		const databaseId = this.config.databaseId ?? process.env.PUB_DATABASE_ID ?? "";
		if (this.config.apiKey === void 0 && this.config.databaseId === void 0 && !apiKey && !databaseId) return void 0;
		return {
			...this.config,
			apiKey,
			databaseId
		};
	}
	provider() {
		const provider = this.ctx.get("credentials");
		if (!provider) throw failure("checkin/credentials-unavailable");
		return provider;
	}
	async saved() {
		try {
			const record = await this.provider().readRecord(recordKey);
			if (!record) return void 0;
			if (record.kind !== "grant") throw new Error("invalid record");
			return savedSchema.parse(record.payload);
		} catch {
			throw failure("checkin/credentials-unavailable");
		}
	}
	async save(saved, expectedRevision) {
		try {
			if (!saved) {
				if ((await this.saved())?.revision !== expectedRevision) throw failure("checkin/connection-changed");
				await this.provider().deleteRecord(recordKey);
			} else await this.provider().modifyRecord(recordKey, async (current) => {
				if ((current?.kind === "grant" ? savedSchema.parse(current.payload) : void 0)?.revision !== expectedRevision) throw failure("checkin/connection-changed");
				return {
					kind: "grant",
					payload: saved
				};
			});
		} catch (error) {
			if (error instanceof Error && "code" in error && error.code === "checkin/connection-changed") throw error;
			throw failure("checkin/credentials-unavailable");
		}
		this.store?.close();
		this.store = void 0;
		this.storeSignature = void 0;
	}
	editable() {
		if (this.external()) throw failure("checkin/managed-connection");
	}
	async overview(apiKey, signal) {
		const client = new PubClient(apiKey, this.config.requestTimeoutMs);
		try {
			const result = await client.parse(await client.request("/databases", signal), resourceSchema);
			if (!result.enabled) throw failure("checkin/service-disabled");
			return result;
		} finally {
			client.close();
		}
	}
	async state() {
		const external = this.external();
		if (external) {
			let phase = "connected";
			try {
				new CheckinStore(external).close();
			} catch {
				phase = "invalid";
			}
			return {
				phase,
				source: "host",
				revision: `host:${external.databaseId}:${external.tableName}:${external.recordsTableName}`,
				writable: false,
				...external.databaseId ? { databaseId: external.databaseId } : {},
				tableName: external.tableName ?? "checkin_topics",
				recordsTableName: external.recordsTableName ?? "checkin_records"
			};
		}
		const saved = await this.saved();
		if (!saved) return {
			phase: "login",
			source: "none",
			revision: "none",
			writable: true
		};
		return {
			phase: saved.version === 1 || saved.phase === "connected" && !saved.recordsTableName ? "setup" : saved.phase,
			source: "saved",
			revision: saved.revision,
			writable: true,
			...saved.databaseId ? { databaseId: saved.databaseId } : {},
			...saved.tableName ? { tableName: saved.tableName } : {},
			...saved.recordsTableName ? { recordsTableName: saved.recordsTableName } : {},
			...saved.pendingDatabaseName ? { pendingDatabaseName: saved.pendingDatabaseName } : {}
		};
	}
	connection(signal) {
		return this.serial(signal, () => this.state());
	}
	login(apiKey, signal) {
		return this.serial(signal, async (currentSignal) => {
			this.editable();
			const previous = await this.saved();
			const key = apiKey.trim();
			await this.overview(key, currentSignal);
			currentSignal.throwIfAborted();
			await this.save({
				version: 2,
				apiKey: key,
				revision: randomUUID(),
				phase: "setup"
			}, previous?.revision);
			return this.state();
		});
	}
	resources(signal) {
		return this.serial(signal, async (currentSignal) => {
			const apiKey = this.external()?.apiKey ?? (await this.saved())?.apiKey;
			if (!apiKey) throw failure("checkin/invalid-config");
			return this.overview(apiKey, currentSignal);
		});
	}
	async activate(saved, target, signal) {
		if (!targetSchema.safeParse(target).success) throw failure("checkin/invalid-config");
		const store = new CheckinStore({
			...this.config,
			apiKey: saved.apiKey,
			...target
		});
		try {
			await store.query({
				from: "0001-01-01",
				to: "9999-12-31"
			}, signal);
		} finally {
			store.close();
		}
		signal.throwIfAborted();
		await this.save({
			version: 2,
			apiKey: saved.apiKey,
			revision: randomUUID(),
			phase: "connected",
			...target
		}, saved.revision);
		return this.state();
	}
	connect(target, signal) {
		return this.serial(signal, async (currentSignal) => {
			this.editable();
			const saved = await this.saved();
			if (!saved) throw failure("checkin/invalid-config");
			return this.activate(saved, target, currentSignal);
		});
	}
	initialize(request, signal) {
		return this.serial(signal, async (currentSignal) => {
			this.editable();
			if (request.confirmed !== true) throw failure("checkin/confirmation-required");
			const validTable = (name, existing) => (existing ? z.string().regex(/^[a-z][a-z0-9_]{0,63}$/u) : nameSchema).safeParse(name).success;
			if (!validTable(request.tableName, request.useExistingTopics) || !validTable(request.recordsTableName, request.useExistingRecords) || request.tableName === request.recordsTableName || !request.databaseId && (request.useExistingTopics || request.useExistingRecords) || (request.databaseId ? !z.uuid().safeParse(request.databaseId).success : !nameSchema.safeParse(request.databaseName).success)) throw failure("checkin/invalid-config");
			let saved = await this.saved();
			if (!saved || saved.version === 2 && saved.phase !== "setup") throw failure("checkin/invalid-config");
			let resources = await this.overview(saved.apiKey, currentSignal);
			const creations = Number(!request.useExistingTopics) + Number(!request.useExistingRecords);
			if (creations && (resources.databases.reduce((sum, entry) => sum + entry.usedBytes, 0) >= resources.limits.maxBytes || resources.limits.maxTables < creations)) throw failure("checkin/quota-exceeded");
			const client = new PubClient(saved.apiKey, this.config.requestTimeoutMs);
			try {
				let database = resources.databases.find((candidate) => request.databaseId ? candidate.id === request.databaseId : candidate.name === request.databaseName);
				if (request.databaseId && !database) throw failure("checkin/database-not-found");
				if (request.databaseId && database?.status !== "ready") throw failure("checkin/database-not-ready");
				if (!request.databaseId && database && !(database.status === "provisioning" && saved.pendingDatabaseName === request.databaseName)) throw failure("checkin/database-conflict");
				if (!database || database.status === "provisioning") {
					if (!database && resources.databases.length >= resources.limits.maxDatabases) throw failure("checkin/quota-exceeded");
					const pending = {
						...saved,
						version: 2,
						phase: "setup",
						pendingDatabaseName: request.databaseName,
						tableName: request.tableName,
						recordsTableName: request.recordsTableName,
						revision: randomUUID()
					};
					await this.save(pending, saved.revision);
					saved = pending;
					await client.request("/databases", currentSignal, { name: request.databaseName }, true);
					resources = await this.overview(saved.apiKey, currentSignal);
					database = resources.databases.find((candidate) => candidate.name === request.databaseName);
					if (!database) throw failure("checkin/write-uncertain");
				}
				if (database.status !== "ready") throw failure("checkin/database-not-ready");
				const pending = {
					...saved,
					version: 2,
					phase: "setup",
					databaseId: database.id,
					tableName: request.tableName,
					recordsTableName: request.recordsTableName,
					revision: randomUUID()
				};
				await this.save(pending, saved.revision);
				saved = pending;
				const targets = [{
					name: request.tableName,
					role: "topics",
					existing: request.useExistingTopics
				}, {
					name: request.recordsTableName,
					role: "records",
					existing: request.useExistingRecords
				}];
				for (const target of targets) {
					const exists = database.tables.some((table) => table.name === target.name);
					if (target.existing) {
						if (!exists) throw failure("checkin/table-not-found");
						await validateTable(client, database.id, target.name, target.role, currentSignal);
					} else if (exists) throw failure("checkin/database-conflict");
				}
				if (database.tables.length + creations > resources.limits.maxTables) throw failure("checkin/quota-exceeded");
				for (const target of targets.filter((target) => !target.existing)) {
					resources = await this.overview(saved.apiKey, currentSignal);
					const currentDatabase = resources.databases.find((candidate) => candidate.id === database.id);
					if (!currentDatabase || currentDatabase.status !== "ready") throw failure("checkin/database-not-ready");
					if (currentDatabase.tables.some((table) => table.name === target.name)) throw failure("checkin/database-conflict");
					if (currentDatabase.tables.length >= resources.limits.maxTables || resources.databases.reduce((sum, entry) => sum + entry.usedBytes, 0) >= resources.limits.maxBytes) throw failure("checkin/quota-exceeded");
					if (target.role === "topics") await client.request(`/databases/${encodeURIComponent(database.id)}/tables`, currentSignal, {
						name: target.name,
						columns: topicColumns
					}, true);
					else await client.request(`/databases/${encodeURIComponent(database.id)}/query`, currentSignal, {
						sql: recordsTableSql(target.name),
						params: []
					}, true);
					await validateTable(client, database.id, target.name, target.role, currentSignal);
				}
				return await this.activate(saved, {
					databaseId: database.id,
					tableName: request.tableName,
					recordsTableName: request.recordsTableName
				}, currentSignal);
			} finally {
				client.close();
			}
		});
	}
	logout(signal) {
		return this.serial(signal, async () => {
			this.editable();
			const saved = await this.saved();
			await this.save(void 0, saved?.revision);
			return this.state();
		});
	}
	use(signal, action) {
		return this.serial(signal, async (currentSignal) => {
			let config = this.external();
			if (!config) {
				if (!this.ctx.get("credentials")) throw failure("checkin/invalid-config");
				const saved = await this.saved();
				if (!saved || saved.version !== 2 || saved.phase !== "connected" || !saved.databaseId || !saved.tableName || !saved.recordsTableName) throw failure("checkin/invalid-config");
				config = {
					...this.config,
					apiKey: saved.apiKey,
					databaseId: saved.databaseId,
					tableName: saved.tableName,
					recordsTableName: saved.recordsTableName
				};
			}
			const signature = JSON.stringify(config);
			if (signature !== this.storeSignature) {
				this.store?.close();
				this.store = void 0;
				this.store = new CheckinStore(config);
				this.storeSignature = signature;
			}
			return action(this.store, currentSignal);
		});
	}
};
//#endregion
//#region lib/types/index.js
var __runInitializers = function(thisArg, initializers, value) {
	var useValue = arguments.length > 2;
	for (var i = 0; i < initializers.length; i++) value = useValue ? initializers[i].call(thisArg, value) : initializers[i].call(thisArg);
	return useValue ? value : void 0;
};
var __esDecorate = function(ctor, descriptorIn, decorators, contextIn, initializers, extraInitializers) {
	function accept(f) {
		if (f !== void 0 && typeof f !== "function") throw new TypeError("Function expected");
		return f;
	}
	var kind = contextIn.kind, key = kind === "getter" ? "get" : kind === "setter" ? "set" : "value";
	var target = !descriptorIn && ctor ? contextIn["static"] ? ctor : ctor.prototype : null;
	var descriptor = descriptorIn || (target ? Object.getOwnPropertyDescriptor(target, contextIn.name) : {});
	var _, done = false;
	for (var i = decorators.length - 1; i >= 0; i--) {
		var context = {};
		for (var p in contextIn) context[p] = p === "access" ? {} : contextIn[p];
		for (var p in contextIn.access) context.access[p] = contextIn.access[p];
		context.addInitializer = function(f) {
			if (done) throw new TypeError("Cannot add initializers after decoration has completed");
			extraInitializers.push(accept(f || null));
		};
		var result = (0, decorators[i])(kind === "accessor" ? {
			get: descriptor.get,
			set: descriptor.set
		} : descriptor[key], context);
		if (kind === "accessor") {
			if (result === void 0) continue;
			if (result === null || typeof result !== "object") throw new TypeError("Object expected");
			if (_ = accept(result.get)) descriptor.get = _;
			if (_ = accept(result.set)) descriptor.set = _;
			if (_ = accept(result.init)) initializers.unshift(_);
		} else if (_ = accept(result)) {
			if (kind === "field") initializers.unshift(_);
			else descriptor[key] = _;
		}
	}
	if (target) Object.defineProperty(target, contextIn.name, descriptor);
	done = true;
};
let CheckinService = (() => {
	let _classSuper = TypertRemoteService;
	let _instanceExtraInitializers = [];
	let _connection_decorators;
	let _login_decorators;
	let _resources_decorators;
	let _connect_decorators;
	let _initialize_decorators;
	let _logout_decorators;
	let _list_decorators;
	let _create_decorators;
	let _update_decorators;
	let _delete_decorators;
	let _set_decorators;
	let _query_decorators;
	let _month_decorators;
	return class CheckinService extends _classSuper {
		static {
			const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(_classSuper[Symbol.metadata] ?? null) : void 0;
			_connection_decorators = [Remote];
			_login_decorators = [Remote];
			_resources_decorators = [Remote];
			_connect_decorators = [Remote];
			_initialize_decorators = [Remote];
			_logout_decorators = [Remote];
			_list_decorators = [Remote];
			_create_decorators = [Remote];
			_update_decorators = [Remote];
			_delete_decorators = [Remote];
			_set_decorators = [Remote];
			_query_decorators = [Remote];
			_month_decorators = [Remote];
			__esDecorate(this, null, _connection_decorators, {
				kind: "method",
				name: "connection",
				static: false,
				private: false,
				access: {
					has: (obj) => "connection" in obj,
					get: (obj) => obj.connection
				},
				metadata: _metadata
			}, null, _instanceExtraInitializers);
			__esDecorate(this, null, _login_decorators, {
				kind: "method",
				name: "login",
				static: false,
				private: false,
				access: {
					has: (obj) => "login" in obj,
					get: (obj) => obj.login
				},
				metadata: _metadata
			}, null, _instanceExtraInitializers);
			__esDecorate(this, null, _resources_decorators, {
				kind: "method",
				name: "resources",
				static: false,
				private: false,
				access: {
					has: (obj) => "resources" in obj,
					get: (obj) => obj.resources
				},
				metadata: _metadata
			}, null, _instanceExtraInitializers);
			__esDecorate(this, null, _connect_decorators, {
				kind: "method",
				name: "connect",
				static: false,
				private: false,
				access: {
					has: (obj) => "connect" in obj,
					get: (obj) => obj.connect
				},
				metadata: _metadata
			}, null, _instanceExtraInitializers);
			__esDecorate(this, null, _initialize_decorators, {
				kind: "method",
				name: "initialize",
				static: false,
				private: false,
				access: {
					has: (obj) => "initialize" in obj,
					get: (obj) => obj.initialize
				},
				metadata: _metadata
			}, null, _instanceExtraInitializers);
			__esDecorate(this, null, _logout_decorators, {
				kind: "method",
				name: "logout",
				static: false,
				private: false,
				access: {
					has: (obj) => "logout" in obj,
					get: (obj) => obj.logout
				},
				metadata: _metadata
			}, null, _instanceExtraInitializers);
			__esDecorate(this, null, _list_decorators, {
				kind: "method",
				name: "list",
				static: false,
				private: false,
				access: {
					has: (obj) => "list" in obj,
					get: (obj) => obj.list
				},
				metadata: _metadata
			}, null, _instanceExtraInitializers);
			__esDecorate(this, null, _create_decorators, {
				kind: "method",
				name: "create",
				static: false,
				private: false,
				access: {
					has: (obj) => "create" in obj,
					get: (obj) => obj.create
				},
				metadata: _metadata
			}, null, _instanceExtraInitializers);
			__esDecorate(this, null, _update_decorators, {
				kind: "method",
				name: "update",
				static: false,
				private: false,
				access: {
					has: (obj) => "update" in obj,
					get: (obj) => obj.update
				},
				metadata: _metadata
			}, null, _instanceExtraInitializers);
			__esDecorate(this, null, _delete_decorators, {
				kind: "method",
				name: "delete",
				static: false,
				private: false,
				access: {
					has: (obj) => "delete" in obj,
					get: (obj) => obj.delete
				},
				metadata: _metadata
			}, null, _instanceExtraInitializers);
			__esDecorate(this, null, _set_decorators, {
				kind: "method",
				name: "set",
				static: false,
				private: false,
				access: {
					has: (obj) => "set" in obj,
					get: (obj) => obj.set
				},
				metadata: _metadata
			}, null, _instanceExtraInitializers);
			__esDecorate(this, null, _query_decorators, {
				kind: "method",
				name: "query",
				static: false,
				private: false,
				access: {
					has: (obj) => "query" in obj,
					get: (obj) => obj.query
				},
				metadata: _metadata
			}, null, _instanceExtraInitializers);
			__esDecorate(this, null, _month_decorators, {
				kind: "method",
				name: "month",
				static: false,
				private: false,
				access: {
					has: (obj) => "month" in obj,
					get: (obj) => obj.month
				},
				metadata: _metadata
			}, null, _instanceExtraInitializers);
			if (_metadata) Object.defineProperty(this, Symbol.metadata, {
				enumerable: true,
				configurable: true,
				writable: true,
				value: _metadata
			});
		}
		config = __runInitializers(this, _instanceExtraInitializers);
		static Config = Schema.object({
			apiKey: Schema.string().role("secret"),
			databaseId: Schema.string(),
			tableName: Schema.string().default("checkin_topics"),
			recordsTableName: Schema.string().default("checkin_records"),
			requestTimeoutMs: Schema.number().step(1).min(1).default(15e3),
			refreshIntervalMs: Schema.number().step(1).min(1e3).default(3e4)
		});
		storage;
		/** @param ctx - Host context. @param config - Validated deployment settings. */
		constructor(ctx, config) {
			super(ctx, "checkin");
			this.config = config;
			this.storage = new CheckinConnection(ctx, config);
			ctx.effect(() => () => this.storage.close(), "checkin: cancel database requests");
		}
		async connection(signal) {
			return this.storage.connection(signal);
		}
		async login(request, signal) {
			return this.storage.login(request.apiKey, signal);
		}
		async resources(signal) {
			return this.storage.resources(signal);
		}
		async connect(request, signal) {
			return this.storage.connect(request, signal);
		}
		async initialize(request, signal) {
			return this.storage.initialize(request, signal);
		}
		async logout(signal) {
			return this.storage.logout(signal);
		}
		/** @param signal - Request cancellation. @returns Catalog and Beijing date. */
		async list(signal) {
			return this.storage.use(signal, (store, current) => store.list(current));
		}
		/** @param request - New name. @param signal - Cancellation. @returns Created topic. */
		async create(request, signal) {
			return this.storage.use(signal, (store, current) => store.create(request.name, current));
		}
		/** @param request - Topic and new name. @param signal - Cancellation. @returns Updated topic. */
		async update(request, signal) {
			return this.storage.use(signal, (store, current) => store.update(request.id, request.name, current));
		}
		/** @param request - Topic to delete. @param signal - Cancellation. @returns Removed topic and count. */
		async delete(request, signal) {
			return this.storage.use(signal, (store, current) => store.delete(request.id, current));
		}
		/** @param request - Desired completion status. @param signal - Cancellation. @returns Persisted status. */
		async set(request, signal) {
			return this.storage.use(signal, (store, current) => store.set(request, current));
		}
		/** @param request - Inclusive dates. @param signal - Cancellation. @returns Sparse completions. */
		async query(request, signal) {
			return this.storage.use(signal, (store, current) => store.query(request, current));
		}
		/** @param request - Month, defaulting to Beijing's current month. @param signal - Cancellation. @returns Calendar snapshot. */
		async month(request, signal) {
			signal.throwIfAborted();
			const month = request.month ?? todayInBeijing().slice(0, 7);
			return {
				...await this.storage.use(signal, (store, current) => store.query(monthRange(month), current)),
				month,
				refreshIntervalMs: this.config.refreshIntervalMs
			};
		}
	};
})();
//#endregion
export { CheckinService, CheckinService as default };
