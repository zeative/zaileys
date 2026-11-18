---
'zaileys': minor
---

Graph API requests on the Cloud API provider, including the `connect()` health check, now time out after `cloud.requestTimeoutMs` (default 30000) and reject with `REQUEST_FAILED`. Before, a hung request never settled and blocked sends forever. A timed-out request is not retried, because it may already have reached Meta.
