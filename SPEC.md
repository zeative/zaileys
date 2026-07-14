# SPEC — Official Meta WhatsApp Cloud API provider (zaileys DX)

## 1. Objective

Add a second transport to zaileys: the **official Meta WhatsApp Cloud API** (Graph API +
webhooks), selectable via a `provider` option, while keeping the exact zaileys developer
experience — same `Client`, same `send(to).text()` builder, same event names.

```ts
import { Client } from 'zaileys'

const wa = new Client({
  provider: 'cloud',
  cloud: {
    accessToken: process.env.WA_TOKEN!,       // permanent / system-user token
    phoneNumberId: process.env.WA_PHONE_ID!,  // sender phone-number id
    wabaId: process.env.WA_WABA_ID,           // optional (some ops)
    verifyToken: process.env.WA_VERIFY!,      // webhook GET challenge
    appSecret: process.env.WA_APP_SECRET,     // webhook POST signature verify
    apiVersion: 'v23.0',                      // optional, pinned default
  },
})

wa.on('message', (m) => wa.send(m.roomId).text(`echo: ${m.text}`))
await wa.send('628xxx').image('./a.jpg', { caption: 'hi' })
await wa.send('628xxx').template('order_confirm', 'id_ID', [...]) // Cloud-only
```

**Target users**: businesses that need the sanctioned, ToS-safe channel (no ban risk, no
QR device linking) — notifications, customer support, template broadcasts — but want
zaileys ergonomics instead of raw Graph REST or a Cloud-only lib like `whatsapp-api-js`.

**Why it's possible**: the builder already talks to a `BuilderSocketLike` seam
(`sendMessage(jid, AnyMessageContent, options)`), not baileys directly. A `CloudTransport`
that implements that seam — translating baileys message content → Graph payloads — reuses
the entire builder/event surface untouched.

### Default & compatibility

- `provider` defaults to `'baileys'`. Omitting it = today's behavior, byte-for-byte.
- baileys is **lazy-imported** only when `provider === 'baileys'`, so Cloud-only apps don't
  pay the baileys load/deps at runtime.

## 2. Acceptance criteria

1. `new Client()` and `new Client({ provider: 'baileys' })` behave identically to v4.7.2 —
   full existing test suite green, no signature changes.
2. `new Client({ provider: 'cloud', cloud })` sends a text via `send(to).text()` → issues
   `POST https://graph.facebook.com/{apiVersion}/{phoneNumberId}/messages` with the correct
   JSON body and `Authorization: Bearer` header (asserted against a mocked fetch).
3. Media (`image/video/audio/document/sticker`) uploads to `/{phoneNumberId}/media` then
   references the returned media id — verified end-to-end against mock fetch.
4. `react`, `markRead`, typing indicator, `reply` (context message id) work on cloud.
5. Interactive `buttons`/`list` send as Graph `interactive` payloads; `template(...)` sends a
   template message.
6. Location + contact send work; both are parsed on inbound.
7. `wa.webhook()` returns a framework-agnostic `(req: Request) => Promise<Response>`:
   - GET with valid `hub.verify_token` → `200` + `hub.challenge`; invalid → `403`.
   - POST with valid `X-Hub-Signature-256` (HMAC-SHA256 over raw body w/ `appSecret`) →
     parsed and dispatched; invalid signature → `401`, no events emitted.
   - Inbound `messages[]` → emits `message` + the specific event (`text`/`image`/`reaction`/
     `button-click`/`list-select`/location/contact) with the same context shape as baileys.
   - Inbound `statuses[]` → emits `message-status` (`sent`/`delivered`/`read`/`failed`).
8. Web-only surfaces on the cloud provider (`group`, `newsletter`, `community`, `privacy`,
   `presence.subscribe`, status/stories) throw a typed `ZaileysProviderError`
   (`UNSUPPORTED_ON_CLOUD`) with a clear message — never a silent no-op or vague crash.
9. `pnpm build` typings: consumers using only cloud don't need baileys types to compile.
10. Docs + runnable examples for express, hono, and Next.js route handlers.

## 3. Commands

```bash
pnpm build            # tsup → dist (esm+cjs) + tsc d.ts
pnpm typecheck        # tsc --noEmit
pnpm test             # vitest run
pnpm audit:comments   # no // comments in src (only /** */)
pnpm audit:any        # no `any`
pnpm size             # size-limit
```

