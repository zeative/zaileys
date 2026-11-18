---
'zaileys': patch
---

`client.presence.typing(jid, ms)` and `recording(jid, ms)` now cap `ms` at 2^31-1 ms, Node's `setTimeout` limit. A larger value used to send `paused` after 1 ms instead of keeping the indicator on.
