# Plan — WhatsApp Calling (official provider)

## Feasibility verdict (investigated, not assumed)

**YES — but only on the ☁️ official provider, and only the signaling layer.**

| Path | Verdict | Evidence |
| --- | --- | --- |
| 🔗 **Unofficial (baileys)** — place/answer calls | ❌ **Not possible** | baileys' entire call surface is `rejectCall(callId, callFrom)`. No `offerCall`/`placeCall`/`acceptCall`, and **no WebRTC/SRTP media stack** (grep of `node_modules/baileys` = signaling-receive + reject only). Building it = reverse-engineering WhatsApp's E2E call transport — a separate research project, not a zaileys feature. |
| ☁️ **Official (Cloud API Calling)** | ✅ **Possible & GA** | Meta's **WhatsApp Business Calling API** is generally available: users can call the business (global), businesses can call users (permission-gated, blocked in US/CA/EG/VN/NG). Architecture = **webhook-driven signaling + SDP exchange** — the exact model zaileys already implements for messaging. |

### The honest boundary (read before approving)

The Calling API splits in two:

1. **Signaling** — the WhatsApp-specific part: a `calls` webhook delivers an **SDP offer**; you reply via
   `POST /{phoneNumberId}/calls` with an action (`pre_accept` / `accept` / `reject` / `terminate`, plus
   business-initiated connect) and your **SDP answer**. This is HTTP + webhook → **100% zaileys territory**,
   and it reuses everything we already built (graph client, webhook handler, event pipeline).
2. **Media** — the actual audio (OPUS over WebRTC/SRTP). This needs a media stack (`werift`,
   `node-datachannel`, or a SIP/media server). **zaileys will NOT bundle a WebRTC stack** — that's a
   different library's job and would drag a huge native dep into a messaging framework.

**So v1 ships**: zaileys owns signaling + call control + permissions, and **hands you the SDP offer** so you
plug in whatever media stack you want (documented recipe with `werift`). Without a media stack you can still
do everything that doesn't need audio: **detect calls, reject them, terminate them, manage permissions** —
which is what most bots actually want.

<!-- If the team wants zaileys to also carry audio end-to-end, that's a separate, much bigger project
     (bundled WebRTC + jitter buffer + codec plumbing). Not in this plan. -->

## Dependency graph

```
        ┌──────────────────────────────────────────────────┐
        │ T0 SPIKE — verify the real Calling API surface     │  BLOCKS EVERYTHING
        │ exact endpoints, actions, payload + webhook shapes │  (no invented API)
        └───────────────────────┬──────────────────────────┘
                                ▼
        ┌──────────────────────────────────────────────────┐
        │ T1 inbound: `calls` webhook → typed call events    │  (SDP offer surfaced)
        └───────────────────────┬──────────────────────────┘
                    ┌───────────┴───────────┐
                    ▼                       ▼
        ┌──────────────────────┐  ┌──────────────────────────┐
        │ T2 call control       │  │ T3 business-initiated     │
        │ preAccept/accept/     │  │ initiate + call           │
        │ reject/terminate      │  │ permissions               │
        └───────────┬──────────┘  └────────────┬─────────────┘
                    └───────────┬──────────────┘
                                ▼
                 ┌──────────────────────────────┐
                 │ T4 docs + skill + changeset   │  (incl. werift media recipe)
                 └──────────────────────────────┘
```

- **T0 blocks all** — every later task depends on verified request/response shapes.
- **T2 / T3** both need T1's event + types; independent of each other.
- **T4** last.

## Phases & checkpoints

- **Phase A = T0.** → 🚩 **CP1 (hard gate)**: the real API surface documented from Meta docs + a live probe
  against our sandbox WABA. **If the shapes can't be verified, STOP and report** — do not invent payloads.
- **Phase B = T1.** → 🚩 CP2: an inbound call fires a typed event carrying the SDP; suite green.
- **Phase C = T2 + T3.** → 🚩 CP3: full call control + permissions; suite green.
- **Phase D = T4.** → 🚩 CP4: docs/skill/changeset; ready to release.

---

## Tasks

### T0 — SPIKE: verify the Calling API surface (blocking)

