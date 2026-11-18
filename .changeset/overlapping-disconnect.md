---
'zaileys': patch
---

`client.disconnect()` no longer throws `invalid state transition: disconnecting -> disconnecting` when it is called again before the first call finishes. Overlapping calls now share one teardown. This matters most when an `auth-exhausted` or QR-timeout listener calls `disconnect()` itself: the library also disconnects in that path, and the second call used to reject with nothing to catch it, which crashed the process.
