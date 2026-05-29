# Phase 1 — Plan Index

**Phase:** 01-foundation-cleanup
**Created:** 2026-05-29
**Plans:** 8 atomic plans across 4 waves
**Single-branch:** `v4` (no worktree isolation; partition by direktori)
**Max parallel agents:** 20 (per .planning/config.json#execution)

---

## Commit Constraints (HARD RULES — apply to ALL plans)

Setiap executor agent yang menjalankan plan di phase ini WAJIB mematuhi:

1. **Branch target**: SEMUA commit ke branch `v4`. JANGAN `git checkout` ke branch lain. JANGAN `git push origin main` atau `git push origin staging`.
2. **No AI attribution**: JANGAN tambahkan `Co-Authored-By: Claude <noreply@anthropic.com>` trailer. JANGAN tambahkan `🤖 Generated with [Claude Code](...)` footer. JANGAN mention "Claude", "AI", "Anthropic" di commit message body.
3. **Conventional commits**: format `<type>(<scope>): <subject>` (e.g., `feat(foundation): add v4 src skeleton`, `chore(deps): bump baileys to rc13`, `refactor(tsconfig): enable strict mode`).
4. **Atomic commits per task**: setiap task di plan = satu commit terpisah.
5. **No --no-verify**: husky hooks tetap dijalankan (lint + typecheck akan jalan).
6. **No worktree**: jangan spawn dengan `isolation: 'worktree'`. Semua agen kerja di working tree branch `v4`.

---

## Wave Structure & Dependencies

```
Wave 1: plan-001 (deps audit)
            │
            ├──> Wave 2: plan-002 (baileys rc13 bump)         [needs deps clean]
            │            plan-003 (TS 7 Corsa adoption)        [needs deps clean — removed v5 typescript]
            │              (002 & 003 both edit package.json scripts — serialize at file level)
            │
            └──> Wave 3: plan-004 (tsconfig strict)            [needs tsgo/tsc available]
                          plan-006 (demolish v3 + erect v4 src/) [needs tsconfig to verify skeleton]
                            (004 & 006 are independent files — true parallel)
                            │
                            └──> Wave 4: plan-005 (tsup dual build) [needs src/index.ts skeleton + tsconfig.build.json]
                                          plan-007 (security baseline) [needs baileys rc13 types + src/ skeleton]
                                          plan-008 (audit + version + vitest) [needs src/ clean + tsgo + deps]
                                            (005 & 007 independent; 008 partly overlaps package.json scripts with 005 → serialize 008 last)
```

**Practical execution order (executor):**
1. `plan-001` solo → wait
2. `plan-002` + `plan-003` parallel but serialize package.json writes (2 then 3 or 3 then 2)
3. `plan-004` + `plan-006` parallel (no file overlap)
4. `plan-005` + `plan-007` parallel → `plan-008` last (touches package.json again + final smoke)

---

## Plan Catalog

| # | Slug | Wave | Files Owned | REQ-IDs | Parallel-safe |
|---|------|------|-------------|---------|---------------|
| 001 | dependency-audit ✅ done | 1 | DEPENDENCIES.md, package.json, pnpm-workspace.yaml | FOUND-02 | (solo) |
| 002 | baileys-rc13-upgrade ✅ done | 2 | package.json (deps.baileys), pnpm-lock.yaml, scripts/smoke-baileys.mts | FOUND-01, SEC-01 | yes (with 003 — serialize scripts edits) |
| 003 | typescript-7-corsa ✅ done | 2 | package.json (devDeps+scripts), .nvmrc, scripts/audit-tsgo-compat.ts | FOUND-09, FOUND-10, FOUND-11 | yes (with 002) |
| 004 | tsconfig-strict ✅ done | 3 | tsconfig.json, tsconfig.build.json | FOUND-06 | yes (with 006) |
| 005 | tsup-dual-build ✅ done | 4 | tsup.config.ts | FOUND-05 | yes (with 007) |
| 006 | src-v4-skeleton ✅ done | 3 | src/** (full rewrite + monorepo collapse) | FOUND-03 | yes (with 004) |
| 007 | security-baseline ✅ done | 4 | src/auth/types.ts, src/auth/index.ts, src/types/lid-mapping.ts, src/types/index.ts, src/events/guards.ts, src/events/index.ts, SECURITY.md | SEC-02, SEC-03, SEC-04, SEC-05 | yes (with 005) |
| 008 | audit-version-vitest ✅ done | 4 | package.json (version+scripts), scripts/audit-comments.ts, vitest.config.ts, tests/.gitkeep | FOUND-04 | no (serialize last) |

---

## Requirement Coverage Matrix (14/14)

| REQ-ID | Plan | Status |
|--------|------|--------|
| FOUND-01 | 002 | done |
| FOUND-02 | 001 | done |
| FOUND-03 | 006 | done |
| FOUND-04 | 008 | done |
| FOUND-05 | 005 | done |
| FOUND-06 | 004 | done |
| FOUND-09 | 003 | done |
| FOUND-10 | 003 | done |
| FOUND-11 | 003 | done |
| SEC-01 | 002 | done |
| SEC-02 | 007 | done |
| SEC-03 | 007 | done |
| SEC-04 | 007 | done |
| SEC-05 | 007 | done |

**Coverage: 14/14 (100%)** — no gaps.

---

## File Ownership Map (parallelization safety)

| File | Owned by Plan |
|------|---------------|
| DEPENDENCIES.md | 001 |
| package.json#dependencies | 001 (prune), 002 (baileys bump) |
| package.json#devDependencies | 001 (remove typescript), 003 (add @typescript/native-preview + typescript fallback), 008 (add vitest) |
| package.json#scripts | 002 (smoke:baileys), 003 (typecheck, typecheck:legacy, typecheck:audit), 008 (audit:comments, test, test:watch) |
| package.json#version | 008 |
| package.json#optionalDependencies | 001 (remove block) |
| pnpm-lock.yaml | 001 (regen), 002 (regen post-bump), 003 (regen post-install), 008 (regen post-vitest) |
| pnpm-workspace.yaml | 001 |
| tsconfig.json | 004 |
| tsconfig.build.json | 004 |
| tsup.config.ts | 005 |
| vitest.config.ts | 008 |
| scripts/smoke-baileys.ts | 002 |
| scripts/audit-tsgo-compat.ts | 003 |
| scripts/audit-comments.ts | 008 |
| src/** (full rewrite) | 006 (skeleton), 007 (auth/types.ts, events/guards.ts, types/lid-mapping.ts populate) |
| SECURITY.md | 007 |
| tests/.gitkeep | 008 |
| .planning/phases/01-foundation-cleanup/tsgo-audit.json | 003 |
| .planning/phases/01-foundation-cleanup/tsc-v3-strict-errors.snapshot.txt | 004 |
| .planning/phases/01-foundation-cleanup/01-{NNN}-SUMMARY.md | each plan |

**Overlap risk:** Only `package.json` is multi-touched (across 001, 002, 003, 008). Executor must serialize writes. Strategy: use stable file lock atau run waves sequential at package.json level. Sub-fields (dependencies vs scripts vs version) tidak konflik semantically, hanya saat concurrent JSON parse-write.

**Overlap risk: pnpm-lock.yaml** — di-regenerate setiap kali `pnpm install/add` jalan. Bukan true file conflict (pnpm handles it), tapi tetap serialize per-wave untuk konsistensi.

**`src/**` rewrite by 006 + populate by 007** — 006 (wave 3) demolish all v3 + erect barrels; 007 (wave 4) populate specific barrels (auth/types.ts, events/guards.ts, types/lid-mapping.ts). No conflict by wave order.

---

## Parallel Execution Opportunities

**Wave 2:** plan-002 + plan-003 — parallel-capable kecuali both touch `package.json#scripts`. Strategy: run sekuensial dalam wave dengan order 002 → 003 ATAU pakai single executor yang invoke kedua-keduanya berurutan dengan single package.json edit per plan.

**Wave 3:** plan-004 + plan-006 — fully independent file sets. True parallel.

**Wave 4:** plan-005 + plan-007 — independent (tsup.config.ts vs src/auth + src/events + SECURITY.md). True parallel.
plan-008 last — touches package.json scripts again + needs all prior waves clean for final smoke build.

**Estimated wall-clock saving vs sequential:** ~30-40% (Wave 3 + Wave 4 parallel pairs).

---

## Phase 1 Success Criteria Mapping (from ROADMAP.md)

| ROADMAP SC# | Statement | Validated by plan |
|-------------|-----------|-------------------|
| 1 | `pnpm install && pnpm build` succeeds dengan baileys rc13, strict TS, zero `any`, tsup dual + d.ts | 001+002+005+008 (final smoke) |
| 2 | version 4.0.0, DEPENDENCIES.md justifies each, obsolete deps removed | 001+008 |
| 3 | v3 src/ gone, v4 domain layout dengan empty barrels | 006 |
| 4 | CVE-2026-48063 patched + identity-key in AuthStore + LIDMapping typed + TC tokens silent | 002+007 |
| 5 | Zero-comment audit script runs in CI dan fails di luar TSDoc | 008 |

All five SCs ter-cover.

---

## Discretionary Choices (Claude's call per CONTEXT.md L113-118)

| Choice | Plan | Decision |
|--------|------|----------|
| Replacement libraries | 001 | Drop radashi → inline chunk() helper; defer adapter libs (better-sqlite3, redis, pg) ke Phase 2 |
| Sub-organization filename | 006/007 | Barrel `index.ts` per folder; auth → types.ts; events → guards.ts; types → lid-mapping.ts |
| Workspace structure | 001 (deferred) | Keep packages/ for now (media-process is real workspace); mysql-adapter mark deprecated, removal di Phase 2 |
| Lint tooling | (deferred) | NOT added in Phase 1 — TS strict + prettier sufficient. If wanted, Phase 8 can add oxlint |
| Script naming | 003+008 | typecheck (tsgo), typecheck:legacy (tsc), typecheck:audit (compat report), build, dev, test, test:watch, audit:comments, smoke:baileys |

---

## Hand-off to Phase 2

After all 8 plans complete:
- `src/auth/types.ts` ready for adapter implementations (FileAuthStore, SqliteAuthStore, RedisAuthStore, PostgresAuthStore)
- `src/store/index.ts` ready (interface design akan jadi Phase 2 first task)
- vitest ready — tests/auth/* dan tests/store/* langsung bisa ditulis
- `tctoken` key sudah valid AuthStoreKey via SignalDataTypeMap union
- `identity-key` Uint8Array support inherit via SignalDataTypeMap
- Workspace `packages/mysql-adapter` siap di-deprecate (replaced by built-in PostgresAuthStore)

---

*Plan index generated: 2026-05-29*
