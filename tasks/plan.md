# Plan — Auto-reject calls (`autoRejectCall` config + `client.rejectCall()` method)

Team ask: auto-reject incoming WhatsApp calls, **toggleable via `Client` config**, and **expose the
method** so it can be called manually. Then update docs.

## Findings (read-only investigation)

- **Primitive exists**: baileys exposes `rejectCall(callId: string, callFrom: string): Promise<void>`
  (`node_modules/baileys/lib/Socket/index.d.ts:66`). No wrapper in zaileys today (`grep rejectCall src/` = 0).
- **Call events already wired**: `call-incoming` / `call-ended` emit `CallPayload`
  (`{ callId, from, isGroup, isVideo, timestamp, status }`) — `src/events/decoders/calls.ts`,
  `src/events/pipeline.ts:274`.
- **Toggle pattern to mirror**: `autoDelete?: AutoDeleteOptions | false` in `ClientOptions` →
  `AutoDeleteSweeper` module in `src/automation/`, constructed in the Client ctor, started on connect,
  stopped on close. `PresenceModule` shows the options+method shape.
- **Provider dimension (blast radius)**: calls are **WhatsApp-Web-only**. The Cloud API provider has no
  call events, so `rejectCall()` must throw `ZaileysProviderError('UNSUPPORTED_ON_CLOUD')` like
  `edit`/`delete`/`pin`, and `autoRejectCall` must be inert on cloud (never wired).

## Design (decided)

```ts
// config — OFF by default (rejecting calls is destructive; must be opt-in)
new Client({ autoRejectCall: true })
new Client({ autoRejectCall: { enabled: true, allow: ['628owner@s.whatsapp.net'], onReject: (call) => … } })

// method — accepts the event payload OR raw ids
await client.rejectCall(call)               // call = CallPayload from 'call-incoming'
await client.rejectCall(callId, from)
```

`AutoRejectCallOptions = { enabled?: boolean; allow?: string[] | ((jid: string) => boolean | Promise<boolean>); onReject?: (call) => void | Promise<void> }`
— `allow` = whitelist (skip rejecting these callers, mirrors the `citation` predicate style);
`onReject` = post-reject hook (e.g. send "sorry, calls not supported"). Keep it lean — no
video/voice/group sub-filters until asked (`isVideo`/`isGroup` are already on the payload, so users
can filter inside `allow`).

## Dependency graph

```
        ┌──────────────────────────────────────┐
        │ T1 automation/auto-reject-call.ts    │  module: options, allow-predicate, reject+hook
        │    + unit tests                       │  (pure, socket injected)
        └───────────────┬──────────────────────┘
                        ▼
        ┌──────────────────────────────────────┐
        │ T2 Client wiring                      │  ClientOptions.autoRejectCall, ctor, attach on
        │    + client.rejectCall() + guard      │  connect (baileys only), web-only guard, exports
        └───────────────┬──────────────────────┘
                ┌───────┴────────┐
                ▼                ▼
        ┌───────────────┐  ┌──────────────────┐
        │ T3 docs site  │  │ T4 skill suite   │   (independent of each other)
        └───────┬───────┘  └────────┬─────────┘
                └────────┬──────────┘
                         ▼
                 ┌───────────────┐
                 │ T5 changeset  │  minor + release-ready
                 └───────────────┘
```

- **T1 blocks T2** (Client constructs the module).
- **T3 / T4 need T2** (document the shipped API); independent of each other.
- **T5** last.

## Phases & checkpoints

