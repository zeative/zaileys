# STATE: Zaileys v4.0

**Initialized:** 2026-05-29
**Last updated:** 2026-05-31 (Phase 9 — plan-003 complete: CommandContext migrated to MessageContext, integration suite 22 tests, BLOCKER-4 receiverId wiring fixed)

## Project Reference

- **Project doc:** `.planning/PROJECT.md`
- **Requirements:** `.planning/REQUIREMENTS.md` (128 v1 REQ-IDs after FOUND-09/10/11 addition)
- **Roadmap:** `.planning/ROADMAP.md` (8 phases, standard granularity)
- **Config:** `.planning/config.json` (yolo, standard, parallel max 20 agents, single branch)
- **Codebase map:** `.planning/codebase/` (v3.3.0 historical state — kept as reference)
- **Baileys reference:** `.planning/baileys-ref/` (rc13 map)

**Branch:** `v4` (created from staging 2026-05-29, all v4 work lands here)
**Core Value:** DX yang membuat 5 menit pertama developer terasa magis — `new Client({}).connect()` → kirim pesan via builder, terima via typed event, auth otomatis.

**Current Focus:** Phase 9 COMPLETE (3/3 plans done) — Rich Message Context (Flat + Lazy). All success criteria locked by integration suite.

## Current Position

- **Milestone:** v4.0.0 Total Rebuild — ✅ COMPLETE (release-ready, tag pending user)
- **Phase:** 9 of 9 — Rich Message Context (Flat + Lazy) ✅ COMPLETE (3/3 plans)
- **Plan:** Phase 9 plan-003 (command-ctx-integration-tests, Wave 3) ✅ done — CommandContext extends MessageContext (D2), integration suite 22 tests, BLOCKER-4 receiverId fix, commits f4e39bf/f38e16f/cdf5336
- **Status:** Phase 9 complete. All 9 phases done. CommandContext migrated to rich MessageContext; integration suite proves all phase success criteria (LID DM, group roomName cache, lazy media, replied, citation, deterministic uniqueId, links, receiverId/channelId wiring). Full test suite 2015 pass / 122 skipped.

```
Progress: [████████] 8/8 phases (100%) — v4.0.0 READY
```

## Post-Phase-5 Enhancement — Auto-connect DX (2026-05-30)

