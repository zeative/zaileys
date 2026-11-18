---
'zaileys': minor
---

Add an experimental, opt-in connection watchdog for WhatsApp Web (`watchdog: true` or `{ idleMs, probeTimeoutMs }`, off by default). When a connected session receives no pushed message, receipt, notification, call, presence, or chatstate for `idleMs` (default 15 minutes, at least 1 minute), it looks up the own number; if that check fails or takes longer than `probeTimeoutMs` (default 10 seconds), it logs a warning and ends the socket as `connection-lost`, so the normal reconnect runs. Credentials are never erased. No effect on the Cloud API.
