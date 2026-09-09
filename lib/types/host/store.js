/** SQLite owns the global topic catalog and sparse daily completions. */
import { randomUUID } from 'node:crypto';
import { chmodSync, mkdirSync } from 'node:fs';
import { dirname, isAbsolute } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { RemoteError } from '@deepseek-ai/dsh-typert-protocol';
function failure(code) { return new RemoteError(code, code, {}); }
/** Current SQLite schema; newer databases are refused without modification. */
export const SCHEMA_VERSION = 1;
/** Calendar date in Beijing, independent of the machine's time zone.
 * @param now - Instant to project. @returns YYYY-MM-DD date.
 */
export function todayInBeijing(now = new Date()) {
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}
/** Reject impossible or non-canonical dates at the request boundary.
 * @param date - Calendar date. @returns Validated date.
 */
export function validDate(date) {
    if (!/^\d{4}-\d{2}-\d{2}$/u.test(date) || date < '0001-01-01' || !Number.isFinite(Date.parse(`${date}T00:00:00Z`)) || new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10) !== date)
        throw failure('checkin/invalid-date');
    return date;
}
/** Resolve an inclusive month range without using the local machine time zone.
 * @param month - YYYY-MM month. @returns First and last calendar date.
 */
export function monthRange(month) {
    const from = validDate(`${month}-01`);
    const end = new Date(`${from}T00:00:00Z`);
    end.setUTCMonth(end.getUTCMonth() + 1, 0);
    return { from, to: end.toISOString().slice(0, 10) };
}
function validName(value) {
    const name = value.trim();
    if (!name || name.length > 200)
        throw failure('checkin/invalid-name');
    return name;
}
/** One connection, prepared writes, and atomic catalog/record snapshots. */
export class CheckinStore {
    now;
    db;
    /** @param config - Absolute path and lock timeout. @param now - Clock used by date-sensitive operations. */
    constructor(config, now = () => new Date()) {
        this.now = now;
        if (!isAbsolute(config.databasePath) || !Number.isSafeInteger(config.busyTimeoutMs) || config.busyTimeoutMs < 1)
            throw failure('checkin/invalid-config');
        mkdirSync(dirname(config.databasePath), { recursive: true, mode: 0o700 });
        this.db = new DatabaseSync(config.databasePath);
        try {
            chmodSync(config.databasePath, 0o600);
            const version = this.db.prepare('PRAGMA user_version').get()?.user_version;
            if (typeof version !== 'number' || version > SCHEMA_VERSION)
                throw failure('checkin/newer-schema');
            this.db.exec(`PRAGMA busy_timeout = ${config.busyTimeoutMs}; PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL;`);
            if (version === 0)
                this.transaction(() => {
                    this.db.exec(`CREATE TABLE topics (id TEXT PRIMARY KEY, name TEXT NOT NULL UNIQUE, createdAt TEXT NOT NULL, updatedAt TEXT NOT NULL);
          CREATE TABLE completions (topicId TEXT NOT NULL REFERENCES topics(id) ON DELETE CASCADE, date TEXT NOT NULL, PRIMARY KEY(topicId, date));
          CREATE INDEX completions_date ON completions(date);
          PRAGMA user_version = 1;`);
                });
        }
        catch (error) {
            this.db.close();
            throw error;
        }
    }
    transaction(run) {
        this.db.exec('BEGIN IMMEDIATE');
        try {
            const result = run();
            this.db.exec('COMMIT');
            return result;
        }
        catch (error) {
            this.db.exec('ROLLBACK');
            throw error;
        }
    }
    topic(id) {
        const row = this.db.prepare('SELECT id,name,createdAt,updatedAt FROM topics WHERE id=?').get(id);
        if (!row)
            throw failure('checkin/topic-not-found');
        return row;
    }
    /** Release the connection when the owning plugin unloads. */
    close() { this.db.close(); }
    /** @returns Current catalog and Beijing date. */
    list() {
        return { today: todayInBeijing(this.now()), timeZone: 'Asia/Shanghai', topics: this.db.prepare('SELECT id,name,createdAt,updatedAt FROM topics ORDER BY createdAt,id').all() };
    }
    /** @param rawName - User-entered name. @returns Created topic. */
    create(rawName) {
        const name = validName(rawName);
        return this.transaction(() => {
            if (this.db.prepare('SELECT id FROM topics WHERE name=?').get(name))
                throw failure('checkin/duplicate-name');
            const topic = { id: randomUUID(), name, createdAt: this.now().toISOString(), updatedAt: this.now().toISOString() };
            this.db.prepare('INSERT INTO topics VALUES(?,?,?,?)').run(topic.id, name, topic.createdAt, topic.updatedAt);
            return topic;
        });
    }
    /** @param id - Existing topic. @param rawName - Replacement name. @returns Updated topic. */
    update(id, rawName) {
        const name = validName(rawName);
        return this.transaction(() => {
            this.topic(id);
            if (this.db.prepare('SELECT id FROM topics WHERE name=? AND id<>?').get(name, id))
                throw failure('checkin/duplicate-name');
            this.db.prepare('UPDATE topics SET name=?,updatedAt=? WHERE id=?').run(name, this.now().toISOString(), id);
            return this.topic(id);
        });
    }
    /** @param id - Topic to permanently remove. @returns Removed topic and completion count. */
    delete(id) {
        return this.transaction(() => {
            const topic = this.topic(id);
            const deletedRecords = Number(this.db.prepare('SELECT count(*) AS count FROM completions WHERE topicId=?').get(id)?.count);
            this.db.prepare('DELETE FROM topics WHERE id=?').run(id);
            return { topic, deletedRecords };
        });
    }
    /** @param request - Explicit desired status. @returns Actual date, topic and status. */
    set(request) {
        const today = todayInBeijing(this.now());
        const date = validDate(request.date ?? today);
        if (date > today)
            throw failure('checkin/future-date');
        return this.transaction(() => {
            const topic = this.topic(request.topicId);
            if (request.completed)
                this.db.prepare('INSERT OR IGNORE INTO completions(topicId,date) VALUES(?,?)').run(topic.id, date);
            else
                this.db.prepare('DELETE FROM completions WHERE topicId=? AND date=?').run(topic.id, date);
            return { topic, date, completed: request.completed };
        });
    }
    /** @param request - Inclusive date range. @returns Current topics and sparse completed days. */
    query(request) {
        const from = validDate(request.from), to = validDate(request.to);
        if (from > to)
            throw failure('checkin/invalid-range');
        return this.transaction(() => {
            const list = this.list();
            const topics = request.topicId === undefined ? list.topics : [this.topic(request.topicId)];
            const completions = (request.topicId === undefined
                ? this.db.prepare('SELECT topicId,date FROM completions WHERE date BETWEEN ? AND ? ORDER BY date,topicId').all(from, to)
                : this.db.prepare('SELECT topicId,date FROM completions WHERE date BETWEEN ? AND ? AND topicId=? ORDER BY date').all(from, to, request.topicId));
            return { ...list, from, to, topics, completions };
        });
    }
}
//# sourceMappingURL=store.js.map
