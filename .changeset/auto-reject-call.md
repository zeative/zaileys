---
'zaileys': minor
---

Auto-reject incoming calls. New `autoRejectCall` client option (`true`, or `{ enabled, allow, onReject }`) hangs up incoming WhatsApp calls automatically — with an allow-list (jid/digits array or predicate) and an `onReject` hook to notify the caller. The underlying `client.rejectCall(call)` / `client.rejectCall(callId, from)` method is exposed for manual control from a `call-incoming` handler. Off by default; unofficial provider only (the Cloud API has no calls — it throws `UNSUPPORTED_ON_CLOUD`).
