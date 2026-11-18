---
'zaileys': patch
---

The message-retry counter and the per-user device list cache now survive reconnects instead of being rebuilt with every socket. A decrypt-retry loop no longer restarts from zero after each reconnect, and the first message to each contact after a reconnect skips a device-list query. Both caches are bounded (10,000 entries, using baileys' own 1-hour and 5-minute TTLs), where baileys' fallback cache had no size limit. Passing your own `msgRetryCounterCache` or `userDevicesCache` through the `baileys` option still overrides them.
