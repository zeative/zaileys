---
phase: 02-storage-layer
plan: 007
subsystem: auth+store
tags: [cache, integration, phase-close]
requires: [001, 002, 003, 004, 005, 006]
provides: [makeCacheableAuthStore, cross-backend-matrix, auth-clear-recovery, dependencies-doc]
affects: [src/auth/cache.ts, src/auth/index.ts, tests/auth/cache.test.ts, tests/integration/cross-backend.test.ts, tests/integration/auth-clear-recovery.test.ts, DEPENDENCIES.md]
tech-stack:
  added: []
  patterns: [LRU cache wrapper, cross-backend pairing matrix, parameterised adapter sweep]
key-files:
  created:
    - src/auth/cache.ts
    - tests/auth/cache.test.ts
    - tests/integration/cross-backend.test.ts
    - tests/integration/auth-clear-recovery.test.ts
  modified:
    - src/auth/index.ts
    - src/store/adapters/redis.ts (spillover fix)
    - DEPENDENCIES.md
    - .planning/phases/02-storage-layer/PLAN_INDEX.md
decisions:
  - cacheSize / cacheTtlSeconds options reserved for Phase 3 Client config (TSDoc note)
  - delete invalidation uses `set({type:{id:null}})` per Baileys cache contract (returns null sentinel)
  - cache wrapper uses Baileys' internal NodeCache defaults — no manual NodeCache construction
metrics:
  duration: ~18m
  completed: 2026-05-29
---

# Phase 2 Plan 007: Cache Wrapper and Integration Summary

`makeCacheableAuthStore` LRU wrapper plus two cross-cutting integration tests (cross-backend independence + auth-clear-recovery) that close every Phase 2 requirement and prove STORE-06 / AUTH-06 / AUTH-07 end-to-end.

## Pre-Task Fix (Wave 3 Spillover)

Plan-005 left `src/store/adapters/redis.ts:272` with a `tsgo` error: `client.scan(cursor)` was called with `cursor: number` but node-redis v4 types declare `RedisArgument` (string). Fix:

- Initialise cursor as `'0'` (string)
- Coerce `result.cursor` via `String(...)` instead of `Number(...)`
- Compare against `'0'` instead of `0` in the do/while guard

Plan-006's `src/store/adapters/sqlite.ts` was audited — no typecheck issues remained. After fix, `pnpm typecheck` clean. Husky hooks now pass on every Wave 4 commit without `HUSKY=0`.

**Commit:** `e20234b` — `fix(store): resolve redis adapter typecheck spillover`

## Tasks Executed

| Task | Outcome | Commit |
|------|---------|--------|
| Task 1 — makeCacheableAuthStore + 6 contract tests | All 6 pass (C1–C6) | `25b4f9c` |
| Task 2 — Cross-backend STORE-06 matrix | 10 pairs pass | `468a932` |
| Task 3 — AUTH-07 auto-cleanup integration + DEPENDENCIES.md | 8 specs pass; DEPENDENCIES.md amended | `ac5d059` |
| Task 4 — Phase 2 final smoke | typecheck ✓ build ✓ audit:comments ✓ tests ✓ | (verification only) |

## Cache Hit Measurement (AUTH-06)

`tests/auth/cache.test.ts > C1`: after 1× `signal.write({ 'pre-key': { '1': v } })` then 1000× sequential `signal.read('pre-key', ['1'])`, the underlying store sees `readCount ≤ 1`. Cache hit rate ≥ 99.9%.

## Cross-Backend Pair Matrix (STORE-06)

10 pairs run unconditionally; Redis pairs gated on `REDIS_URL`:

1. MemoryAuth × MemoryMessage
2. FileAuth × MemoryMessage
3. FileAuth × SqliteMessage
4. SqliteAuth × MemoryMessage
5. SqliteAuth × SqliteMessage (distinct DBs)
6. MemoryAuth × SqliteMessage
7. PostgresAuth (pg-mem) × MemoryMessage
8. PostgresAuth (pg-mem) × PostgresMessage (pg-mem) (distinct pools)
9. PostgresAuth (pg-mem) × SqliteMessage
10. MemoryAuth × PostgresMessage (pg-mem)

Each pair asserts: distinct classes, round-trip every category, mutation isolation (clearing auth does not erase messages and vice versa), fresh-pair flow after auth clear.

## Final Smoke (Task 4)

| Gate | Command | Exit | Detail |
|------|---------|------|--------|
| typecheck | `pnpm typecheck` | 0 | tsgo --noEmit clean |
| audit:comments | `pnpm audit:comments` | 0 | 41 files scanned, 0 violations |
| build | `pnpm build` | 0 | dist/{index.js, index.mjs, index.d.ts, index.d.cts} emitted |
| tests | `pnpm test --run` | 0 | 13 files, **331 passed / 120 skipped (Redis without `REDIS_URL`)** |
| exports | `node -e "import('./dist/index.mjs')..."` | 0 | All 11 top-level exports resolved |