Read Meta's Calling API docs **and probe the live Graph API** with the sandbox WABA in `.env`
(`WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `META_WABA_ID`) — read-only calls first.

Capture, verbatim:
- `POST /{phoneNumberId}/calls` — exact body per action (`pre_accept`/`accept`/`reject`/`terminate`,
  business-initiated connect), incl. `call_id` and the `session: { sdp_type, sdp }` shape.
- Call **permissions**: request + status endpoints, and how a permission is requested from a user.
- The `calls` **webhook** payload (connect/terminate/status), incl. where the SDP offer lives.
- Enablement prerequisites: `calls` webhook field subscription, call features toggle on the number,
  business-initiated country blocks + rate limits (sandbox 25/day vs prod 1/day).

- *Accept*: a written, source-cited surface note (`tasks/calling-api-notes.md`) with **zero invented
  fields**; every shape traced to a Meta doc URL or a live response.
- *Verify*: `curl`/probe transcript for at least: read call settings on our number, and the docs URL for
  each endpoint. Flag anything unverifiable as **UNKNOWN** rather than guessing.

🚩 **CP1 — hard gate.** Report findings. If Meta's docs contradict this plan (e.g. media can't be
delegated), re-plan before writing code.

### T1 — Inbound: `calls` webhook → typed events

- Extend `src/cloud/translate/inbound.ts` to parse the `calls` change field.
- Surface via the **existing** `call-incoming` / `call-ended` events (unified DX) with cloud-only optional
  fields (`sdp`, `session`, `direction`, `callStatus`), so `client.on('call-incoming')` works on **both**
  providers; add a cloud `call-status` event if the spike shows a distinct status stream.
- Webhook already verifies signature + dispatches — reuse untouched.
- *Accept*: a real `calls` webhook fixture → typed event with the SDP offer intact; existing message/status
  webhooks unaffected.
- *Verify*: `tests/cloud/webhook-calls.test.ts` (fixture → event), full suite green.

🚩 **CP2**.

### T2 — Call control: `wa.cloud.calls.*`

`preAccept(callId, sdp)` · `accept(callId, sdp)` · `reject(callId)` · `terminate(callId)` — thin, typed
wrappers over the verified `POST /{phoneNumberId}/calls` actions, on the existing graph client.

- Also: make the existing **`client.rejectCall()` work on cloud** (today it throws `UNSUPPORTED_ON_CLOUD`)
  by routing to `wa.cloud.calls.reject()` — one API, both providers. Update the guard + its test.
- *Accept*: each method issues the exact verified body; `rejectCall` no longer throws on cloud;
  `autoRejectCall` works on the cloud provider too (wire it for both once calls exist there).
- *Verify*: `tests/cloud/calls.test.ts` (mock fetch, assert exact bodies) + update
  `tests/client/auto-reject-call.test.ts` cloud expectations; full suite.

### T3 — Business-initiated calls + permissions

- `wa.cloud.calls.initiate(to, { sdp })` (or the verified equivalent) + `wa.cloud.calls.permissions.request(to)` /
  `.get(to)`.
- Surface the country/rate limits from T0 as typed errors + doc'd ceilings.
- *Accept*: exact bodies; a permission-denied path surfaces a clear `ZaileysCloudError`.
- *Verify*: `tests/cloud/calls-permissions.test.ts`.

🚩 **CP3**.

### T4 — Docs + skill + changeset

- Docs: new `official/calling.mdx` (setup/enablement, inbound flow, control actions, permissions, limits,
  **and an explicit "you supply the media stack" section** + a `werift` answer-SDP recipe). Update
  `providers.mdx` (calls: 🔗 reject-only / ☁️ full signaling), `official/limits.mdx`, `events.mdx`.
- Skill: `references/cloud.md` (calls section), `recipes.md` (answer-a-call recipe), api.md cues; `skill:sync`.
- Changeset: **minor**.
- *Verify*: `docs && npm run build` clean; `diff -r skills plugins/.../skills` clean.

🚩 **CP4** — ready to release (publish on the user's go-ahead).

## Risks

- **Inventing API** (highest) — the reference doc 404'd during research; shapes are only partly confirmed.
  Mitigate: **T0 is a hard gate**; anything unverified ships as UNKNOWN, not a guess.
- **Media expectation gap** — the team may expect zaileys to carry audio. Mitigate: the boundary is stated
  up front here and will be loud in the docs; ship the `werift` recipe so it's usable, not theoretical.
- **Enablement friction** — calling must be toggled on the number; business-initiated needs ≥2,000 daily
  messaging limit + permission, and is blocked in US/CA/EG/VN/NG. Mitigate: document; test inbound first
  (GA globally, no permission needed).
- **Can't live-test audio** — our sandbox may not have calling enabled. Mitigate: fixture-driven tests for
  signaling; flag live-call verification as a separate manual step for the user.

## Sources

- [Meta — WhatsApp Cloud API Calling](https://developers.facebook.com/docs/whatsapp/cloud-api/calling)
- [WhatsApp Business Calling API overview (2026)](https://hyperleap.ai/whatsapp-business-api/calling-api)
- [Integrating WhatsApp Calling API with WebRTC](https://medium.com/@arslan.ali1396/how-to-integrate-whatsapp-calling-api-in-your-web-app-using-webrtc-5c073041e819)
