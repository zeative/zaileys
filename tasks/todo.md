# Todo — Meta WhatsApp Cloud API provider

Plan: [plan.md](plan.md) · Spec: [../SPEC.md](../SPEC.md). Each task lands with tests + keeps
the existing suite green. 🚩 = human-review checkpoint.

## Phase A — S0 seam + provider switch
- [ ] T0.1 `ClientOptions.provider` + `cloud` config + construct-time validation (typed error)
- [ ] T0.2 `Transport` interface + `BaileysTransport` shim (Client uses `this.transport`); baileys behavior identical
- [ ] T0.3 `CloudTransport` skeleton: `connect()` health-check, synthetic `ev`, stubs throw `NOT_IMPLEMENTED`
- [ ] 🚩 CHECKPOINT 1: provider switch works, baileys byte-identical, full suite green

## Phase B — S1 send text + S2 receive text
- [ ] T1.1 `graph-client.ts`: versioned URL, bearer auth, error map, 429/5xx retry
- [ ] T1.2 outbound text translator + `CloudTransport.sendMessage` → synthesized WAMessage
- [ ] T2.1 `webhook()` handler: GET verify challenge + POST HMAC-SHA256 signature verify
- [ ] T2.2 inbound text translator → synthetic `messages.upsert` → attach pipeline for both providers
- [ ] 🚩 CHECKPOINT 2: full text round-trip on cloud; existing suite green

## Phase C — S3 media + S4 react/read/typing
- [ ] T3.1 media upload + outbound image/video/audio/document/sticker
- [ ] T3.2 media download + inbound media events + `downloadMedia` for cloud
- [ ] T4.1 outbound react + markRead + typing + reply(context id)
- [ ] T4.2 inbound reaction → `reaction` event
- [ ] 🚩 CHECKPOINT 3: media + reactions/read/typing both directions

## Phase D — S5 interactive/template + S6 location/contacts/status
- [ ] T5.1 interactive send (buttons/list → Graph `interactive`)
- [ ] T5.2 interactive inbound → `button-click`/`list-select`
- [ ] T5.3 `send(to).template(...)` (cloud-only)
- [ ] T6.1 location + contacts (send + receive)
- [ ] T6.2 status events → `message-status` (add to ConnectionEventMap)
- [ ] 🚩 CHECKPOINT 4: interactive/template + location/contacts + statuses

## Phase E — S7 guards + lazy baileys
- [ ] T7.1 web-only modules throw `UNSUPPORTED_ON_CLOUD` on cloud
- [ ] T7.2 lazy `import('baileys')` only for baileys provider; cloud-only never imports it
- [ ] 🚩 CHECKPOINT 5: feature-complete; full suite + typecheck + audits green

## Phase F — S8 docs + release
- [ ] T8.1 examples: express, hono, next route
- [ ] T8.2 docs: cloud guide + capability matrix + webhook setup
- [ ] T8.3 minor changeset + gated `smoke-cloud.mts` + confirm `apiVersion` default
- [ ] 🚩 CHECKPOINT 6: go/no-go for minor release (publish stays maintainer-manual)
