# Todo — Meta WhatsApp Cloud API provider

Plan: [plan.md](plan.md) · Spec: [../SPEC.md](../SPEC.md). Each task lands with tests + keeps
the existing suite green. 🚩 = human-review checkpoint.

## Phase A — S0 seam + provider switch
- [x] T0.1 `ClientOptions.provider` + `cloud` config + construct-time validation (typed error)
- [x] T0.2 `Transport` interface + `BaileysTransport` shim (Client uses `this.transport`); baileys behavior identical
- [x] T0.3 `CloudTransport` skeleton: `connect()` health-check, synthetic `ev`, stubs throw `NOT_IMPLEMENTED`
- [x] 🚩 CHECKPOINT 1: provider switch works, baileys byte-identical, full suite green

## Phase B — S1 send text + S2 receive text
- [x] T1.1 `graph-client.ts`: versioned URL, bearer auth, error map, 429/5xx retry
- [x] T1.2 outbound text translator + `CloudTransport.sendMessage` → synthesized WAMessage
- [x] T2.1 `webhook()` handler: GET verify challenge + POST HMAC-SHA256 signature verify
- [x] T2.2 inbound text translator → synthetic `messages.upsert` → attach pipeline for both providers
- [x] 🚩 CHECKPOINT 2: full text round-trip on cloud; existing suite green

## Phase C — S3 media + S4 react/read/typing
- [x] T3.1 media upload + outbound image/video/audio/document/sticker
- [x] T3.2 media download + inbound media events + `downloadMedia` for cloud
- [x] T4.1 outbound react + markRead + typing + reply(context id)
- [x] T4.2 inbound reaction → `reaction` event
- [x] 🚩 CHECKPOINT 3: media + reactions/read/typing both directions

## Phase D — S5 interactive/template + S6 location/contacts/status
- [x] T5.1 interactive send (buttons/list → Graph `interactive`)
- [x] T5.2 interactive inbound → `button-click`/`list-select`
- [x] T5.3 `send(to).template(...)` (cloud-only)
- [x] T6.1 location + contacts (send + receive)
- [x] T6.2 status events → `message-status` (add to ConnectionEventMap)
- [x] 🚩 CHECKPOINT 4: interactive/template + location/contacts + statuses

## Phase E — S7 guards + lazy baileys
- [x] T7.1 web-only modules throw `UNSUPPORTED_ON_CLOUD` on cloud
- [ ] T7.2 lazy baileys import — DEFERRED: builder/decoder top-level imports pull baileys regardless; startup-only cost, needs its own refactor
- [x] 🚩 CHECKPOINT 5: feature-complete; full suite + typecheck + audits green

## Phase F — S8 docs + release
- [x] T8.1 examples: express, hono, next route
- [x] T8.2 docs: cloud guide + capability matrix + webhook setup
- [x] T8.3 minor changeset + gated `smoke-cloud.mts` + confirm `apiVersion` default
- [x] 🚩 CHECKPOINT 6: go/no-go for minor release (publish stays maintainer-manual)
