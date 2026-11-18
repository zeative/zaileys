---
'zaileys': minor
---

Add `ctx.session` and `client.session(jid)` for small persistent per-user state. Values are JSON (at most 64 KB each, optional `ttl` in milliseconds), scoped to the sender without the device suffix — a LID-only sender gets its own scope — and kept in the message store's own space: `session_values` (SQLite), `zaileys_sessions` (Postgres), `<namespace>:session:*` keys with native expiry (Redis), `session:*` rows (Convex), or a bounded map in `MemoryMessageStore` (`maxSessionValues`, `maxSessionBytes`). `MessageStore` gains optional `getSessionValue`, `setSessionValue`, `deleteSessionValue`, and `clearSession`; a custom store without them falls back to memory with one warning. New `ZaileysStoreError` codes `STORE_VALUE_TOO_LARGE` and `STORE_INVALID_INPUT`. `store.clear()` now also removes session values.
