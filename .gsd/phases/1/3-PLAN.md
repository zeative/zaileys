---
phase: 1
plan: 3
wave: 1
---

# Plan 1.3: Storage Layer

## Objective
Implement the high-performance unified store and database abstraction for V4.

## Context
- .gsd/SPEC.md
- tech-docs-v4.txt (Section 10, 21.3)

## Tasks

<task type="auto">
  <name>Initialize Unified Store</name>
  <files>src/store/unified-store.ts</files>
  <action>
    Implement base `Store` class using `lru-cache` and `eventemitter3`.
    - WHAT: 3x faster event emission than built-in EventEmitter.
    - WHY: Store events are high-frequency; performance is critical.
    - EXPOSE: `contextStore`, `cacheStore`, `rateStore`.
  </action>
  <verify>npx vitest src/store/unified-store.ts</verify>
  <done>
    Stores are initialized and emitting events via `eventemitter3`.
  </done>
</task>

<task type="auto">
  <name>Database Abstraction</name>
  <files>src/store/database.ts</files>
  <action>
    Implement `Database` abstraction for `lmdb`.
    - Support scoped access (`wa.db('my-plugin')`).
    - Use `async-mutex` for write concurrency if needed (internal to db logic).
  </action>
  <verify>npx vitest src/store/database.ts</verify>
  <done>
    `lmdb` scoped access is functional and persistent.
  </done>
</task>

## Success Criteria
- [ ] `src/store/unified-store.ts` and `src/store/database.ts` implemented.
- [ ] LRU cache correctly handles TTL via `ms()` helper.
