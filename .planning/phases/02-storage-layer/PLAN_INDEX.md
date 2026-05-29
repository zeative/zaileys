# Phase 2 — Plan Index

**Phase:** 02-storage-layer
**Created:** 2026-05-29
**Plans:** 7 atomic plans across 4 waves
**Single-branch:** `v4` (no worktree isolation; partition by direktori per adapter)
**Max parallel agents:** 20 (per `.planning/config.json#execution`)
**Source contract:** `.planning/phases/02-storage-layer/CONTEXT.md`

---

## Commit Constraints (HARD RULES — apply to ALL plans)

Setiap executor agent yang menjalankan plan di phase ini WAJIB mematuhi:

1. **Branch target**: SEMUA commit ke branch `v4`. JANGAN `git checkout` ke branch lain. JANGAN `git push origin main` atau `git push origin staging`.
2. **No AI attribution**: JANGAN tambahkan `Co-Authored-By: Claude <noreply@anthropic.com>` trailer. JANGAN tambahkan `🤖 Generated with [Claude Code](...)` footer. JANGAN mention "Claude", "AI", "Anthropic" di commit message body.
3. **Conventional commits**: format `<type>(<scope>): <subject>` (e.g., `feat(auth): add SqliteAuthStore`, `feat(store): add RedisMessageStore`, `chore(deps): declare pg as optional peer`).
4. **Atomic commits per task**: setiap task di plan = satu commit terpisah.
5. **No --no-verify**: husky hooks tetap dijalankan (lint + typecheck + audit-comments).
6. **No worktree**: jangan spawn dengan `isolation: 'worktree'`. Semua agen kerja di working tree branch `v4`.
7. **Zero-comment policy**: TIDAK BOLEH ada `// inline`, `/* block */`, `<!-- html -->` comments. TSDoc one-liner only on public API.
8. **Peer deps optional**: `better-sqlite3`, `redis`, `pg` HANYA di `peerDependencies` + `peerDependenciesMeta.optional: true` + `devDependencies`. JANGAN masuk `dependencies`.
9. **STORE-06 independence**: src/store/** TIDAK boleh `import` apa pun dari src/auth/**. Cross-import = plan failure.

---

## Wave Structure & Dependencies

```
Wave 1: plan-001 (interfaces + ZaileysStoreError + barrels)         [solo — locks contracts]
            │
            ├──> Wave 2: plan-002 (contract test suites)             [needs interfaces]
            │            plan-003 (file/memory defaults + tests)     [needs interfaces; doesn't need contracts file — but tests import them, so wave 2 ordering: 002 lands first OR 003 stubs its test runs]
            │              (002 & 003 TRUE PARALLEL — no file overlap. 003 imports from tests/contracts/ which 002 creates; coordinate by having executor of 003 wait for 002's tests/contracts/index.ts file to exist OR run sequentially within the wave)
            │
            └──> Wave 3: plan-004 (sqlite auth+message + tests)      [needs interfaces + contract suite]
                          plan-005 (redis auth+message + tests)       [needs interfaces + contract suite]
                          plan-006 (postgres auth+message + tests)    [needs interfaces + contract suite]
                            (004, 005, 006 fully parallel — DIFFERENT files, only collision is package.json — serialize package.json edits within the wave)
                            │
                            └──> Wave 4: plan-007 (cache wrapper + integration + DEPENDENCIES.md + final smoke) [needs all adapters]
```

**Practical execution order (executor):**
1. `plan-001` solo → wait.
2. `plan-002` first (creates contract suite), then `plan-003` (consumes contract suite). If true parallel desired, run `plan-002` then `plan-003` sequential within wave; or executor agent of plan-003 waits on `tests/contracts/index.ts` artifact existence.
3. `plan-004` + `plan-005` + `plan-006` in parallel. Each touches package.json (peer dep add) — SERIALIZE the package.json write step (3 small atomic edits) but parallel-run the rest of each plan's tasks. Recommend: have one executor run `pnpm install` once after all three add their peer dep stanzas, OR run them sequentially: 004 → 005 → 006.
4. `plan-007` last.

---

## Plan Catalog

| # | Slug | Wave | Files Owned | REQ-IDs | Parallel-safe |
|---|------|------|-------------|---------|---------------|
| 001 | interfaces-and-errors ✅ | 1 | src/auth/types.ts, src/auth/index.ts, src/store/types.ts, src/store/index.ts, src/types/store-error.ts, src/types/index.ts, src/index.ts | AUTH-01, STORE-01, STORE-06 | (solo) |
| 002 | contract-test-suites ✅ | 2 | tests/contracts/auth-store.contract.ts, tests/contracts/message-store.contract.ts, tests/contracts/fixtures.ts, tests/contracts/index.ts | AUTH-01, AUTH-07, STORE-01 | yes (with 003 if 002 lands first) |
| 003 | file-memory-defaults ✅ | 2 | src/auth/adapters/{file,memory,index}.ts, src/auth/index.ts (re-export), src/store/adapters/{memory,index}.ts, src/store/index.ts (re-export), tests/auth/{file,memory}-auth-store.test.ts, tests/store/memory-message-store.test.ts | AUTH-01, AUTH-02, AUTH-07, STORE-01, STORE-02, STORE-06 | yes (with 002 — 003's test files require 002's contract module to exist) |
| 004 | sqlite-adapters | 3 | src/auth/adapters/sqlite.ts, src/auth/adapters/index.ts, src/store/adapters/sqlite.ts, src/store/adapters/index.ts, tests/auth/sqlite-auth-store.test.ts, tests/store/sqlite-message-store.test.ts, package.json (peer + dev) | AUTH-03, STORE-03, STORE-06 | yes (with 005, 006 — serialize package.json edits) |
| 005 | redis-adapters ✅ | 3 | src/auth/adapters/redis.ts, src/auth/adapters/index.ts, src/store/adapters/redis.ts, src/store/adapters/index.ts, tests/auth/redis-auth-store.test.ts, tests/store/redis-message-store.test.ts, package.json (peer + dev) | AUTH-04, STORE-04, STORE-06 | yes (with 004, 006) |
| 006 | postgres-adapters ✅ | 3 | src/auth/adapters/postgres.ts, src/auth/adapters/index.ts, src/store/adapters/postgres.ts, src/store/adapters/index.ts, tests/auth/postgres-auth-store.test.ts, tests/store/postgres-message-store.test.ts, package.json (peer + dev) | AUTH-05, STORE-05, STORE-06 | yes (with 004, 005) |
| 007 | cache-wrapper-and-integration | 4 | src/auth/cache.ts, src/auth/index.ts (re-export), tests/auth/cache.test.ts, tests/integration/cross-backend.test.ts, tests/integration/auth-clear-recovery.test.ts, DEPENDENCIES.md | AUTH-06, AUTH-07, STORE-06 | no (final smoke serializer) |

---

## Requirement Coverage Matrix (13/13 = 100%)

| REQ-ID | Plan(s) | Primary location |
|--------|---------|------------------|
| AUTH-01 | 001, 002, 003 | src/auth/types.ts |
| AUTH-02 | 003 | src/auth/adapters/file.ts |
| AUTH-03 | 004 | src/auth/adapters/sqlite.ts |
| AUTH-04 | 005 | src/auth/adapters/redis.ts |
| AUTH-05 | 006 | src/auth/adapters/postgres.ts |
| AUTH-06 | 007 | src/auth/cache.ts |
| AUTH-07 | 002, 003, 007 | clear() impls + integration test |
| STORE-01 | 001, 002, 003 | src/store/types.ts |
| STORE-02 | 003 | src/store/adapters/memory.ts |
| STORE-03 | 004 | src/store/adapters/sqlite.ts |
| STORE-04 | 005 | src/store/adapters/redis.ts |
| STORE-05 | 006 | src/store/adapters/postgres.ts |
| STORE-06 | 001, 003, 004, 005, 006, 007 | enforced by file ownership + integration test |

**Coverage: 13/13 (100%)** — no gaps.

---

## File Ownership Map (parallelization safety)

| File | Owned by Plan(s) | Notes |
|------|------------------|-------|
| src/auth/types.ts | 001 (finalize) | Phase 1 created skeleton |
| src/auth/index.ts | 001 (interfaces), 003 (adapters re-export), 007 (cache re-export) | Append-only across plans — coordinate barrel additions |
| src/auth/adapters/index.ts | 003, 004, 005, 006 | Each plan APPENDS one `export * from './<adapter>.js'` |
| src/auth/adapters/file.ts | 003 | |
| src/auth/adapters/memory.ts | 003 | |
| src/auth/adapters/sqlite.ts | 004 | |
| src/auth/adapters/redis.ts | 005 | |
| src/auth/adapters/postgres.ts | 006 | |
| src/auth/cache.ts | 007 | |
| src/store/types.ts | 001 | |
| src/store/index.ts | 001 (interfaces), 003 (adapters re-export) | |
| src/store/adapters/index.ts | 003, 004, 005, 006 | Append-only |
| src/store/adapters/memory.ts | 003 | |
| src/store/adapters/sqlite.ts | 004 | |
| src/store/adapters/redis.ts | 005 | |
| src/store/adapters/postgres.ts | 006 | |
| src/types/store-error.ts | 001 | |
| src/types/index.ts | 001 (append store-error re-export) | Phase 1 owns lid-mapping export |
| src/index.ts | 001 (verify re-exports) | |
| tests/contracts/** | 002 | |
| tests/auth/file-auth-store.test.ts | 003 | |
| tests/auth/memory-auth-store.test.ts | 003 | |
| tests/auth/sqlite-auth-store.test.ts | 004 | |
| tests/auth/redis-auth-store.test.ts | 005 | |
| tests/auth/postgres-auth-store.test.ts | 006 | |
| tests/auth/cache.test.ts | 007 | |
| tests/store/memory-message-store.test.ts | 003 | |
| tests/store/sqlite-message-store.test.ts | 004 | |
| tests/store/redis-message-store.test.ts | 005 | |
| tests/store/postgres-message-store.test.ts | 006 | |
| tests/integration/cross-backend.test.ts | 007 | |
| tests/integration/auth-clear-recovery.test.ts | 007 | |
| package.json | 004 (better-sqlite3), 005 (redis), 006 (pg + pg-mem) | Serialize writes; each plan touches DIFFERENT keys but JSON parse-write must serialize |
| pnpm-lock.yaml | 004, 005, 006, 007 | Regenerated by pnpm install; serialize per-plan |
| DEPENDENCIES.md | 007 | Append Phase 2 section |
| .planning/phases/02-storage-layer/02-{NNN}-SUMMARY.md | each plan | |

**Overlap risk: `src/auth/adapters/index.ts`, `src/store/adapters/index.ts`, `src/auth/index.ts`** — multi-touched barrels. Strategy: each plan appends ONE export line; conflicts trivial to resolve (same file, different lines). Coordinate via wave ordering (Wave 2 lands its barrel additions before Wave 3 begins).

**Overlap risk: `package.json`** — plans 004/005/006 each add a peer dep + dev dep. Sub-fields (`peerDependencies.<lib>`, `peerDependenciesMeta.<lib>`, `devDependencies.<lib>`) don't semantically conflict but concurrent JSON parse-write races. Strategy: serialize the 3 package.json edit-and-install steps; parallel-run the rest of each plan's tasks.

---

## Parallel Execution Opportunities

**Wave 1:** plan-001 solo. Locks contracts before parallel work.

**Wave 2:** plan-002 + plan-003 — independent files, but plan-003's test files IMPORT from tests/contracts/ created by plan-002. Two options:
- (A) Sequential within wave: 002 → 003. Simple, safe.
- (B) Parallel with handshake: spawn both; plan-003 executor's Task 1 (Memory adapters) doesn't need contract suite for implementation, only for tests. Plan-003's test tasks block on plan-002's `tests/contracts/index.ts` artifact existence.

Recommend (A) for predictability — Wave 2 is short anyway.

**Wave 3:** plan-004 + plan-005 + plan-006 — TRUE PARALLEL on src/ + tests/, SERIALIZED on package.json. Each plan's Task 1 (peer dep add) must run sequentially; Tasks 2-3 (implementation + tests) run in parallel.

**Wave 4:** plan-007 solo (aggregates everything, runs final smoke).

**Estimated wall-clock saving vs sequential:** ~40-50% (Wave 3's three parallel adapter plans are the biggest win).

---

## Phase 2 Success Criteria Mapping (from ROADMAP.md)

| ROADMAP SC# | Statement | Validated by plan |
|-------------|-----------|-------------------|
| 1 | `new Client({ auth: new FileAuthStore() })` (or omit) persists across restarts; MemoryMessageStore zero-config | 003 (FileAuthStore + MemoryMessageStore), 007 (smoke confirms top-level exports) |
| 2 | AuthStore + MessageStore independent — RedisAuth pairable with PostgresMessage, demonstrated via test | 007 (cross-backend integration test) |
| 3 | Every adapter passes shared contract suite: round-trip every SignalDataTypeMap key (incl. identity-key Uint8Array + tctoken Buffer), 1000 concurrent writes no corruption, close() flushes | 002 (contract authoring) + 003/004/005/006 (each adapter passes it) |
| 4 | makeCacheableSignalKeyStore wraps AuthStore automatically — measurable cache hit via test | 007 (cache wrapper + measurement tests) |
| 5 | On 401/410, AuthStore auto-cleared, fresh QR/pair can succeed | 003/004/005/006 (clear() impls) + 007 (auth-clear-recovery integration test). Phase 3 will wire the disconnect event. |

All five SCs ter-cover.

---

## Discretionary Choices (Claude's call per CONTEXT.md §Claude's Discretion)

| Choice | Plan | Decision |
|--------|------|----------|
| Sub-organization filename | 003-006 | `src/{auth,store}/adapters/<backend>.ts` — single-word backend name |
| Postgres migration strategy | 006 | CREATE TABLE IF NOT EXISTS in `ensureReady()` — no migration tool |
| Expose MemoryAuthStore? | 003 | YES — useful for tests + ephemeral scripts |
| Redis connection lifecycle | 005 | Adapter owns the client ONLY if it created it via `url`; user-provided client stays caller-owned |
| TestContainers for PG/Redis | 005, 006 | DEFER to Phase 8. Phase 2 uses pg-mem (PG) + skipIf REDIS_URL (Redis). |
| Redis library | 005 | `redis@^4.7.0` (node-redis v4 official, Promise-based) — locked in CONTEXT |
| Constructor injection for Redis/PG | 005, 006 | Accept EITHER client/pool (preferred) OR url/connectionString (adapter creates+owns) |
| Peer-dep load timing | 004, 005, 006 | Lazy on first `ensureReady()` call (not in constructor) — allows constructor to remain sync |
| Buffer field round-trip via BufferJSON | all adapters | Use baileys' `BufferJSON.replacer`/`reviver` — locked in CONTEXT §File-based persistence layout |

---

## Hand-off to Phase 3 (Connection Lifecycle)

After all 7 plans complete:
- `new Client({})` defaults: `FileAuthStore` (auth) + `MemoryMessageStore` (store) — Phase 3 wires this fallback
- `makeCacheableAuthStore` available for Phase 3 to wrap user's auth bundle automatically
- `AuthStore.clear()` available for Phase 3's `DisconnectReason.loggedOut`/`connectionReplaced`/`forbidden` handlers (AUTH-07 trigger point)
- `MessageStore.bind(socket)` available for Phase 3 to call when socket attaches
- All 9 adapter classes exported from `zaileys` top-level
- Total Phase 2 test count expected ≥200 (cumulative Phase 1+2 toward Phase 8 ≥1000 target)
- Zero-comment audit (Phase 1 plan-008) passes on all Phase 2 source

---

*Plan index generated: 2026-05-29*
*Phase 2 — 7 plans, 4 waves, 13/13 REQ coverage, parallel-optimised on Wave 3.*
