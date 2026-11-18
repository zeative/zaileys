---
'zaileys': patch
---

When the connection closes without reconnecting (`logged-out`, `reconnect.enabled: false`, or `maxAttempts` reached), the client now stops the scheduler, presence timers, auto-delete sweeper and plugin watcher, so they no longer fire against a dead socket or keep the process alive. A later `client.disconnect()` still closes the auth and message stores, so database pools are released and the process can exit.
