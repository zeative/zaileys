---
phase: 1
plan: 1
wave: 1
---

# Plan 1.1: Database Configuration & Auth State

## Objective
Migrate fundamental DB configuration handling and authentication module to LMDB.

## Context
- src/Config/database.ts
- src/Auth/state.ts

## Tasks

<task type="auto">
  <name>Configure Native LMDB</name>
  <files>src/Config/database.ts</files>
  <action>
    - Import `open` from `lmdb`.
    - Change `CredsDatabase`, `KeysDatabase`, and `WaDatabase` to return native `lmdb` instances calling `open({ path: ..., compression: true/false })` natively.
    - Remove JetDB-specific configurations like flushMode, hotThreshold that don't apply directly.
  </action>
  <verify>npm run build</verify>
  <done>database.ts is updated to use solely lmdb.</done>
</task>

<task type="auto">
  <name>Migrate Auth State to LMDB</name>
  <files>src/Auth/state.ts</files>
  <action>
    - Update type handling for `credsDb` and `keysDb`.
    - Replace `keysDb.batchSet(operations)` and `keysDb.batchDelete(deleteKeys)` with a single native LMDB `transaction(() => { ... })` combining `put` and `remove` calls.
    - Remove `.flush()` if unnecessary (LMDB auto-syncs), or ignore as it's safe to drop.
  </action>
  <verify>npm run build</verify>
  <done>Authentication state reads and writes natively using lmdb.</done>
</task>

## Success Criteria
- [ ] database.ts returns LMDB instances.
- [ ] state.ts successfully manipulates those instances directly.
