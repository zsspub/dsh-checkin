import Schema from "@deepseek-ai/schemastery";
import { Remote, RemoteError, TypertRemoteService } from "@deepseek-ai/dsh-typert-protocol";
import { randomUUID } from "node:crypto";
import { chmodSync, mkdirSync } from "node:fs";
import { dirname, isAbsolute } from "node:path";
import { DatabaseSync } from "node:sqlite";
//#region lib/types/host/store.js
/** SQLite owns the global topic catalog and sparse daily completions. */
function failure(code) {
	return new RemoteError(code, code, {});
}
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
/** One connection, prepared writes, and atomic catalog/record snapshots. */
var CheckinStore = class {
	now;
	db;
	/** @param config - Absolute path and lock timeout. @param now - Clock used by date-sensitive operations. */
	constructor(config, now = () => /* @__PURE__ */ new Date()) {
		this.now = now;
		if (!isAbsolute(config.databasePath) || !Number.isSafeInteger(config.busyTimeoutMs) || config.busyTimeoutMs < 1) throw failure("checkin/invalid-config");
		mkdirSync(dirname(config.databasePath), {
			recursive: true,
			mode: 448
		});
		this.db = new DatabaseSync(config.databasePath);
		try {
			chmodSync(config.databasePath, 384);
			const version = this.db.prepare("PRAGMA user_version").get()?.user_version;
			if (typeof version !== "number" || version > 1) throw failure("checkin/newer-schema");
			this.db.exec(`PRAGMA busy_timeout = ${config.busyTimeoutMs}; PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL;`);
			if (version === 0) this.transaction(() => {
				this.db.exec(`CREATE TABLE topics (id TEXT PRIMARY KEY, name TEXT NOT NULL UNIQUE, createdAt TEXT NOT NULL, updatedAt TEXT NOT NULL);
          CREATE TABLE completions (topicId TEXT NOT NULL REFERENCES topics(id) ON DELETE CASCADE, date TEXT NOT NULL, PRIMARY KEY(topicId, date));
          CREATE INDEX completions_date ON completions(date);
          PRAGMA user_version = 1;`);
			});
		} catch (error) {
			this.db.close();
			throw error;
		}
	}
	transaction(run) {
		this.db.exec("BEGIN IMMEDIATE");
		try {
			const result = run();
			this.db.exec("COMMIT");
			return result;
		} catch (error) {
			this.db.exec("ROLLBACK");
			throw error;
		}
	}
	topic(id) {
		const row = this.db.prepare("SELECT id,name,createdAt,updatedAt FROM topics WHERE id=?").get(id);
		if (!row) throw failure("checkin/topic-not-found");
		return row;
	}
	/** Release the connection when the owning plugin unloads. */
	close() {
		this.db.close();
	}
	/** @returns Current catalog and Beijing date. */
	list() {
		return {
			today: todayInBeijing(this.now()),
			timeZone: "Asia/Shanghai",
			topics: this.db.prepare("SELECT id,name,createdAt,updatedAt FROM topics ORDER BY createdAt,id").all()
		};
	}
	/** @param rawName - User-entered name. @returns Created topic. */
	create(rawName) {
		const name = validName(rawName);
		return this.transaction(() => {
			if (this.db.prepare("SELECT id FROM topics WHERE name=?").get(name)) throw failure("checkin/duplicate-name");
			const topic = {
				id: randomUUID(),
				name,
				createdAt: this.now().toISOString(),
				updatedAt: this.now().toISOString()
			};
			this.db.prepare("INSERT INTO topics VALUES(?,?,?,?)").run(topic.id, name, topic.createdAt, topic.updatedAt);
			return topic;
		});
	}
	/** @param id - Existing topic. @param rawName - Replacement name. @returns Updated topic. */
	update(id, rawName) {
		const name = validName(rawName);
		return this.transaction(() => {
			this.topic(id);
			if (this.db.prepare("SELECT id FROM topics WHERE name=? AND id<>?").get(name, id)) throw failure("checkin/duplicate-name");
			this.db.prepare("UPDATE topics SET name=?,updatedAt=? WHERE id=?").run(name, this.now().toISOString(), id);
			return this.topic(id);
		});
	}
	/** @param id - Topic to permanently remove. @returns Removed topic and completion count. */
	delete(id) {
		return this.transaction(() => {
			const topic = this.topic(id);
			const deletedRecords = Number(this.db.prepare("SELECT count(*) AS count FROM completions WHERE topicId=?").get(id)?.count);
			this.db.prepare("DELETE FROM topics WHERE id=?").run(id);
			return {
				topic,
				deletedRecords
			};
		});
	}
	/** @param request - Explicit desired status. @returns Actual date, topic and status. */
	set(request) {
		const today = todayInBeijing(this.now());
		const date = validDate(request.date ?? today);
		if (date > today) throw failure("checkin/future-date");
		return this.transaction(() => {
			const topic = this.topic(request.topicId);
			if (request.completed) this.db.prepare("INSERT OR IGNORE INTO completions(topicId,date) VALUES(?,?)").run(topic.id, date);
			else this.db.prepare("DELETE FROM completions WHERE topicId=? AND date=?").run(topic.id, date);
			return {
				topic,
				date,
				completed: request.completed
			};
		});
	}
	/** @param request - Inclusive date range. @returns Current topics and sparse completed days. */
	query(request) {
		const from = validDate(request.from), to = validDate(request.to);
		if (from > to) throw failure("checkin/invalid-range");
		return this.transaction(() => {
			const list = this.list();
			const topics = request.topicId === void 0 ? list.topics : [this.topic(request.topicId)];
			const completions = request.topicId === void 0 ? this.db.prepare("SELECT topicId,date FROM completions WHERE date BETWEEN ? AND ? ORDER BY date,topicId").all(from, to) : this.db.prepare("SELECT topicId,date FROM completions WHERE date BETWEEN ? AND ? AND topicId=? ORDER BY date").all(from, to, request.topicId);
			return {
				...list,
				from,
				to,
				topics,
				completions
			};
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
/** Global SQLite service; no session or workspace partitioning. */
let CheckinService = (() => {
	let _classSuper = TypertRemoteService;
	let _instanceExtraInitializers = [];
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
			_list_decorators = [Remote];
			_create_decorators = [Remote];
			_update_decorators = [Remote];
			_delete_decorators = [Remote];
			_set_decorators = [Remote];
			_query_decorators = [Remote];
			_month_decorators = [Remote];
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
			databasePath: Schema.string().required(),
			busyTimeoutMs: Schema.number().step(1).min(1).default(5e3),
			refreshIntervalMs: Schema.number().step(1).min(250).default(3e3)
		});
		store;
		/** @param ctx - Host context. @param config - Validated deployment settings. */
		constructor(ctx, config) {
			super(ctx, "checkin");
			this.config = config;
			this.store = new CheckinStore(config);
			ctx.effect(() => () => this.store.close(), "checkin: close sqlite");
		}
		/** @param signal - Request cancellation. @returns Catalog and Beijing date. */
		async list(signal) {
			signal.throwIfAborted();
			return this.store.list();
		}
		/** @param request - New name. @param signal - Cancellation. @returns Created topic. */
		async create(request, signal) {
			signal.throwIfAborted();
			return this.store.create(request.name);
		}
		/** @param request - Topic and new name. @param signal - Cancellation. @returns Updated topic. */
		async update(request, signal) {
			signal.throwIfAborted();
			return this.store.update(request.id, request.name);
		}
		/** @param request - Topic to delete. @param signal - Cancellation. @returns Removed topic and count. */
		async delete(request, signal) {
			signal.throwIfAborted();
			return this.store.delete(request.id);
		}
		/** @param request - Desired completion status. @param signal - Cancellation. @returns Persisted status. */
		async set(request, signal) {
			signal.throwIfAborted();
			return this.store.set(request);
		}
		/** @param request - Inclusive dates. @param signal - Cancellation. @returns Sparse completions. */
		async query(request, signal) {
			signal.throwIfAborted();
			return this.store.query(request);
		}
		/** @param request - Month, defaulting to Beijing's current month. @param signal - Cancellation. @returns Calendar snapshot. */
		async month(request, signal) {
			signal.throwIfAborted();
			const month = request.month ?? this.store.list().today.slice(0, 7);
			return {
				...this.store.query(monthRange(month)),
				month,
				refreshIntervalMs: this.config.refreshIntervalMs
			};
		}
	};
})();
//#endregion
export { CheckinService, CheckinService as default };
