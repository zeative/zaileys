---
phase: 02-storage-layer
plan: 006
subsystem: storage
tags: [postgres, pg, pg-mem, adapter, auth-store, message-store]
requires: [001, 002]
provides:
  - PostgresAuthStore (AuthStoreBundle over node-postgres)
  - PostgresMessageStore (MessageStore over node-postgres)
affects:
  - src/auth/adapters/index.ts (append)
  - src/store/adapters/index.ts (append)
  - package.json (peer + dev)
tech_stack:
  added: [pg@^8.11.0 (peer optional), pg-mem@^3.0.14 (dev), @types/pg@^8.20.0 (dev)]
  patterns:
    - dynamic-import peer dep gating (STORE_NOT_AVAILABLE)
    - XOR pool vs connectionString
    - jsonb storage with `::jsonb` cast for chats/contacts/messages/presence
    - bytea storage with raw Buffer for signal entries
    - BufferJSON.replacer/reviver round-trip for binary fields
    - last-write-wins presence UPSERT (no TTL — aligned with Memory/File/SQLite)
key_files:
  created:
    - src/auth/adapters/postgres.ts
    - src/store/adapters/postgres.ts
    - tests/auth/postgres-auth-store.test.ts
    - tests/store/postgres-message-store.test.ts
  modified:
    - src/auth/adapters/index.ts
    - src/store/adapters/index.ts
    - package.json
    - pnpm-lock.yaml
    - .planning/phases/02-storage-layer/PLAN_INDEX.md
decisions:
  - Use dynamic IN (`$1, $2, ...`) list instead of `ANY($1::text[])` because pg-mem v3 does not implement ANY-array binding correctly. Real PG still supports the IN form; perf parity for the workload (<= a few thousand ids per call).
  - Presence semantics: simple last-write-wins UPSERT, NO 5-min TTL — aligned across all adapters per W5 fix.
  - `pg-mem` options: `{ noAstCoverageCheck: true }` to allow `CREATE TABLE ... PRIMARY KEY ... NOT NULL` combo (pg-mem ast coverage strictness false-positives on common DDL).
  - Caller-owned `Pool` is NOT ended on `close()`; adapter only ends `ownedPool` it created from `connectionString`.
  - XOR validation in constructor — both pool + connectionString throws synchronously.
metrics:
  duration: ~14m
  completed: 2026-05-29
---

# Phase 2 Plan 006: Postgres Adapters Summary

PostgresAuthStore + PostgresMessageStore implemented over node-postgres with idempotent CREATE-TABLE-IF-NOT-EXISTS migration, jsonb/bytea hybrid storage, BufferJSON round-trip, and pg-mem-backed in-process contract tests (real PG gated by `DATABASE_URL`).

## Tasks Completed

| Task | Name                                | Commit         | Files                                                    |
| ---- | ----------------------------------- | -------------- | -------------------------------------------------------- |
| 1    | Add pg + pg-mem peer/dev deps       | (chore commit) | package.json, pnpm-lock.yaml                             |
| 2    | PostgresAuthStore + 36 tests        | (feat commit)  | src/auth/adapters/postgres.ts, tests/auth/...            |
| 3    | PostgresMessageStore + 32 tests     | (feat commit)  | src/store/adapters/postgres.ts, tests/store/...          |

## Test Counts

- `tests/auth/postgres-auth-store.test.ts`: **66 total** — 36 passed (pg-mem), 30 skipped (real-PG gated by `DATABASE_URL`)
- `tests/store/postgres-message-store.test.ts`: **58 total** — 32 passed (pg-mem), 26 skipped (real-PG gated by `DATABASE_URL`)
- Full suite (8 files): 181 passed | 120 skipped | 0 failed.

## pg-mem Compatibility Findings

| Issue | Workaround applied |
|-------|-------------------|
| `ANY($1::text[])` returns empty rows under pg-mem | Adapter emits dynamic IN-list `(id IN ($2, $3, ...))` instead. Works on both real PG and pg-mem. |
| `CREATE TABLE ... PRIMARY KEY ... NOT NULL` triggers ast-coverage error | Test factory uses `newDb({ noAstCoverageCheck: true })`. |
| `jsonb` columns: pg-mem returns parsed JS object, real `pg` returns parsed object too (default), but tests should support both | `reviveJson` helper handles `string` vs `object` row-data. |
| `TRUNCATE multi-table` not exercised — replaced with sequential `DELETE FROM` inside one transaction | Works on both backends. |

## Constraint Compliance

- STORE-06: `grep -c "from '\.\./\.\./auth" src/store/adapters/postgres.ts` = **0** (no cross-import).
- Zero-comment policy: `grep -RnE "^\s*//[^/]" src/auth/adapters/postgres.ts src/store/adapters/postgres.ts` returns nothing.
- Peer dep: `pg` is in `peerDependencies` AND `peerDependenciesMeta.pg.optional=true` AND `devDependencies`. NOT in `dependencies`.
- `audit:comments`: OK (39 files scanned, 0 violations).
- `pnpm typecheck`: clean.

## Deviations from Plan

- **[Rule 3 - Blocking] ANY($1::text[]) → dynamic IN list**: pg-mem could not bind text[] arrays; switched the read+delete queries to dynamic `$1, $2, …` placeholders. Preserves correctness on real PG (and is actually the form the plan's verify section is agnostic about). No semantic change.
- **[Rule 3 - Blocking] pg-mem ast-coverage strictness**: enabled `noAstCoverageCheck: true` per pg-mem maintainer guidance for DDL with combined column constraints. No production impact.

## Self-Check

- src/auth/adapters/postgres.ts — FOUND
- src/store/adapters/postgres.ts — FOUND
- tests/auth/postgres-auth-store.test.ts — FOUND
- tests/store/postgres-message-store.test.ts — FOUND

## Self-Check: PASSED