- **Phase A = T1 + T2.** → 🚩 CP1: feature works + guarded; full suite green; typecheck clean.
- **Phase B = T3 + T4.** → 🚩 CP2: docs site builds; skill synced (`diff -r` clean).
- **Phase C = T5.** → 🚩 CP3: changeset in; ready to release (publish = user's call).

---

## Tasks

### T1 — `src/automation/auto-reject-call.ts` + unit tests

Module owning the policy. Socket + logger injected (testable, no Client dependency).

```ts
export interface AutoRejectCallOptions { enabled?: boolean; allow?: …; onReject?: … }
export interface CallSocketLike { rejectCall(callId: string, callFrom: string): Promise<void> }
export class AutoRejectCallModule {
  constructor(getSocket: () => CallSocketLike | undefined, options: AutoRejectCallOptions, logger?)
  reject(callId: string, from: string): Promise<void>     // raw reject (used by the public method)
  handle(call: CallPayload): Promise<void>                 // policy: allow-check → reject → onReject
}
```

- *Accept*: `handle()` rejects a call when enabled; **skips** when the caller matches `allow`
  (array or predicate); runs `onReject` **after** a successful reject; a throwing `onReject` or
  `rejectCall` is logged, never crashes the client; `reject()` throws a typed error when there's no
  socket (not connected).
- *Verify*: `tests/automation/auto-reject-call.test.ts` — enabled/disabled, allow-array, allow-predicate
  (sync+async), onReject called once with the payload, reject failure swallowed+logged, no-socket error.

### T2 — Client wiring + public `rejectCall()` + guards

- `ClientOptions.autoRejectCall?: boolean | AutoRejectCallOptions` (default **off**), normalized in the
  ctor (`true` → `{ enabled: true }`).
- Construct the module; **attach to `call-incoming` only on the baileys provider** when enabled
  (wire where the inbound pipeline is attached; detach on close alongside the other handles).
- Public method `client.rejectCall(callOrId: CallPayload | string, from?: string): Promise<void>` —
  `assertWebProvider('rejectCall')` first (throws `UNSUPPORTED_ON_CLOUD` on cloud), then delegate.
- Export `AutoRejectCallOptions` from `src/automation/index.ts` (and thus the package root).
- *Accept*: `new Client({ autoRejectCall: true })` auto-rejects an emitted `call-incoming`;
  default (unset) does **not** reject; `client.rejectCall(call)` and `client.rejectCall(id, from)` both
  work; on `provider:'cloud'` the method throws `UNSUPPORTED_ON_CLOUD` and the config is never wired;
  handlers detach on disconnect (no double-reject after reconnect).
- *Verify*: `tests/client/auto-reject-call.test.ts` with the existing mock socket
  (`makeIntegrationSocket` + `triggerCall`-style ev emit): toggle on/off, both method arities, cloud
  guard, allow-list end-to-end. Then `pnpm test` (full suite) + `npx tsc --noEmit`.

🚩 **CP1** — feature + guard done; 2482+ tests green; typecheck clean.

### T3 — Docs site

- `docs/content/configuration.mdx` — add the `autoRejectCall` row/section (type, default `false`,
  options table, examples incl. `allow` + `onReject`).
- `docs/content/events.mdx` — under the call events, cross-link auto-reject + `client.rejectCall()`.
- `docs/content/api-reference.mdx` — add `rejectCall` to the client-methods list.
- `docs/content/providers.mdx` + `docs/content/official/limits.mdx` — mark calls / `rejectCall` as
  **🔗 unofficial-only** (they don't exist on the Cloud API).
- *Verify*: `cd docs && npm run build` → clean; `out/index.html` present.

### T4 — Skill suite (canonical `skills/*`, then sync)

- `references/api.md` — `autoRejectCall` in the ClientOptions table; `rejectCall` in client methods;
  flag as unofficial-only.
- `references/recipes.md` — a short "auto-reject calls" recipe (config + manual + notify-caller hook).
- `zaileys-review/SKILL.md` quick-cues — `rejectCall` in the method list.
- `npm run skill:sync` → `diff -r skills plugins/zaileys-official/skills` clean.
- *Verify*: snippets match the shipped API exactly (grep against `src/`); diff clean.

🚩 **CP2** — docs build green; skill synced.

### T5 — Changeset

- `.changeset/*.md` **minor** (additive feature): config `autoRejectCall` + `client.rejectCall()`.
- *Verify*: `npx changeset version` dry-sane (do NOT version/publish without the user's go-ahead).

🚩 **CP3** — ready to release.

## Risks

- **Destructive default** — auto-rejecting calls without opt-in would surprise users. Mitigate: default
  **off**; `true` must be explicit.
- **Double-reject / leaks after reconnect** — the `call-incoming` handler must be detached with the
  other pipeline handles. Mitigate: attach/detach beside the existing `inboundHandle` lifecycle; test
  reconnect.
- **Provider drift** — calls are web-only; forgetting the guard means a confusing cloud crash.
  Mitigate: `assertWebProvider` + a cloud-guard test (T2), docs/skill flagged (T3/T4).
- **Hook failures** — a user `onReject` that throws must not kill the client. Mitigate: catch+log (T1).