Feature verification (mock-fetch, no live Meta calls):

```bash
pnpm test tests/cloud            # transport, translators, webhook, capability guards
pnpm test tests/integration/cloud-*  # provider-switch + send/receive round-trips
```

Optional live smoke (gated, maintainer-only, real sandbox number):

```bash
WA_TOKEN=… WA_PHONE_ID=… pnpm tsx scripts/smoke-cloud.mts
```

## 4. Project structure

New code isolated under `src/cloud/` + a thin transport seam. Client gains a provider switch.

```
src/transport/
  types.ts            # Transport interface (superset the Client needs), ProviderKind
  index.ts
src/cloud/
  types.ts            # CloudOptions + Graph request/response types
  graph-client.ts     # fetch wrapper: auth header, versioned URL, retry/backoff, error → ZaileysCloudError
  transport.ts        # CloudTransport: connect(health-check), sendMessage seam, react, markRead, typing
  media.ts            # upload (buffer/stream/url) + download by media id
  webhook.ts          # webhook(): GET verify + POST signature verify + dispatch to events
  capabilities.ts     # UNSUPPORTED_ON_CLOUD guard + typed error
  template.ts         # template() builder method payloads
  translate/
    outbound.ts       # AnyMessageContent → Graph message payload (text/media/interactive/location/contact)
    inbound.ts        # Meta webhook value → zaileys message context + event kind
src/client/client.ts  # provider switch: choose transport; lazy import('baileys') only for 'baileys'
src/client/types.ts   # ClientOptions.provider + ClientOptions.cloud; ConnectionEventMap += message-status
tests/cloud/…         # unit: translators, webhook parse+verify, capability guards
tests/integration/cloud-*.test.ts   # provider switch, send round-trip vs mock fetch, webhook→event
tests/_fixtures/cloud/…             # real Meta webhook JSON payloads (message, status, interactive, media)
examples/cloud-express.ts, cloud-hono.ts, cloud-next-route.ts
docs/…                # Cloud provider guide + capability matrix
scripts/smoke-cloud.mts             # gated live smoke
.changeset/*.md       # minor bump (additive feature)
```

### Transport seam (design)

```ts
// src/transport/types.ts
export type ProviderKind = 'baileys' | 'cloud'

export interface Transport extends BuilderSocketLike {
  readonly provider: ProviderKind
  connect(): Promise<void>
  disconnect(): Promise<void>
  react(key: WAMessageKey, emoji: string): Promise<WAMessageKey>
  markRead(id: string): Promise<void>
  // events flow OUT via a callback the Client registers (inbound webhook / socket)
}
```

- Baileys today = implicit transport (`this._socket`); wrap it to satisfy `Transport` with the
  smallest adapter, no rewrite of existing baileys paths.
- `CloudTransport.sendMessage(to, content, opts)` inspects `AnyMessageContent`
  (`{text}`, `{image,caption}`, `{buttons}`, `{templateMessage}`, …) → builds Graph JSON →
  POSTs → returns a synthesized `WAMessage` (`key.id = wamid`, `fromMe: true`) so
  `recordSent`, `reply`, and the store keep working.

### Capability matrix (v1)

| Feature | Cloud provider |
|---|---|
| text / media / sticker / reaction / read receipt / typing | ✅ |
| reply (context msg id), forward | ✅ (forward = re-send content) |
| interactive buttons / list | ✅ |
| template message | ✅ (Cloud-only method) |
| location / contact (send + receive) | ✅ |
| inbound message + status webhooks | ✅ |
| group / newsletter / community / privacy / presence.subscribe / status(stories) | ❌ throw `UNSUPPORTED_ON_CLOUD` |
| QR / pairing / session creds | ❌ N/A (token auth; no `qr`/`pairing-code` events) |

## 5. Code style

- Match existing repo conventions strictly: strict TS, **no `any`** (`audit:any`), **no `//`
  comments** in `src` — only `/** */` TSDoc (`audit:comments` enforces both, runs in pre-commit).
- Structural interfaces named `*Like` for duck-typed seams; typed domain errors extend the
  existing `Zaileys*Error` family (`ZaileysCloudError`, `ZaileysProviderError`) with a stable
  `code` union — mirror `store-error.ts` / `builder/errors.ts`.
