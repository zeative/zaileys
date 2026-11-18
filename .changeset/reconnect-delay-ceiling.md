---
'zaileys': patch
---

Reconnect delays are now capped at 2^31-1 ms, Node's `setTimeout` limit. A larger `reconnect.maxDelayMs`, `initialDelayMs`, or `rateLimitedDelayMs` used to fire after 1 ms and reconnect to WhatsApp in a tight loop. `new Client()` now throws a `ZaileysConnectionError` with code `INVALID_OPTIONS` naming the option when a reconnect delay is negative or non-finite, or `jitterFactor` is outside 0 to 1.
