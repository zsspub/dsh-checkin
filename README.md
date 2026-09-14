# dsh-checkin

English | [中文](README.zh.md)

Daily check-in topics for DeepSeek Harness, with model tools and a Host-native right-side tab. Both interfaces use the [zss.pub database management API](https://zss.pub) with a Host-side API key. Hosts configured with the same database and table share data across sessions and workspaces. Local SQLite is no longer used.

## Install

Requires DSH `0.1.5-rc.1` and Node.js `^22.19.0 || >=24.0.0`. Install from the repository, then restart the profile and refresh its browser; pin a verified commit for reproducible deployments:

```sh
dsh plugin --profile web add github:zsspub/dsh-checkin
```

Restart the profile and refresh the browser, then sign in with a database key in the Check-ins tab. Built artifacts are committed; installation needs no lifecycle build. A tarball from `pnpm pack` is also supported.

## First connection

1. Follow **Create an account** to [zss.pub registration](https://zss.pub/register), then [generate a database key](https://zss.pub/databases) with `databases` read/write permissions.
2. Paste the key into the masked field and choose **Verify and continue**. Verification is read-only; write permissions are checked by the server when creating resources or editing data. Remote pages require HTTPS; local loopback development pages are allowed.
3. Review the default `dsh_checkin` database, `checkin_topics` topics table and `checkin_records` daily records table, fields and current quotas, then confirm creation. Each table can instead be selected from existing resources and checked for compatibility. Successful connection opens the calendar without restarting the Host.

The plugin stores a versioned `dsh-checkin/connection` record through `ctx.credentials`. The default provider uses an owner-only Host file, not an encrypted vault. Profiles and sessions sharing that `DSH_HOME` share the record; authenticated Host clients are one trust domain, not isolated tenants. The key travels one way through the authenticated login Remote and is never returned in connection status, written to browser storage/URLs, or sent through model tools/session logs.

**Connection details** offers key replacement and confirmed disconnection. Disconnection removes the saved Host record, not cloud data or the zss.pub key. Tabs on the same page invalidate cached data immediately; other clients recheck on their next refresh. Restarting restores saved connections.

Partially completed initialization preserves created resources and setup state. Refresh and select the existing database/table to continue. Creation is never blindly retried or rolled back with deletion; incompatible tables are never altered. Missing/unwritable credential storage reports a deployment error without preventing Host startup.

## Use

Ask DSH to create a Reading topic, complete it today, backfill yesterday, query a month, rename the topic, undo a day, or delete a topic and its history. Tools discover exact topic IDs before updating them. Topic deletion is permanent; undoing a check-in removes only that day's completion.

Open **Check-ins** at the bottom of the sidebar to open or focus the Host's right-side check-in tab. The month overview shows completed/current topics per day. Select a topic to see its calendar, or select a day to edit completions in the list below. Topic rows offer rename and confirmed deletion. Arrow keys move calendar focus; Home/End select the month's first/last day. The Host provides tab closing, splitting, floating and fullscreen controls.

All dates use **Asia/Shanghai**. Every past date is editable, including dates before topic creation. Future dates are read-only. Historical totals use the current topic catalog, so adding or deleting topics changes their denominator. The visible tab refreshes every 30 seconds and immediately after UI writes, becoming visible again, or returning to the page. Failed writes retain form input. The error Retry button only reloads data; it never resubmits a write.

## Configuration and storage

The following Host-managed mode is optional. Any explicit/environment key or database ID takes precedence as one configuration over the saved connection; incomplete settings report an error instead of mixing accounts. Host-managed connections cannot be replaced or disconnected from this page. Remove external settings and restart to enable page-managed credentials.

1. In zss.pub **Database management**, select or create a dedicated database and prepare both tables below. Existing compatible tables also work; names alone are not sufficient.
2. Generate a key with `databases: ["read", "write"]` permissions. Obtain the database's actual UUID from the overview, not its name.
3. Set `PUB_DATABASE_KEY` and `PUB_DATABASE_ID` in the environment of the DSH Host process. For example, read the key without echoing it in zsh:

```sh
read -rs 'PUB_DATABASE_KEY?Pub database key: '
export PUB_DATABASE_KEY
printf '\n'
export PUB_DATABASE_ID='replace-with-the-real-database-uuid'
dsh --profile web
```

The endpoint is fixed to `https://zss.pub/api`. Requests use only `x-api-key`, prohibit redirects, and omit cookies and extra Bearer credentials. This uses neither raw MySQL nor the habits API. Except for the one-way login submission, the key stays outside check-in data Remotes and model tool arguments. It grants access to all managed databases owned by that user, not only the configured database.

Override the `checkin` row in the profile's `cordis.patch.yml` (credentials and database ID default to the environment variables above):

```yaml
- id: checkin
  config:
    tableName: checkin_topics
    recordsTableName: checkin_records
    requestTimeoutMs: 15000
    refreshIntervalMs: 30000
```

Host config also accepts `databaseId` and secret-role `apiKey`, which take precedence over environment variables. Prefer the environment for credentials to avoid plaintext in config, config dumps or Git. Restart the Host after changing credentials. Configured physical table names match `^[a-z][a-z0-9_]{0,63}$` (structured creation allows 48 characters); no prefix is added or removed. Timeout must be at least 1 ms and refresh interval at least 1000 ms.

The database client is not initialized during Host startup. No configuration opens the login page; incomplete Host settings or invalid UUIDs affect only check-ins. The plugin reads the overview and `/databases/:id/tables/:table/schema` before SQL to check readiness, the real table name, columns and indexes. Database/table creation requires explicit confirmation in the setup page. It never changes accounts automatically, deletes data to free quota, or falls back to SQLite or removed records APIs.

### Required SQL tables

The relationship is `checkin_topics.id` → `checkin_records.topic_id` (one-to-many). Topics contain no date arrays. A record represents a completed day; absence means incomplete.

After confirming the target database and that the tables do not exist, create the topics table using `POST /databases/:id/tables`. The plugin does this only after explicit confirmation:

```json
{
  "name": "checkin_topics",
  "columns": [
    {"name":"id","type":"VARCHAR","length":36,"primaryKey":true},
    {"name":"name","type":"VARCHAR","length":200,"unique":true},
    {"name":"created_at","type":"VARCHAR","length":24},
    {"name":"updated_at","type":"VARCHAR","length":24},
    {"name":"revision","type":"VARCHAR","length":36}
  ]
}
```

Create the records table through `POST /databases/:id/query` with the following SQL and empty `params`. SQL DDL is needed because structured creation cannot express composite keys:

```sql
CREATE TABLE `checkin_records` (
  `topic_id` VARCHAR(36) NOT NULL,
  `date` VARCHAR(10) NOT NULL,
  `created_at` VARCHAR(24) NOT NULL,
  `revision` VARCHAR(36) NOT NULL,
  PRIMARY KEY (`topic_id`, `date`),
  INDEX `by_date` (`date`, `topic_id`)
)
```

All columns are non-nullable. Topics have a primary `id` and unique `name`; names are trimmed to 1–200 characters and database collation controls uniqueness. Records use the composite primary key `(topic_id, date)` to enforce one completion per topic/day, with `(date, topic_id)` supporting month queries. `date` is a canonical Beijing `YYYY-MM-DD` string, retaining the existing `0001`–`9999` range without MySQL DATE's lower bound. The Host generates UUID identities/revisions and UTC ISO timestamps. Record revisions protect undo from deleting a concurrent re-check-in. Topic timestamps change on rename, not on daily check-ins. Extra columns must be nullable or have defaults and are never overwritten. Foreign keys are not supported by this API.

### SQL operations and limitations

- Data access uses `POST /databases/:id/query` with one parameterized statement and scalar `params`. SELECT is read-only despite using HTTP POST. No arbitrary user SQL is exposed through check-in tools.
- Topics use primary-key pagination; records use SQL date-range/optional topic filters and `(date, topic_id)` keyset pagination, both in pages of 100. Reads reject duplicate/non-advancing keys and compare exact counts before/after, preserving bigint precision. Estimated overview counts are ignored. Month reads load the topic catalog but only the selected range of records. Multi-request reads are not transactional snapshots.
- Rename uses `WHERE id = ? AND revision = ?`. Completing a day uses an `INSERT SELECT` guarded by the parent identity/revision and absence of that pair. Undo uses a revision-guarded record DELETE, so different days never overwrite one another.
- Topic deletion uses one guarded multi-table `DELETE ... LEFT JOIN` to remove the parent and its records together, rather than two requests or a foreign-key cascade. `deletedRecords` is the actual affected-row count minus the one topic. Cooperating writers use conditional inserts and the service's serialized SQL execution to avoid orphan rows. Arbitrary external writers must follow these conventions. No cross-request transactions or automatic rollbacks are claimed.
- Writes recheck schema, overview and resulting data; they are never automatically retried. `maxBytes` is a physical soft limit: at/over it INSERT and all UPDATEs are blocked, but record undo and topic deletion use DELETE and remain permitted. Deletion may not reclaim pages. No automatic TRUNCATE, DROP or cleanup occurs.
- The API limits SQL to 16 KiB, parameters to 1000 items/64 KiB, and results to 500 rows/1 MiB. The plugin enforces parameter limits and uses 100-row pages; pages can still hit the result byte limit. HTTP 413 is not a storage quota.
- Network failures, timeouts and failed write verification report an unconfirmed outcome. Refresh and inspect current data before retrying; especially do not blindly repeat topic creation. Errors never pass through response bodies or credentials.

### Upgrading from older storage

This is a breaking storage configuration change: remove `databasePath` and `busyTimeoutMs`, then configure the remote database. The old `$DSH_HOME/checkin/checkin.sqlite3` remains untouched and is no longer opened. No history is uploaded, migrated or deleted automatically; a new empty table starts empty. Historical imports require a separately confirmed scope and backup. Keep databases, exports and credential files private.

The earlier Pub JSON integration is also incompatible: the service has removed `/records`, and historical tables may now appear under their actual physical name, such as `t_checkin_topics`. The plugin never strips that prefix, renames tables, or assumes old `data`/timestamp columns match the new schema. Inspect and back up the old schema/data, then explicitly plan an import into a compatible table. Merely changing `tableName` does not migrate JSON records.

The single SQL table containing `completed_dates` is also incompatible and is explicitly rejected, even when the JSON column is nullable. Saved version-1 connections return to setup; the key stays on the Host, but no old data is migrated, hidden by a schema change, or deleted. Select/create a new compatible pair or separately plan a confirmed migration. Version-2 saved connections persist both names. Initialization needs two available table slots when creating both tables; after partial failure, refresh, explicitly select the created table and create only its missing partner.

## Tools and Remote

| Tool | Operation |
| --- | --- |
| `checkin_topic_create` | Create a named topic. |
| `checkin_topic_list` | Discover topics and the authoritative Beijing date. |
| `checkin_topic_update` | Rename by ID, preserving completions. |
| `checkin_topic_delete` | Delete the topic and all its completions. |
| `checkin_set` | Set an explicit boolean status; omitted date means today. |
| `checkin_query` | Read inclusive dates, optionally filtered by topic ID. |

The typed `checkin` Remote namespace exposes `list/create/update/delete/set/query/month`. `query` returns current topics and sparse completed pairs: absent pairs are incomplete. `month` also returns the refresh interval. UI and tools call the same Host service. Ordinary DSH tool calls/results preserve model-visible results in the Session log.

## Development

```sh
pnpm install
pnpm run check
```

Host and Client compile separately. The virtual analysis workspace in `scripts/generate-typert.mjs` generates the seven Remote declarations; `tsdown` bundles the browser module using the DSH loader format. `check` builds, typechecks, lints, runs focused HTTP database/tool/UI tests and checks tarball contents. Tests use an in-memory HTTP mock and need no real key or live writes.

See [verification evidence](docs/verification.md) for historical model/browser tests; those SQLite-era recordings do not verify the current remote database integration. No reminders, streak rewards, notes, numeric goals, archives, offline write queue or automatic local migration are included.

MIT licensed.
