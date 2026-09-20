# Host-wide daily check-ins

The Host service owns one SQLite database. Agent tools and generated Remote methods call the same operations; the client stores only transient view state. Completion rows are unique by topic and Beijing calendar date, and absence means incomplete. Explicit boolean writes are idempotent, unlike toggle commands retried over a connection.

Topics have no start date. Any historical date can be completed, and overview denominators use the current topic catalog. Deleting a topic removes its completion rows in one transaction. These choices keep binary tracking independent of Session lifetime and workspace identity.

Readers use request cancellation and refuse late results after cancellation, including transports that resolve despite abort. UI writes serialize and refresh after success. The client polls only while the drawer is visible; model writes do not require a new host event or Session format change.

Schema version 2 stores topics and sparse completions in `checkin_topics` and `checkin_records`. Version 1 databases migrate transactionally without losing topics, timestamps or completed dates; newer versions are refused. The plugin does not own a separate runtime invariant because every topic/completion relationship is already enforced by the same database's foreign key and unique key.

Portable exports use JSON `{ format: "dsh-checkin", version: 2, exportedAt, topics, completions }`; completion entries include `createdAt` so a round trip preserves persistence metadata as well as visible dates. Import also accepts version 1, deriving a missing completion timestamp from `exportedAt`. The shared browser/Host parser strictly validates fields, unique IDs/names, timestamps, dates and topic references. Import is incremental and idempotent: an existing topic ID is skipped as a whole, unseen topics and their completions are inserted inside one transaction, and a local name conflict rejects and rolls back the whole import.
