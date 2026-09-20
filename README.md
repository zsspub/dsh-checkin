# dsh-checkin

English | [中文](README.zh.md)

Daily check-in topics for DeepSeek Harness, with model tools and a Host-native right-side tab. One Host-wide SQLite database, using Node's built-in `node:sqlite`, serves both interfaces across sessions and workspaces.

## Install

Requires DSH `0.1.5-rc.1` and Node.js `^22.19.0 || >=24.0.0`. Install from the repository, then restart the profile and refresh its browser; pin a verified commit for reproducible deployments:

```sh
dsh plugin --profile web add github:zsspub/dsh-checkin
```

Built artifacts are committed; installation needs no lifecycle build. A tarball from `pnpm pack` is also supported.

## Use

Ask DSH to create a Reading topic, complete it today, backfill yesterday, query a month, rename the topic, undo a day, or delete a topic and its history. Tools discover exact topic IDs before updating them. Topic deletion is permanent; undoing a check-in removes only that day's completion.

Open **Check-ins** at the bottom of the sidebar to open or focus the Host's right-side check-in tab. The month overview shows completed/current topics per day. Select a topic to see its calendar, or select a day to edit completions in the list below. Topic rows offer rename and confirmed deletion. The **Data** menu exports a versioned full JSON backup or opens an import preview dialog. Confirmed imports atomically add unseen topic IDs with all their completion records; existing IDs and local changes are skipped. Arrow keys move calendar focus; Home/End select the month's first/last day. The Host provides tab closing, splitting, floating and fullscreen controls.

All dates use **Asia/Shanghai**. Every past date is editable, including dates before topic creation. Future dates are read-only. Historical totals use the current topic catalog, so adding or deleting topics changes their denominator. The visible tab refreshes every three seconds and immediately after UI writes, becoming visible again, or returning to the page. Failed writes retain form input.

## Configuration and storage

Default database: `$DSH_HOME/checkin/checkin.sqlite3`. No check-in data is kept in browser storage. SQLite uses WAL, foreign keys, transactions and monotonic schema versions; a newer schema is refused.

Override the `checkin` row in the profile's `cordis.patch.yml`:

```yaml
- id: checkin
  config:
    databasePath: !!js dshHomePath('checkin/checkin.sqlite3')
    busyTimeoutMs: 5000
    refreshIntervalMs: 3000
```

The path must be absolute; busy timeout must be at least 1 ms and refresh interval at least 250 ms. Trimmed topic names are 1–200 characters and exactly unique. Prefer the panel's JSON import/export for routine migration. Version 2 exports preserve IDs, names, topic timestamps, every completed date and each completion's creation timestamp; imports also accept version 1. Import is incremental: an existing topic ID is skipped as a whole without overwriting local changes, while unseen topics and their completions are inserted in one transaction. A new topic whose name conflicts with a local topic rejects and rolls back the whole import. Backup files are limited to 20 MiB. Stop all DSH processes using the database before directly copying SQLite files. Database, backup and WAL files must remain private.

## Tools and Remote

| Tool | Operation |
| --- | --- |
| `checkin_topic_create` | Create a named topic. |
| `checkin_topic_list` | Discover topics and the authoritative Beijing date. |
| `checkin_topic_update` | Rename by ID, preserving completions. |
| `checkin_topic_delete` | Delete the topic and all its completions. |
| `checkin_set` | Set an explicit boolean status; omitted date means today. |
| `checkin_query` | Read inclusive dates, optionally filtered by topic ID. |

The typed `checkin` Remote namespace exposes `list/create/update/delete/set/query/month/exportData/importData`. `query` returns current topics and sparse completed pairs: absent pairs are incomplete. `month` also returns the refresh interval. Import/export are intentionally UI-only because file selection and confirmation belong to the panel. UI and tools call the same Host service. Ordinary DSH tool calls/results preserve model-visible results in the Session log.

## Development

```sh
pnpm install
pnpm run check
```

Host and Client compile separately. The virtual analysis workspace in `scripts/generate-typert.mjs` generates the seven Remote declarations; `tsdown` bundles the browser module using the DSH loader format. `check` builds, typechecks, lints, runs focused database/tool/UI tests and checks tarball contents. The deterministic tool-output replay snapshot is keyless; it is distinct from a real model run.

See [verification evidence](docs/verification.md) for the actual tested environments and recording. No reminders, streak rewards, notes, numeric goals, archives or cloud sync are included.

MIT licensed.
