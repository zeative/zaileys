---
'zaileys': patch
---

Stop wiping a valid session on a spurious 401 (issue #54). WhatsApp sometimes emits a `logged-out` close right after a successful connect; the client now reconnects to confirm before clearing credentials. A genuine logout (the retry never re-opens) is still cleared, so no orphaned sessions are left behind.
