---
phase: 1
plan: 2
wave: 1
---

# Plan 1.2: Refactor Health, Client and Cleanup Logic

## Objective
Migrate secondary database consumers (Health Manager, Background Cleanup, Client API) to LMDB.

## Context
- src/Classes/client.ts
- src/Library/health-manager.ts
- src/Library/cleanup-manager.ts

## Tasks

<task type="auto">
  <name>Update Client Database Return Type</name>
  <files>src/Classes/client.ts</files>
  <action>
    - Update the return type of the `db(scope)` to `RootDatabase` from `lmdb` instead of `JetDB`.
    - Drop `JetDB` import.
  </action>
  <verify>npx tsc --noEmit</verify>
  <done>Client TS types reflect LMDB Database instance correctly.</done>
</task>

<task type="auto">
  <name>Migrate Health Manager Session Repairs</name>
  <files>src/Library/health-manager.ts</files>
  <action>
    - Replace JetDB `.batchDelete(keys)` with LMDB `transaction(() => ...)` deleting the keys via `.remove()`.
    - Delete the `keysDb.flush()` call.
  </action>
  <verify>npx tsc --noEmit</verify>
  <done>Health manager appropriately issues deletes using LMDB's API.</done>
</task>

<task type="auto">
  <name>Migrate Cleanup Manager Queries</name>
  <files>src/Library/cleanup-manager.ts</files>
  <action>
    - Convert complex `.query().where().get()` filter to a fast LMDB `.getRange()` filtering values or scanning keys that contain timestamps.
    - Because LMDB items might have different schemas, ensure iteration only fetches values parsing their timestamps cleanly, or implement secondary indexes later if too slow.
    - Alternatively, migrate to storing time-sorted keys if necessary. Keep it simple: loop through keys and check JSON value timestamp.
  </action>
  <verify>npx tsc --noEmit</verify>
  <done>Cleanup manager safely scans and bulk deletes old elements using LMDB directly.</done>
</task>

## Success Criteria
- [ ] Classes correctly access LMDB native methods.