- No new runtime deps: use global `fetch` (Node ≥18) and `node:crypto` for HMAC. Graph types
  are hand-written minimal shapes, not a generated SDK.
- Pin `apiVersion` to a single default constant; make it overridable. Verify the current
  stable Graph version against Meta's changelog at implementation time (use Context7/live docs
  before hardcoding).
- Keep `src/cloud/` free of baileys imports except the shared `AnyMessageContent`/`WAMessage`
  *types* (type-only imports, no runtime coupling).

## 6. Testing strategy

- **Unit (no network)**:
  - `translate/outbound`: each content kind → exact Graph body (table-driven).
  - `translate/inbound`: fixture Meta payloads → expected event kind + context fields.
  - `webhook`: GET challenge (valid/invalid token), POST signature verify (valid/tampered/
    missing), malformed body → safe `400` and no emit.
  - `capabilities`: every web-only accessor throws `UNSUPPORTED_ON_CLOUD` on cloud provider.
  - `graph-client`: URL/versioning, auth header, error mapping, retry on 429/5xx.
- **Integration (mock fetch)**: mock global `fetch` (vi) — assert method, URL, headers, body
  for send/media/react/read; drive `webhook()` with fixtures → assert emitted events. Provider
  switch: `provider:'baileys'` never touches fetch; `provider:'cloud'` never touches baileys.
- **Regression**: existing full suite must stay green (baileys default path unchanged).
- **Live smoke**: `scripts/smoke-cloud.mts`, opt-in via env, never in CI (mirrors
  `smoke-baileys` policy). No secrets in the repo.
- Fixtures are **real** Meta webhook JSON captured from the API docs / sandbox, stored under
  `tests/_fixtures/cloud/` so parser tests reflect actual payload shapes.

## 7. Boundaries

- **Always**:
  - Keep `provider:'baileys'` the default and 100% backward compatible — additive only,
    `minor` semver bump.
  - Verify webhook signatures when `appSecret` is set; reject unsigned/tampered POSTs.
  - Throw a clear typed error for anything the Cloud API genuinely can't do — never fake it.
  - Lazy-load baileys so Cloud-only installs don't pull it at runtime.
- **Ask first**:
  - Publishing to npm; changing `peerDependencies` or `exports`; adding any runtime dependency.
  - Hardcoding a Graph `apiVersion` (confirm latest stable first).
  - Introducing a built-in HTTP listener (`wa.listen(port)`) — v1 ships only the
    framework-agnostic `webhook()` handler; a listener helper is a later, separate decision.
- **Never**:
  - Break or fork the existing baileys code paths / public API.
  - Commit tokens, `appSecret`, or phone-number ids; no live Meta calls in tests/CI.
  - Add `//` comments or `any` in `src` (pre-commit will reject).
  - Store or log message bodies/tokens beyond what zaileys already does.

## 8. Delivery phases (incremental, each independently shippable)

1. **Seam + switch**: `Transport` interface, wrap baileys as a transport, `provider`/`cloud`
   options, `CloudTransport` skeleton (`connect` health-check + text send). No behavior change
   for baileys. Lands with tests for provider switch + text send.
2. **Media + basics**: media upload/download, reaction, mark-read, typing, reply/context id.
3. **Webhook inbound**: `webhook()` GET verify + POST signature + parse `messages`/`statuses`
   → emit `message`/specific + `message-status`. Fixtures + parser tests.
4. **Interactive + template**: buttons/list send + inbound `button-click`/`list-select`;
   `template()` method.
5. **Location + contacts + guards**: send/receive location & contact; wire
   `UNSUPPORTED_ON_CLOUD` across web-only modules.
6. **Docs + examples**: express/hono/next examples, Cloud guide, capability matrix, changeset,
   gated live smoke.
```

## 9. Batch 2 — business & commerce layer (added 2026-07-14)

Everything else the Cloud API offers, namespaced under `wa.cloud.*` (cloud-only module):
template management (CRUD + status webhook), business profile get/update, Flows (send +
`flow-response` event + list), catalog/product messages (+ inbound `order` event),
blocklist, QR code messages, analytics, phone-number management (register/2FA — never
live-smoked). WABA-scoped endpoints require `cloud.wabaId`. Same rules as batch 1: mock-fetch
TDD per slice, typed errors, additive minor, baileys untouched.