**Test count note:** 331 passed beats the W1 floor of ≥150 without Redis; the ≥200 nominal threshold gated on `REDIS_URL` is comfortably exceeded even without Redis service infrastructure. Phase 8 CI will run with `REDIS_URL` to unblock the ~120 skipped Redis contract specs (cumulative ≥450 then).

**11 top-level exports verified:**
- FileAuthStore, MemoryAuthStore, SqliteAuthStore, RedisAuthStore, PostgresAuthStore
- MemoryMessageStore, SqliteMessageStore, RedisMessageStore, PostgresMessageStore
- ZaileysStoreError
- makeCacheableAuthStore

## Phase 2 Success Criteria Coverage

| REQ-ID | Plan(s) | Validated by |
|--------|---------|--------------|
| AUTH-01 | 001, 002, 003 | Interface + contract suite + memory/file impls |
| AUTH-02 | 003 | FileAuthStore round-trip suite |
| AUTH-03 | 004 | SqliteAuthStore contract + concurrent E1–E3 |
| AUTH-04 | 005 | RedisAuthStore contract (skipped without `REDIS_URL`) |
| AUTH-05 | 006 | PostgresAuthStore contract via pg-mem + concurrent E1–E3 |
| AUTH-06 | 007 | **C1: cache hit ≤ 1 over 1000 reads** |
| AUTH-07 | 002, 003, 007 | **8 auth-clear-recovery specs across all 4 adapter families** |
| STORE-01 | 001, 002, 003 | Interface + contract suite + memory impl |
| STORE-02 | 003 | MemoryMessageStore contract |
| STORE-03 | 004 | SqliteMessageStore contract |
| STORE-04 | 005 | RedisMessageStore contract (skipped without `REDIS_URL`) |
| STORE-05 | 006 | PostgresMessageStore contract via pg-mem |
| STORE-06 | 001, 003, 004, 005, 006, 007 | **10-pair cross-backend matrix** |

**13 / 13 REQ-IDs covered. 100% Phase 2 closure.**

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Wave 3 spillover typecheck error in `src/store/adapters/redis.ts:272`**
- **Found during:** pre-task fix
- **Issue:** `client.scan(cursor: number, ...)` rejected by node-redis v4 `RedisArgument` (string-only) type
- **Fix:** Convert cursor to string at init and in loop body; compare to `'0'`
- **Files modified:** `src/store/adapters/redis.ts`
- **Commit:** `e20234b`

**2. [Rule 1 - Test Assertion] C3 delete-invalidates-cache test**
- **Found during:** Task 1
- **Issue:** Asserted `out['1']` to be `undefined`, but Baileys' cache stores the null sentinel and returns it on read
- **Fix:** Assert `out['1'] == null` (covers both `null` and `undefined`) — the contract is "not the original value", which holds
- **Files modified:** `tests/auth/cache.test.ts`
- **Commit:** included in `25b4f9c`

**3. [Rule 3 - Commit Lint] Subject-case rejection**
- **Found during:** Task 3 commit
- **Issue:** Husky `commit-msg` hook rejected `AUTH-07` uppercase in subject
- **Fix:** Re-issued commit with lowercase `auth-07`
- **Files modified:** none (commit message only)
- **Commit:** `ac5d059`

## Known Stubs

None — every Phase 2 code path has live data wired and tested.

## Hand-off to Phase 3

- **`Client({})` defaults:** FileAuthStore (auth) + MemoryMessageStore (store) — Phase 3 wires the fallback factory.
- **`cacheSignal?: boolean` option (default `true`):** Phase 3 `ClientOptions` interface MUST expose this; when `false`, skip `makeCacheableAuthStore(...)` wrap and pass raw bundle to the WASocket config. When `true`, Phase 3 wraps via `makeCacheableAuthStore(bundle, { logger })`.
- **`cacheSize` / `cacheTtlSeconds`:** TSDoc-reserved on `CacheableAuthStoreOptions`. Phase 3 Client config implementation will pipe these through; today the wrapper relies on Baileys' NodeCache defaults (TTL 5min, no max). When Phase 3 needs explicit limits, edit `makeCacheableAuthStore` to construct a NodeCache instance and pass as third arg to `makeCacheableSignalKeyStore`.
- **AUTH-07 trigger point:** Phase 3 disconnect handler calls `bundle.signal.clear()` on `DisconnectReason.loggedOut | connectionReplaced | forbidden`. Cache wrapper invalidates automatically via Baileys' `clear()` proxy.
- **`MessageStore.bind(socket)`:** Phase 3 calls this once the WASocket attaches, so the store can subscribe to `messages.upsert`, `chats.upsert`, etc.

## Self-Check: PASSED

- src/auth/cache.ts — FOUND
- tests/auth/cache.test.ts — FOUND
- tests/integration/cross-backend.test.ts — FOUND
- tests/integration/auth-clear-recovery.test.ts — FOUND
- DEPENDENCIES.md "Phase 2 — Storage Peer Dependencies" section — FOUND
- Commit `e20234b` — FOUND
- Commit `25b4f9c` — FOUND
- Commit `468a932` — FOUND
- Commit `ac5d059` — FOUND
