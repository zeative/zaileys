# Plan — Meta WhatsApp Cloud API provider

Source of truth: [SPEC.md](../SPEC.md). This plan slices that spec into vertically
integrated tasks (each task = one complete path, not a horizontal layer), ordered by
dependency, with checkpoints for human review between phases.

## Architecture decisions (locked from investigation)

1. **One `Client`, `provider` switch.** `provider` defaults to `'baileys'`; existing paths
   untouched. baileys is dynamically imported only for the baileys provider.
2. **Send reuse.** `MessageBuilder` already targets the `BuilderSocketLike` seam
   (`sendMessage(jid, AnyMessageContent, opts)`). `CloudTransport.sendMessage` translates
   baileys content → Graph payload → POST, and returns a **synthesized `WAMessage`**
   (`key.id = wamid`, `fromMe`) so `recordSent`/`reply`/store keep working.
3. **Receive reuse (the big win).** Inbound decoding (`src/events/decoders/*`,
   `attachInboundPipeline`) operates on baileys `WAMessage`. `CloudTransport` exposes a
   `PipelineSocketLike` with a **synthetic `ev` emitter**; the webhook parser turns Meta JSON
   into baileys-shaped `WAMessage[]` and emits `messages.upsert`. The existing pipeline then
   decodes and fires `text/image/reaction/button-click/list-select/...` unchanged. No parallel
   emit logic, no drift.
4. **Status events.** Meta `statuses[]` have no baileys `messages.upsert` equivalent →
   translate to a small new `message-status` event (`sent|delivered|read|failed`).
5. **Web-only modules on cloud throw.** Modules take an injected `getSocket()`. For cloud,
   inject a getter that throws `ZaileysProviderError('UNSUPPORTED_ON_CLOUD')`, so
   `group/newsletter/community/privacy/presence.subscribe/status` fail loud and typed.
6. **No new runtime deps.** Global `fetch` for Graph; `node:crypto` for HMAC signature.

## Component dependency graph

```
                 ┌────────────────────────────┐
                 │ S0 transport seam + switch  │  (enabler; baileys wrapped, cloud skeleton)
                 └──────────────┬──────────────┘
              ┌─────────────────┼─────────────────┐
              ▼                                     ▼
     ┌──────────────────┐                 ┌──────────────────────┐
     │ S1 SEND text     │                 │ S2 RECEIVE text      │
     │ graph-client +   │                 │ synthetic ev +       │
     │ outbound.text    │                 │ inbound.text +       │
     │                  │                 │ webhook GET/POST/sig │
     └───────┬──────────┘                 └───────────┬──────────┘
             │        ┌──────────────────────┐        │
             └───────▶│ round-trip capable    │◀───────┘
                      └───────────┬───────────┘
       ┌──────────────┬──────────┼───────────┬───────────────┐
       ▼              ▼          ▼            ▼               ▼
   S3 media      S4 react/    S5 inter-   S6 location/    S7 capability
   send+recv     read/typing/ active +    contacts +      guards +
                 reply        template    status events   lazy baileys
                                   │
                                   ▼
                             S8 docs + examples + changeset + smoke
```

- **S0 blocks everything.**
- **S1 and S2 are independent** (send vs receive) and can be built in parallel; both need S0.
- **S3–S6** each need S1 (send side) and/or S2 (receive side) but are independent of each other.
- **S7** needs S0 (provider switch exists); otherwise standalone.
- **S8** is last (documents finished behavior).

## Phases & checkpoints

- **Phase A = S0.** → 🚩 Checkpoint 1: seam merged, baileys path byte-identical, full suite green.
- **Phase B = S1 + S2.** → 🚩 Checkpoint 2: first full text round-trip on cloud (send + webhook receive).
- **Phase C = S3 + S4.** → 🚩 Checkpoint 3: media + reactions/read/typing both directions.
- **Phase D = S5 + S6.** → 🚩 Checkpoint 4: interactive/template + location/contacts + statuses.
- **Phase E = S7.** → 🚩 Checkpoint 5: capability guards + lazy baileys; feature-complete.
- **Phase F = S8.** → 🚩 Checkpoint 6: docs/examples/changeset ready; go/no-go for minor release.

Each task lands with its own tests + keeps the existing suite green. No task merges red.

---

## Tasks

### S0 — Transport seam + provider switch (enabler)

**T0.1 Config surface.** Add `ClientOptions.provider?: 'baileys' | 'cloud'` (default
`'baileys'`) and `ClientOptions.cloud?: CloudOptions` (`accessToken`, `phoneNumberId`,
`wabaId?`, `verifyToken?`, `appSecret?`, `apiVersion?`, `baseUrl?`). Validate: `provider:'cloud'`
requires `accessToken` + `phoneNumberId`, else throw a typed config error at construct time.
- *Accept*: constructing cloud without required fields throws `ZaileysCloudError('CONFIG')`;
  baileys/no-provider construct unaffected.
