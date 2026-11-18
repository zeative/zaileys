---
'zaileys': patch
---

Calling `client.disconnect()` while `connect()` is still reading stored credentials no longer leaves a logged-in socket behind. `connect()` now rejects with `disconnected before connect resolved` and opens nothing. Previously the socket kept running with closed stores, and the next `connect()` started a second socket on the same credentials, which triggers WhatsApp's `connection-replaced` loop.
