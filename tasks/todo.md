# Todo — Auto-reject calls (`autoRejectCall` + `client.rejectCall()`)

Plan: [plan.md](plan.md). Default **off** (opt-in). Calls are 🔗 unofficial-only — cloud must throw
`UNSUPPORTED_ON_CLOUD`. 🚩 = review checkpoint.

## Phase A — Feature
- [ ] T1 `src/automation/auto-reject-call.ts` — options, `allow` predicate/array, `reject()`, `handle()` (+ onReject hook, failures logged not thrown) + unit tests
- [ ] T2 Client wiring — `ClientOptions.autoRejectCall` (`boolean | AutoRejectCallOptions`, default off), attach on `call-incoming` (baileys only), public `client.rejectCall(call | id, from?)` + `assertWebProvider` guard, export type + tests
- [ ] 🚩 CP1: feature works + cloud guard; full suite + typecheck green

## Phase B — Docs
- [ ] T3 docs site — `configuration.mdx` (option), `events.mdx` (cross-link), `api-reference.mdx` (method), `providers.mdx` + `official/limits.mdx` (unofficial-only); `npm run build` clean
- [ ] T4 skill suite — `references/api.md` (option+method), `references/recipes.md` (recipe), `zaileys-review` cues; `npm run skill:sync` + `diff -r` clean
- [ ] 🚩 CP2: docs build green; skill synced

## Phase C — Release prep
- [ ] T5 changeset (**minor**) — additive feature
- [ ] 🚩 CP3: ready to release (publish only on user's go-ahead)
