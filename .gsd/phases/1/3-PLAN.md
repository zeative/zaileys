---
phase: 1
plan: 3
wave: 2
---

# Plan 1.3: Refactor Listener Messages & Socket

## Objective
Migrate complex message parsing queries from JetDB's API structure to LMDB.

## Context
- src/Listener/messages.ts
- src/Listener/index.ts
- src/Config/socket.ts

## Tasks

<task type="auto">
  <name>Migrate Message Upserts & Indexes</name>
  <files>src/Listener/index.ts</files>
  <action>
    - Instead of `db.batchUpsert('messages', messages, 'key.id')`, use an LMDB transaction to iterate over models and `.put(item.key.id, item)`.
    - Drop `.createIndex()` as LMDB doesn't natively use that wrapper technique. We can rely on primary key lookups if `key.id` is the main PK.
  </action>
  <verify>npx tsc --noEmit</verify>
  <done>Listener correctly transaction-saves batch array payloads into LMDB.</done>
</task>

<task type="auto">
  <name>Rewrite Message Retrieve Queries</name>
  <files>
    src/Listener/messages.ts
    src/Config/socket.ts
  </files>
  <action>
    - Replace JetDB `.getByIndex('messages', 'key.id', key.id)` and `.query(output.roomId).where('key.id', '=', universalId).first()` with simple native DB operations like `.get(key.id)` since we will model the DB to be keyed by `key.id`.
    - Update schema logic: `put(item.key.id, item)` natively provides instant `.get(item.key.id)` without index lookups.
  </action>
  <verify>npx tsc --noEmit</verify>
  <done>Message handlers directly retrieve and decode items from LMDB database nodes using direct `.get()` operations.</done>
</task>

## Success Criteria
- [ ] No `.query(...)` calls remain in the Listeners codebase.
- [ ] Batch transactions successfully execute insertions.
