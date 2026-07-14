# Plan — Cloud API batch 2: business & commerce layer (full coverage)

Batch 1 (messaging core) shipped: commits `c5d6b63..c006d3d`. This plan covers **everything
else the official Cloud API offers**, per the user's "total semua" directive. Spec: SPEC.md
(batch 2 section).

## Scope & DX decision

All new surfaces live under one namespaced module — `wa.cloud.*` — constructed lazily,
provider-guarded once (throws on baileys). Keeps `Client` lean, mirrors how `wa.group.*`
works on the web provider:

```ts
wa.cloud.templates.list() / .create() / .delete()
wa.cloud.profile.get() / .update()
wa.cloud.flows.list() / send via send(to).flow(...)
wa.cloud.blocklist.add() / .remove() / .list()
wa.cloud.qr.create() / .list() / .delete()
wa.cloud.analytics.conversations() / .messages()
wa.cloud.phone.register() / .deregister() / .requestCode() / .verifyCode()
```

WABA-level endpoints require `cloud.wabaId`; module methods that need it throw
`ZaileysCloudError('CONFIG')` with a clear message when absent.

## Tasks (dependency order; each = RED → GREEN → regression → commit)

- **B1 namespace**: `CloudModule` on `Client.cloud` (cloud-only guard, wabaId helper).
  Accept: `wa.cloud` throws on baileys; sub-modules reachable on cloud.
- **B2 template management**: list/get/create/delete via `/{wabaId}/message_templates`;
  parse `message_template_status_update` webhook → `template-status` event.
  Accept: exact request shapes; status webhook fixture → event.
- **B3 business profile**: get/update `/{phoneNumberId}/whatsapp_business_profile`
  (about, address, description, email, websites, vertical). Profile picture ceiling noted
  (needs resumable upload — deferred).
- **B4 flows**: `send(to).flow({...})` → interactive `flow` payload; inbound `nfm_reply`
  → new `flow-response` event; `wa.cloud.flows.list()` via WABA.
- **B5 catalog/commerce**: `send(to).product(retailerId)` + `.productList(sections)` →
  interactive product payloads; inbound `order` message → new `order` event.
- **B6 blocklist**: add/remove/list via `/{phoneNumberId}/block_users`.
- **B7 QR codes**: create/list/update/delete `/{phoneNumberId}/message_qrdls`.
- **B8 address message**: `send(to).addressRequest(...)` (interactive `address_message`,
  ID/BR only) + inbound address reply parsed.
- **B9 analytics**: conversation + messaging analytics via `/{wabaId}?fields=...`.
- **B10 phone management**: register/deregister/2FA pin/request+verify code. NOT smoke-tested
  live (touches live number registration).
- **B11 docs + changeset**: extend cloud-api.mdx matrix, update changeset.

All tests mock fetch; fixtures follow real Meta payload shapes. Live smoke only for safe ops
(template list, profile get) if creds available. Existing suite must stay green per task.

## Not possible on Cloud API (stays guarded, unchanged)

Poll, edit, delete, pin, story, newsletter, community, presence-subscribe, carousel,
group management (beta-gated by Meta — revisit when GA).
