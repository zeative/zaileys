# Plan — decouple dist typings from optional peers (pg, redis)

Spec: ../SPEC.md

## Dependency graph

```
T1 shared Like types (pg)  ──▶ T2 migrate pg adapters (auth+store)
T3 shared Like types (redis) ─▶ T4 migrate redis adapters (auth+store)
T2 + T4 ──▶ CHECKPOINT A (build + dist grep + consumer sim)
CHECKPOINT A ──▶ T5 regression guards (type test + post-build grep)
T5 ──▶ T6 docs + changeset ──▶ CHECKPOINT B (final verify)
```

pg and redis slices are independent — can land in either order. Each slice is vertical: types → both adapters → build → verify.

## Key facts (from code read)

- Leak source: exported option interfaces (`PostgresAuthStoreOptions.pool?: Pool`, `RedisAuthStoreOptions.client?: RedisClientType`, store equivalents) AND private class members typed `Pool`/`RedisClientType` — rollup-plugin-dts emits both into `dist/index.d.ts:4-5` as hard imports.
- `type PgModule = typeof import('pg')` is un-exported and used only in impl → verify post-build it doesn't leak; if it does, cast dynamic import to a minimal ctor shape instead.
- Every internal usage must be typed against Like interfaces (any reference to `pg`/`redis` types anywhere in an emitted declaration resolves the module).

### pg surface actually used
`Pool`: `query(sql, params?) → {rows}` (generic row), `connect() → PoolClient`, `end()`; `PoolClient`: `query`, `release()`. Plus `new Pool({connectionString, max})` via dynamic import.

### redis surface actually used
Client: `get set del(k|k[]) mGet hGet hSet hmGet hGetAll sAdd sRem sMembers sIsMember zAdd zRangeByScore scan multi connect quit isOpen`. Multi builder: `set del sAdd sRem hSet zAdd` (chainable, return this) + `exec()`. `scan(cursor, {MATCH, COUNT}) → {cursor, keys}`. `createClient({url})` via dynamic import.

Design: loose param types (e.g. `unknown[]` for query params), precise-enough returns for internal code. Real `pg.Pool` / redis client must remain structurally assignable (acceptance #2). Name them `PgPoolLike`, `PgPoolClientLike`, `RedisClientLike`, `RedisMultiLike` in one shared file `src/types/optional-clients.ts` (both auth+store import it).

---

## Tasks

### T1 — pg Like types
Create `src/types/optional-clients.ts` with `PgQueryResultLike<R>`, `PgPoolClientLike`, `PgPoolLike`.
- AC: `pnpm typecheck` passes with file compiled (temporarily imported or included).
- Verify: tsgo --noEmit.

### T2 — migrate pg adapters (vertical slice)
`src/auth/adapters/postgres.ts` + `src/store/adapters/postgres.ts`: drop `import type {...} from 'pg'`, type options/fields/locals with Like types; keep dynamic `import('pg')`, cast ctor result.
- AC: `pnpm typecheck && pnpm test` green; `pnpm build && grep "'pg'" dist/index.d.ts` → no match; external-pool option still accepts real `pg.Pool` (devDep) without cast.
- Verify: run commands above.

### T3 — redis Like types
Add `RedisClientLike` + `RedisMultiLike` to same shared file (chainable multi, exec, scan shape).
- AC: typecheck passes.

### T4 — migrate redis adapters (vertical slice)
`src/auth/adapters/redis.ts` + `src/store/adapters/redis.ts`: same treatment; `createClient(...)` cast to `RedisClientLike`.
- AC: typecheck + tests green; `grep "'redis'" dist/index.d.ts` → no match; real redis client (devDep) assignable to `client?:` option.

### CHECKPOINT A — consumer simulation
Scratch dir (outside repo, use session scratchpad): `npm init -y && npm i <packed tgz via pnpm pack>` WITHOUT pg/redis, minimal `index.ts` importing `{ Client }` (+ types), `tsc --noEmit --skipLibCheck false`… realistic: `skipLibCheck: true` (upstream baileys/ws errors are out of scope) but zero errors pointing at `node_modules/zaileys/dist/*`.
- Gate: no TS2307 'pg'/'redis' from zaileys dist. STOP and reassess if rollup still emits imports (fallback: post-process d.ts in tsup onSuccess).

### T5 — regression guards
1. Type test (e.g. `tests/types/optional-clients.test-d.ts` or plain vitest file with compile-time assignments): real `pg.Pool`, real redis client assignable to Like types.
2. Guard: extend tsup `onSuccess` (or `pnpm build` postscript) — fail build if `dist/index.d.ts|d.cts` matches `from '(pg|redis|better-sqlite3|convex)'`.
- AC: guard demonstrably fails when a leak is reintroduced (test once by temporary revert), passes on clean build.

### T6 — docs + changeset
- Docs troubleshooting: (1) bun bundling needs `--target node|bun` (zaileys Node-only, baileys uses node builtins); (2) upstream d.ts errors (`ws`, thread-stream, whatsapp-rust-bridge) → `skipLibCheck: true`.
- Changeset: patch, "fix: remove pg/redis type imports from published typings; consumers without optional peers no longer fail typecheck".
- AC: docs build ok; changeset lints.

### CHECKPOINT B — final
`pnpm typecheck && pnpm test && pnpm build && pnpm size` all green; consumer sim re-run; review diff for API changes (must be none semantically).