- *Verify*: `pnpm typecheck`; unit test on the validation branch.

**T0.2 Transport interface.** `src/transport/types.ts`: `ProviderKind`, `Transport extends
BuilderSocketLike` (+ `provider`, `connect`, `disconnect`, `react`, `markRead`, and a
`PipelineSocketLike`-compatible `ev`/`user`). Wrap the current baileys socket as a
`BaileysTransport` adapter — the thinnest shim that satisfies `Transport` by delegating to the
existing socket; **no rewrite** of baileys logic.
- *Accept*: Client uses `this.transport` where it used `this._socket` for send/pipeline/react/
  read; baileys behavior identical.
- *Verify*: full existing suite green (esp. `tests/integration/*`, `tests/client/*`).

**T0.3 CloudTransport skeleton.** `src/cloud/transport.ts`: `connect()` = health check
(`GET /{phoneNumberId}` with token; 200 → emit `connect`, 401/403 → typed auth error, no
retry). `disconnect()` = no-op + state transition. `sendMessage`/`react`/`markRead` throw
`NOT_IMPLEMENTED` for now. Synthetic `ev` (a plain EventEmitter) + `user = { id: phoneNumberId }`.
- *Accept*: `new Client({provider:'cloud',cloud}).connect()` against mock fetch resolves and
  emits `connect`; bad token → typed error, no `qr`/`pairing` events ever.
- *Verify*: `tests/cloud/transport-connect.test.ts` with mocked `fetch`.

🚩 **Checkpoint 1** — provider switch works, baileys untouched, cloud connects (no messaging yet).

---

### S1 — Send text (vertical: `send(to).text()` → Graph)

**T1.1 Graph client.** `src/cloud/graph-client.ts`: versioned URL builder, `Authorization:
Bearer`, JSON POST/GET, error mapping (Graph error object → `ZaileysCloudError` with code +
Meta error subcode), retry/backoff on 429 + 5xx (bounded), respects `baseUrl`/`apiVersion`.
- *Accept*: correct method/URL/headers/body for a text send; 429 retried then surfaced.
- *Verify*: `tests/cloud/graph-client.test.ts` (mock fetch, assert request shape + retry).

**T1.2 Outbound text translator + transport wire.** `src/cloud/translate/outbound.ts`:
`AnyMessageContent {text}` → `{ messaging_product:'whatsapp', to, type:'text', text:{body} }`.
`CloudTransport.sendMessage` calls graph-client, maps `messages[0].id` → synthesized
`WAMessage`.
- *Accept*: `await wa.send('628x').text('hi')` returns a key with the wamid; asserted request
  body exact.
- *Verify*: `tests/integration/cloud-send-text.test.ts` (mock fetch).

🚩 (rolls into Checkpoint 2 with S2)

---

### S2 — Receive text (vertical: webhook POST → `message`/`text` event)

**T2.1 Webhook handler.** `src/cloud/webhook.ts`: `wa.webhook()` returns `(req: Request) =>
Promise<Response>`. GET: verify `hub.mode==='subscribe' && hub.verify_token===verifyToken` →
`200` echo `hub.challenge`, else `403`. POST: read raw body, verify `X-Hub-Signature-256`
HMAC-SHA256 with `appSecret` (constant-time compare) when set → else `401`; parse JSON.
- *Accept*: GET valid/invalid; POST tampered sig → `401` + zero emits; malformed → `400`.
- *Verify*: `tests/cloud/webhook.test.ts` (fixtures + `node:crypto` signature).

**T2.2 Inbound text translator.** `src/cloud/translate/inbound.ts`: Meta `value.messages[]`
(type `text`) + `value.contacts[]` → baileys-shaped `WAMessage`. Emit on the synthetic `ev`
as `messages.upsert`. Client attaches `attachInboundPipeline(this, transport, …)` for **both**
providers.
- *Accept*: posting a real Meta text webhook fixture → `message` **and** `text` events fire
  with correct `roomId/senderId/text` matching baileys context shape.
- *Verify*: `tests/integration/cloud-receive-text.test.ts` (fixture → event assertions).

🚩 **Checkpoint 2** — full text round-trip on cloud; existing suite still green.

---

### S3 — Media (send + receive)

**T3.1 Media upload + outbound.** `src/cloud/media.ts` upload (buffer/stream/url →
`POST /{phoneNumberId}/media` → media id). Outbound translate for `image/video/audio/
document/sticker` (caption, filename, mime) referencing the media id.
- *Accept*: `send(to).image('./a.jpg',{caption})` uploads then sends referencing id; body exact.
- *Verify*: `tests/integration/cloud-send-media.test.ts` (mock upload + send).

**T3.2 Media download + inbound.** Inbound media messages → synthesize `WAMessage` with a
`downloadMedia`-compatible path (`GET /{mediaId}` → URL → fetch bytes). Wire `client.downloadMedia`
for cloud.
- *Accept*: media webhook fixture → `image`/etc event; `downloadMedia(key)` returns bytes (mock).
- *Verify*: `tests/integration/cloud-receive-media.test.ts`.

