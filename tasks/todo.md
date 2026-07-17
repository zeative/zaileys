# Todo — WhatsApp Calling (official provider)

Plan: [plan.md](plan.md). **Verdict**: possible on ☁️ official only (Cloud Calling API, GA). zaileys owns
**signaling**; the **media stack (audio) is the user's** — we hand over the SDP. 🔗 baileys can only reject.

## Phase A — Spike (hard gate)
- [ ] T0 verify the real Calling API surface (endpoints, actions, bodies, `calls` webhook shape, permissions, limits) from Meta docs + live probe with the sandbox WABA → `tasks/calling-api-notes.md`, **zero invented fields**
- [ ] 🚩 CP1 **GATE**: report findings; re-plan if docs contradict. Do NOT write code on guessed payloads.

## Phase B — Inbound
- [ ] T1 parse the `calls` webhook → typed `call-incoming` / `call-ended` (+ SDP, direction, status) on cloud; fixture test
- [ ] 🚩 CP2: inbound call fires a typed event with the SDP; suite green

## Phase C — Control
- [ ] T2 `wa.cloud.calls.preAccept/accept/reject/terminate` + make `client.rejectCall()` + `autoRejectCall` work on cloud (drop the guard)
- [ ] T3 business-initiated `calls.initiate()` + `calls.permissions.request/get` + typed limit errors
- [ ] 🚩 CP3: full control + permissions; suite green

## Phase D — Ship
- [ ] T4 docs (`official/calling.mdx` incl. **"you supply the media stack"** + werift recipe, providers/limits/events) + skill (`cloud.md`, recipes) + `skill:sync` + **minor** changeset
- [ ] 🚩 CP4: docs build + skill diff clean; ready to release
