## Issue #34: sendPresenceUpdate undefined
Added: 2026-03-22

Issue #34: sendPresenceUpdate undefined Root cause: centerStore had a 10m TTL causing socket reference loss. Solution: Removed TTL for critical namespaces and added safety checks in Signal class.
