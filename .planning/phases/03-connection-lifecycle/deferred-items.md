# Deferred Items — Phase 3

## Out-of-scope discoveries (do not block Phase 3 plans)

### Pre-existing TS error in src/store/adapters/redis.ts:272
- **Discovered:** plan-002 execution (2026-05-29)
- **Description:** `redisClient.scan(cursor, { MATCH, COUNT })` signature mismatch under current `@redis/client` typings; expects `[cursor: number, options?]` or `[CommandOptions, cursor, options?]`.
- **Scope:** Phase 2 (auth/store adapters). Not introduced by Phase 3 work.
- **Action:** Defer — open follow-up for Phase 2 maintenance or upgrade `redis` types pin.
