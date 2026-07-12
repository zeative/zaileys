# SPEC — Fix consumer build/typecheck breakage (optional peer deps leak into dist typings)

## 1. Objective

Consumers of `zaileys` who do NOT install optional peers (`pg`, `redis`) get hard TypeScript errors:

```
node_modules/zaileys/dist/index.d.ts:4:22 - TS2307: Cannot find module 'pg'
node_modules/zaileys/dist/index.d.ts:5:33 - TS2307: Cannot find module 'redis'
```

Cause: `src/auth/adapters/{postgres,redis}.ts` and `src/store/adapters/{postgres,redis}.ts` use `import type { Pool, PoolClient } from 'pg'` / `import type { RedisClientType } from 'redis'`. tsup's dts rollup hoists these into top-level imports in `dist/index.d.ts`, so the published typings *require* optional packages to resolve.

Fix: remove all `pg`/`redis` type imports from source. Replace with local minimal structural interfaces (only the members zaileys actually calls). Result: `dist/index.d.ts` has zero references to optional peer packages; consumers without them typecheck clean.

Non-goals (upstream / consumer-side, documented only):

- `bun build index.ts` browser-target errors (`async_hooks`, `stream/promises`, `child_process` from baileys/detect-libc): zaileys is a Node-only library; consumer must build with `--target node` or `--target bun`. Add a README/docs troubleshooting note.
- Type errors inside `baileys` (`ws` missing @types), `thread-stream`, `whatsapp-rust-bridge`: upstream packages; consumer mitigates with `skipLibCheck: true`. Document in same troubleshooting note.

Target users: any TS consumer of zaileys using sqlite (default) or convex auth/store, without pg/redis installed.

## 2. Acceptance criteria

1. `grep "from 'pg'\|from 'redis'" dist/index.d.ts dist/index.d.cts` → no matches after build.
2. Structural types keep real-client compatibility: passing an actual `pg.Pool` / redis client to the adapters still typechecks (structural subtyping — verify with existing devDeps `pg`/`redis` in a type test).
3. Runtime behavior unchanged — adapters still dynamic-import the real packages; existing tests pass.
4. Fresh consumer simulation: a scratch project with only `zaileys` installed (no pg/redis) runs `tsc --noEmit` over `import { Client } from 'zaileys'` with zero TS2307 from zaileys dist.
5. Docs: troubleshooting section covering bun target + skipLibCheck for upstream lib errors.

## 3. Commands

```bash
pnpm build            # tsup → dist (esm+cjs+dts)
pnpm typecheck        # tsgo --noEmit
pnpm test             # vitest run
pnpm size             # size-limit
```

Verification for this fix: `pnpm build && grep -c "'pg'\|'redis'" dist/index.d.ts` (expect 0) + scratch consumer tsc check.

## 4. Project structure (touched files)

```
src/auth/adapters/postgres.ts    # drop pg import → local PgPoolLike/PgClientLike types
src/auth/adapters/redis.ts       # drop redis import → local RedisClientLike type
src/store/adapters/postgres.ts   # same
src/store/adapters/redis.ts      # same
src/types/…                      # (optional) shared minimal client types if adapters can share one def
docs/…                           # troubleshooting note (bun target, skipLibCheck)
.changeset/*.md                  # patch bump
```

Prefer one shared definition (e.g. `src/shared/optional-clients.ts`) over 4 duplicated copies if both auth+store use identical shapes.

## 5. Code style

- Existing repo conventions: strict TS, no `any` (audit:any script), lean one-liner comments only for non-obvious intent.
- Structural interfaces named `*Like` (e.g. `PgPoolLike`) to signal duck-typing; include only methods actually invoked (`query`, `connect`, `release`, redis `get/set/del/connect/quit/…` — derive from adapter usage, not from full upstream API).
- Keep `import type`/dynamic `await import('pg')` pattern at runtime; cast dynamic import result to the Like types.

## 6. Testing strategy

- Existing vitest suite must pass unchanged (adapters covered by pg-mem / mocks).
- Add one type-level regression test: assert real `pg.Pool` and `redis` client (from devDeps) are assignable to the Like types (compile-time `satisfies`/assignment in a `.test-d`-style file or plain test file).
- Post-build assertion (script or CI step): grep dist d.ts for `'pg'`/`'redis'` — fail if found. Prevents regression when tsup/dts rollup changes.

## 7. Boundaries

- **Always**: keep pg/redis/better-sqlite3/convex optional at runtime AND type level; patch-level semver (no public API change — parameter types widen structurally).
- **Ask first**: publishing to npm; changing peerDependencies; renaming exported types that consumers may reference (e.g. if `Pool` was re-exported).
- **Never**: add pg/redis to `dependencies`; ship breaking API changes for this fix; touch baileys/upstream workarounds via patch-package.
