---
'zaileys': minor
---

`client.broadcast()` now sends one message per second by default, evenly spaced, instead of five per second with the first five sent at once. An explicit `rateLimitPerSec` is also spaced evenly from the first send, with no initial burst. Bursts of identical messages to many chats are a common reason WhatsApp restricts accounts. To keep the old speed, pass `rateLimitPerSec: 5`.
