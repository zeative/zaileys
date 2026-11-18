---
'zaileys': patch
---

Auto-connect no longer stalls when the WhatsApp Web version lookup is slow or blocked. Baileys fetches it from `raw.githubusercontent.com` with no timeout, and zaileys waited for it before connecting. After 3 seconds the client now connects with baileys' bundled version and logs a warning. A late answer is still used on the next connect.