User-requested DX upgrade: `new Client()` tanpa `await connect()`. Commits `9ba639b`, `90955f0`, `7f87c00` di branch v4.
- **CONN-11**: auto-connect default `true`, deferred via `queueMicrotask` (race-safe — sync `on(...)` registrations selesai dulu). Opt-out `autoConnect: false`.
- **CONN-12**: `on('error')` event surface auto-connect failures; tanpa listener di-log (no unhandled rejection).
- Race conditions handled: (#1) listener-vs-connect via microtask defer, (#2) `client.send()` di `on('text')` aman by-design (inbound fire setelah open), (#3) sync `makeWASocket` throw dibungkus try/catch → error event.
- 61 existing lifecycle-test sites opt-out `autoConnect:false`; new `tests/client/auto-connect.test.ts` (16 tests). Full suite 1290 passing.
- Canonical example sekarang: `const client = new Client(); client.on('text', ...); ` — NO explicit connect.

## Performance Metrics

| Metric | Target | After Phase 1 |
|--------|--------|---------------|
| Test cases | ≥1000 | **331 passing + 120 gated (Redis/PG env)** |
| Coverage (lines/branches) | ≥80% | Phase 2 best-effort; Phase 8 gate |
| TypeScript strict | enabled | ✅ enabled (TS 7 beta `tsgo` primary + TS 6.0.3 fallback) |
| Baileys version | rc13 | ✅ `^7.0.0-rc13` |
| CVE-2026-48063 patched | yes | ✅ upstream + dropSpoofedSelfOnly guard |
| Zero inline comments in src/ | yes | ✅ 41 files / 0 violations |
| Bundle size (ESM) | n/a (track) | 26.25 KB → growing dengan adapters |
| Bundle size (CJS) | n/a (track) | 27.13 KB → growing |
| AuthStore adapters | 4 | ✅ Memory + File + SQLite + Redis + Postgres (5 total — Memory bonus) |
| MessageStore adapters | 4 | ✅ Memory + SQLite + Redis + Postgres |
| Cross-backend independence (STORE-06) | enforced | ✅ verified via 10-pair matrix |

## Accumulated Context

### Decisions
- Rewrite total v4.0 (not refactor) — user explicit
- Clean break v3→v4, no soft deprecation
- AuthStore + MessageStore are TWO separate interfaces (do not merge)
- vitest as test framework (ESM-native) ✅ installed Phase 1
- Builder API as primary outbound surface
- TC + Reporting tokens stay silent (no public API exposure)
- Publish to npm = MANUAL (release workflow stops at GitHub Release)
- Zero-comment policy HARD — TSDoc only on public API ✅ enforced via audit script
- TypeScript 7 beta (Project Corsa / `tsgo`) as primary compiler ✅ adopted Phase 1
- Phase 9 plan-001: FNV-1a 32-bit hash for computeUniqueId; extractLinks linear regex; buildMessageContext I/O-free with injected resolvers; makeCitation deny-by-default
- Phase 9 plan-002: DecodeContext optional fields for typecheck isolation; roomNameCache caches Promise (not value) to share concurrent fetches; InboundEventMap swapped early in Task 1a to unblock typecheck; decodeMention/All return MentionContext/MentionAllContext via spread of full base context
- Phase 9 plan-003: CommandContext extends MessageContext (D2 complete); spread-overlay pattern in buildCommandContext; reply target uses roomId ?? senderId; pipeline.ts defaults receiverId = ctx.receiverId ?? ctx.selfJid (BLOCKER-4 fix)
- Command registry resolves via greedy longest-match over [name, ...args] token-path; aliases share one CommandDefinition (Phase 7 plan-002)
- Middleware error-ownership boundary: runMiddleware wraps middleware faults as MIDDLEWARE_ERROR, propagates final() faults raw — dispatcher owns HANDLER_ERROR (Phase 7 plan-002)
- Branch `v4` isolates rebuild work from staging/main ✅ active
- Commits TIDAK expose AI authorship ✅ all 19 Phase 1 commits clean
- Monorepo COLLAPSED → single package (mysql-adapter deleted, media-process folded to src/media/) ✅ Phase 1

### Open Todos
- Phase 2 planning (`/gsd-plan-phase 2`) — Storage Layer (AuthStore + MessageStore adapters)
- Adapter package strategy decision (in-tree under `src/auth/adapters/` & `src/store/adapters/` — likely yes given monorepo collapsed)
- Phase 8 backlog: rewrite `examples/*.ts` against v4 API (currently excluded from tsconfig)

### Blockers
- **CI `audit:any src` RED (out-of-scope, pre-existing):** 18 `any`-literal violations in src/media/ffmpeg/*, src/media/utils.ts, src/store/types.ts. Retype to `unknown`/proper types before tagging v4.0.0 so release CI is green. Mechanical ~18-line follow-up, no behaviour change. Detail in phases/08-test-ci-docs-release/deferred-items.md. Does NOT block runtime/build/tests/coverage/dual-consumption.

### Phase-derived Constraints
- Phase 1 MUST complete before any feature work ✅ DONE
- Phase 4 + Phase 5 can run in parallel after Phase 3
- Phase 8 is consolidation — per-phase unit tests must already exist by then

## Phase 4 Completion Snapshot (2026-05-29)

**Plans completed:** 8/8 (EVT-01..25 = 25/25 REQ-IDs)
**Commits on branch v4:** atomic conventional commits, zero AI attribution
**Tests:** 943 passing + 120 skipped (Redis/Postgres env-gated) — up from 890 baseline (+53 plan-008)
**Bundle:** ESM 140.89 KB + CJS 143.33 KB + d.ts 46.04 KB

**Bundle delta (Phase 3 → Phase 4):** ESM 114.79 → 140.89 KB (+26.1 KB), CJS 117.19 → 143.33 KB (+26.1 KB), d.ts 38.31 → 46.04 KB (+7.7 KB) — decoder families + inbound pipeline + 19 payload types.

**Final smoke (all exit 0):**
- `pnpm install` ✅
- `pnpm typecheck` (tsgo) ✅ exit 0
- `pnpm build` (tsup) ✅ exit 0 (ESM+CJS+DTS)
- `pnpm audit:comments` ✅ exit 0, 61 files / 0 violations
- `pnpm audit:any` ✅ exit 0, 12 files / 0 violations (EVT-25 gate)
- `pnpm test --run` ✅ exit 0, 943 passed / 120 skipped / 1063 total

**Success Criteria (5/5 verified via tests/events/sc-matrix.test.ts):**
- SC#1 text payload `{jid, content, fromMe, isGroup, sender, timestamp, quoted}` typed ✅
- SC#2 media `download()` → Buffer+mime+size; audio PTT typed ✅
- SC#3 mutation events carry original key + mutation payload ✅
- SC#4 group LID-aware (participantAlt/authorPn/authorUsername); mention vs mention-all discriminated ✅
- SC#5 lifecycle discriminated unions; no `any` (audit gate) ✅

**Key deliverables shipped (Phase 4):**
- `InboundEventMap` — 24 typed event keys composed into `ClientEventMap`
- Decoder families: messages, mutations, interactive, groups, calls, lifecycle (pure functions, return null on shape mismatch)
- `attachInboundPipeline(client, socket, ctx)` wiring `dropSpoofedSelfOnly` guard + per-key decode/emit, idempotent detach
- Lazy `msg.download()` media accessor via baileys `downloadMediaMessage`
- 19 payload types re-exported through `src/index.ts` → `src/events/index.ts` (consumer-importable)
- `scripts/audit-no-any.ts` + `pnpm audit:any` gate green across `src/events/**`
- SC + smoke verification: sc-matrix.test.ts (26 tests), smoke.test.ts (27 tests)
- Traceability artifact `.planning/phases/04-typed-events/04-008-SC-MATRIX.md` (gitignored)

**Hand-off ke Phase 5 (Outbound Builder):**
- `TypedEventEmitter<ClientEventMap>` now spans connection + inbound events; Phase 5 adds no event keys (outbound is method-based)
- Mock-socket harness `tests/_helpers/mock-socket-events.ts` reusable; extend for outbound `sendMessage` assertions
- `src/media/` (Phase 1) ready for builder media encode reuse

## Phase 3 Completion Snapshot (2026-05-29)

**Plans completed:** 7/7 (CONN-01..10 = 10/10 REQ-IDs)
**Commits on branch v4:** atomic conventional commits, zero AI attribution
**Tests:** 608 passing + 120 skipped (Redis/Postgres env-gated)
**Bundle:** ESM 114.79 KB + CJS 117.19 KB + d.ts 38.31 KB

**Final smoke (all exit 0):**
- `pnpm install` ✅
- `pnpm typecheck` (tsgo) ✅
- `pnpm build` (tsup) ✅
- `pnpm audit:comments` ✅ 51 files / 0 violations
- `pnpm test --run` ✅ 608 passed / 120 skipped
- `tsgo --noEmit` on magic example (transient tsconfig.example-check.json) ✅

**Key deliverables shipped (Phase 3):**
- `Client` class composing auth, store, reconnect, QR/pairing, socket lifecycle behind one typed surface
- `ConnectionEventMap` typed: `qr`, `pairing-code`, `connect`, `disconnect`, `reconnecting`
- `TypedEventEmitter<EventMap>` per-key narrowing (`on`/`off`/`emit`)
- Connection FSM (`createConnectionStateMachine`) with 8 lifecycle states
- `mapDisconnectReason` + `isFatalDisconnect` + `shouldClearAuth` discriminated reason routing
- `createReconnectStrategy` exponential backoff + jitter + max-attempts cap
- QR terminal renderer + pairing-code flow
- `signalKeyStoreFromAuthStore` adapter bridging Phase 2 AuthStore to Baileys keys
- Magic 10-line example `examples/quickstart-connect.ts` (9 lines, 6 non-blank) — Phase 3 SC #1 user-facing artifact
- Phase 3 SUCCESS_CRITERIA.md traceability matrix (SC #1–#5)
- 28 test files, 608 passing tests, integration suite for reconnect-storm, auth-clear-on-fatal, auth-clear-recovery, connection-flow, cross-backend

**Hand-off ke Phase 4 (Inbound Events) / Phase 5 (Outbound Builder):**
- `Client.socket` getter exposes live Baileys socket for both Phase 4 (subscribe to `messages.upsert` / `messages.update` / `messages.reaction` etc.) and Phase 5 (call `sendMessage` / `relayMessage` etc.)
- `TypedEventEmitter` pattern reusable: extend `ConnectionEventMap` → `InboundEventMap` (EVT-01..25)
- `BaileysSocketLike` lightweight type in `src/store/types.ts` extendable for message decode
- State machine + reconnect lifecycle is stable; Phase 4/5 consume, do not mutate
- Mock-socket harness in `tests/_helpers/` ready for Phase 4 inbound + Phase 5 outbound test scaffolding

## Phase 2 Completion Snapshot (2026-05-29)

**Plans completed:** 7/7 (AUTH-01..07 + STORE-01..06 = 13/13 REQ-IDs)
**Commits on branch v4:** 22 atomic conventional commits, zero AI attribution
**Tests:** 331 passing + 120 gated (Redis/Postgres real-backend tests)
**Bundle:** unchanged (storage layer not in default barrel re-export by design — opt-in import per user)

**Final smoke (all exit 0):**
- `pnpm install` ✅
- `pnpm typecheck` (tsgo) ✅ 0 errors
- `pnpm build` ✅
- `pnpm audit:comments` ✅ 41 files / 0 violations
- `pnpm test --run` ✅ 331 passed / 120 skipped

**Key deliverables shipped (Phase 2):**
- `AuthStore` + `AuthCredsStore` + `AuthStoreBundle` interfaces finalized (mapped-type write signature)
- `MessageStore` interface with `bind(socket)` + `BaileysSocketLike` lightweight type
- `ZaileysStoreError` typed errors (6 codes, STORE_CLOSED contract enforced)
- **5 AuthStore adapters**: Memory, File (atomic writes), SQLite, Redis, Postgres
- **4 MessageStore adapters**: Memory, SQLite, Redis, Postgres
- Shared contract test suites: 60 scenarios (30 auth + 30 message)
- `makeCacheableAuthStore` wrapper (Baileys LRU)
- 10-pair cross-backend integration test (STORE-06 proven)
- AUTH-07 auto-cleanup tested per adapter
- Peer dependencies model: `better-sqlite3`, `redis`, `pg` (+ `pg-mem` dev) — optional via `peerDependenciesMeta`
- `DEPENDENCIES.md` updated with adapter peer dep justifications

**Hand-off ke Phase 3:**
- Client class WAJIB expose option `cacheSignal?: boolean` (default `true`); kalau `false`, skip `makeCacheableAuthStore` wrap
- `CacheableAuthStoreOptions` punya placeholder `cacheSize` / `cacheTtlSeconds` untuk Phase 3 wiring
- Phase 3 invoke `auth.signal.clear()` + `auth.creds.deleteCreds()` pada DisconnectReason: loggedOut / connectionReplaced / forbidden

## Phase 1 Completion Snapshot (2026-05-29)

**Plans completed:** 8/8 (FOUND-01..06, FOUND-09..11, SEC-01..05 all satisfied)
**Commits on branch v4:** 19 atomic conventional commits
**Files changed:** 73 deleted (v3 src/ + packages/), 25+ created (v4 src/), 10+ modified (config/build)

**Final smoke (all exit 0):**
- `pnpm install` ✅
- `pnpm typecheck` (tsgo) ✅
- `pnpm build` (tsup) ✅ ESM 26 KB + CJS 27 KB + d.ts
- `pnpm audit:comments` ✅ 0 violations / 27 files
- `pnpm test` (vitest) ✅ passWithNoTests

**Key deliverables shipped to branch v4:**
- baileys ^rc.9 → ^rc13 (CVE-2026-48063 patched)
- TypeScript 7 beta (`@typescript/native-preview@7.0.0-dev.20260527.2`) primary + TS 6.0.3 fallback
- v3 src/ DEMOLISHED → v4 domain layout (`client, auth, store, connection, events, builder, domain, command, automation, utils, types, media`)
- Monorepo COLLAPSED (packages/* removed, media-process folded to src/media/)
- tsup dual ESM/CJS + d.ts + sourcemaps
- AuthStore interface (identity-key Uint8Array), LIDMapping typed, dropSpoofedSelfOnly guard, SECURITY.md
- Zero-comment audit script + vitest scaffold + faster pre-commit hook
- package.json: version 4.0.0, type=module, deps justified in DEPENDENCIES.md

## Session Continuity

**Last session ended at:** Phase 8 plan-003 (e2e-runner-integration-aggregate, Wave 2 after 002) complete — env-gated E2E smoke runner `tests/e2e/smoke.e2e.test.ts` (describe.skipIf(!ZAILEYS_E2E), skipped in normal/CI, never opens real connection) + `tests/e2e/README.md` opt-in docs; appended `tests/**/*.e2e.test.ts` to vitest include glob ONLY (plan-002 coverage/thresholds block untouched). Added `tests/integration/phase8-aggregate.test.ts` cross-phase sentinel (TEST-08 text payload shape + TEST-09 backoff delay increase then recover). TEST-08/09 confirmed ALREADY covered by tests/events/integration.test.ts + tests/integration/reconnect-storm.test.ts (sentinel locks them). Full suite 1905 pass / 122 skipped, exit 0 (TEST-12 met). Gates green: typecheck, audit:comments, audit:any. Commits 050f4ca, dc2ee88. Plans done in phase 8: 001,002,003,004,005,006,007.
**Next action:** Wave 3 plan-008 final smoke + SC matrix + release readiness (TEST-03,11,12) — last plan of phase 8.

**Recovery hint:** Read `.planning/phases/08-test-ci-docs-release/08-001-SUMMARY.md` + `COVERAGE-BASELINE.md` + `PLAN_INDEX.md`. **D1 RESOLVED** — `require('zaileys')` now works (CJS bundle is `dist/index.cjs`, exports.require points to it). Coverage baseline: lines 77.04% / branches 75.20%; biggest gaps in media/+media/ffmpeg/ (0-6%, net-new tests) and redis/pg adapters (rise in plan-004 CI containers). Thresholds NOT yet enforced. `.planning/` gitignored on v4 → state edits on-disk only (COVERAGE-BASELINE.md NOT committed; tracked changes were tsup/package.json/test/lockfile). gsd-sdk CLI absent; state handlers skipped, edited manually. package.json must be edited atomically (`pnpm pkg set`/`pnpm add -D`) by Wave 2 plans — multiple plans touch it.

---
*State updated: 2026-05-30 after Phase 8 plan-003 completion (e2e runner + integration aggregate).*