---

### S4 — Reaction / read / typing / reply

**T4.1 Outbound react + markRead + typing.** `react` → `type:'reaction'`; `markRead(id)` →
`status:'read'`; typing indicator on read (Cloud API `typing_indicator`). `reply` sets
`context.message_id`.
- *Accept*: each issues the exact Graph body; `reply` carries context id.
- *Verify*: `tests/cloud/outbound-react-read.test.ts`.

**T4.2 Inbound reaction.** Meta reaction message → `reaction` event (reuse existing decoder via
synthesized reaction `WAMessage`).
- *Accept*: reaction webhook fixture → `reaction` event with emoji + target key.
- *Verify*: `tests/integration/cloud-receive-reaction.test.ts`.

---

### S5 — Interactive + template

**T5.1 Interactive send.** Outbound translate for `buttons`/`list` → Graph `interactive`
(`button` / `list`).
- *Accept*: `send(to).buttons(...)` / list → exact interactive payload.
- *Verify*: `tests/cloud/outbound-interactive.test.ts`.

**T5.2 Interactive inbound.** `interactive` reply (`button_reply`/`list_reply`) → synthesize
`WAMessage` → existing `decodeButtonClick`/`decodeListSelect` → `button-click`/`list-select`.
- *Accept*: fixtures → correct events with selected id/title.
- *Verify*: `tests/integration/cloud-receive-interactive.test.ts`.

**T5.3 Template method.** Add `send(to).template(name, lang, components?)` (Cloud-only) →
`type:'template'`. On the baileys provider it throws `UNSUPPORTED` (or is cloud-gated).
- *Accept*: template send body exact; baileys provider rejects clearly.
- *Verify*: `tests/cloud/outbound-template.test.ts`.

---

### S6 — Location / contacts / status events

**T6.1 Location + contacts (both directions).** Outbound `location`/`contact` → Graph;
inbound `location`/`contacts` → events (reuse decoders).
- *Accept*: send bodies exact; inbound fixtures → events with parsed fields.
- *Verify*: `tests/integration/cloud-location-contacts.test.ts`.

**T6.2 Status events.** Parse `value.statuses[]` → emit `message-status`
(`{ id, recipientId, status, timestamp }`). Add to `ConnectionEventMap`.
- *Accept*: status fixture → `message-status` per status; typed payload.
- *Verify*: `tests/cloud/webhook-status.test.ts`.

---

### S7 — Capability guards + lazy baileys

**T7.1 Web-only guards.** On cloud, inject `getSocket()` that throws
`ZaileysProviderError('UNSUPPORTED_ON_CLOUD', <feature>)` for `group/newsletter/community/
privacy/presence.subscribe/status`.
- *Accept*: each accessor/op throws the typed error with the feature name on cloud; unaffected
  on baileys.
- *Verify*: `tests/cloud/capabilities.test.ts` (table-driven over the web-only surfaces).

**T7.2 Lazy baileys import.** `import('baileys')` only when `provider==='baileys'`. Confirm a
cloud-only path never imports baileys at runtime.
- *Accept*: cloud construct+connect+send with baileys module mocked to throw-on-import.
- *Verify*: `tests/integration/cloud-no-baileys.test.ts`; `pnpm size` (cloud entry weight noted).

🚩 **Checkpoint 5** — feature-complete; run full suite + typecheck + audits.

---

### S8 — Docs, examples, release

**T8.1 Examples.** `examples/cloud-express.ts`, `cloud-hono.ts`, `cloud-next-route.ts` (GET
verify + POST handler wiring via `wa.webhook()`).
**T8.2 Docs.** Cloud provider guide + capability matrix + webhook setup (verify token, app
secret, subscribing fields) under `docs/`.
**T8.3 Changeset + smoke.** `minor` changeset; gated `scripts/smoke-cloud.mts` (env-guarded,
not CI). Confirm `apiVersion` default against Meta's current changelog before pinning.
- *Verify*: examples typecheck; `pnpm build` clean; docs build.

🚩 **Checkpoint 6** — human go/no-go before `pnpm changeset version` + publish (publish always
maintainer-manual per RELEASE.md).

## Risks / open questions

- **Inbound `WAMessage` fidelity**: synthesizing baileys proto shape well enough for existing
  decoders is the highest-risk area — mitigated by fixture-driven tests per message type
  (T2.2, T3.2, T4.2, T5.2, T6.1). If a decoder proves too baileys-specific, fall back to a
  direct `buildMessageContext` for that type (documented deviation).
- **Graph `apiVersion`**: confirm latest stable before pinning (T8.3).
- **Deferred (needs a decision, not in v1)**: built-in `wa.listen(port)` HTTP listener;
  template management/CRUD; flows; multi-number routing from one webhook.
