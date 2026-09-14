# DSH Check-ins

A personal habit calendar for people who already use DSH chat. The user creates named topics, marks each day complete or incomplete, and reviews a month without leaving the conversation. Data lives in separate zss.pub topics and daily check-in tables, accessed with parameterized queries and a Host-side API key, shared across Hosts, workspaces and sessions using that pair.

The primary flow is sidebar entry → current month overview → selected date → completion toggles. Topic creation, renaming and confirmed deletion remain in the drawer. Conversation tools use the same service and data.

First use opens a database-key login page linking to zss.pub registration and database key generation. Read-only key verification leads to existing-resource selection or explicitly confirmed creation of a dedicated database and two tables. Topics store identity, unique name, timestamps and revision. Records store topic identity, date, creation timestamp and revision, with a composite primary key enforcing one record per topic/day. Each table can be selected independently, allowing explicit recovery after partial initialization. Host credential storage remembers both names across restarts; same-Host clients share the connection. Disconnection removes only the saved connection, not cloud resources. Complete external Host configuration remains authoritative, and partial configuration never borrows saved credentials. Legacy single-table connections return to setup without data migration or deletion.

The approved scope is binary daily tracking in Beijing time, with arbitrary historical backfill and read-only future dates. Historical totals use the current topics. No start date, reminder, reward, notes, numeric goal, archive, offline write queue or automatic historical data migration is included. SQL writes check the previously read revision; external writers must follow that convention too. There are no cross-request transactions.

The interface inherits DSH's existing visual system. It must remain legible in host light/dark themes, keep the conversation reachable, and fit narrow screens. Failure must preserve input and offer retry.
