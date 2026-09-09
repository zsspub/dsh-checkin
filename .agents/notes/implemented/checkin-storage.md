# Host-wide daily check-ins

The Host service owns one SQLite database. Agent tools and generated Remote methods call the same operations; the client stores only transient view state. Completion rows are unique by topic and Beijing calendar date, and absence means incomplete. Explicit boolean writes are idempotent, unlike toggle commands retried over a connection.

Topics have no start date. Any historical date can be completed, and overview denominators use the current topic catalog. Deleting a topic removes its completion rows in one transaction. These choices keep binary tracking independent of Session lifetime and workspace identity.

Readers use request cancellation and refuse late results after cancellation, including transports that resolve despite abort. UI writes serialize and refresh after success. The client polls only while the drawer is visible; model writes do not require a new host event or Session format change.

Schema version 1 creates topics and sparse completions. Future migrations advance SQLite user_version transactionally; newer versions are refused. The plugin does not own a separate runtime invariant because every topic/completion relationship is already enforced by the same database's foreign key and unique key.
