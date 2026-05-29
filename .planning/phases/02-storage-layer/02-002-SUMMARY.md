---
phase: 02-storage-layer
plan: 002
slug: contract-test-suites
status: complete
requirements: [AUTH-01, AUTH-07, STORE-01]
artifacts:
  - tests/contracts/fixtures.ts
  - tests/contracts/auth-store.contract.ts
  - tests/contracts/message-store.contract.ts
  - tests/contracts/index.ts
metrics:
  auth_it_blocks: 30
  message_it_blocks: 30
  signal_keys_covered: 10
  concurrency_stress: 1000
completed: 2026-05-29
---

# Phase 2 Plan 002: Contract Test Suites Summary

Shared, adapter-agnostic vitest contract suites for `AuthStoreBundle` and `MessageStore`. Adapter plans (003–006) import these factories and instantiate them against each backend, inheriting ≥60 scenarios per adapter with zero per-adapter duplication.

## Deliverables

| File | Purpose |
|------|---------|
| `tests/contracts/fixtures.ts` | Deterministic generators: `sampleCreds` (via `initAuthCreds`), `sampleSignalEntries` (one per SignalDataTypeMap key, incl. identity-key Uint8Array + tctoken Buffer), `sampleMessages/Chat/Contact/Presence`, `assertSignalEquals` byte-aware deep equality |
| `tests/contracts/auth-store.contract.ts` | `runAuthStoreContract(name, factory, cleanup?)` — 30 `it` blocks across groups A–F |
| `tests/contracts/message-store.contract.ts` | `runMessageStoreContract(name, factory, cleanup?)` — 30 `it` blocks across groups A–F |
| `tests/contracts/index.ts` | Barrel re-exporting both factories + every fixture |

## AuthStore Contract — 30 scenarios

| Group | Count | Coverage |
|-------|-------|----------|
| A — Creds round-trip | 5 | empty read, write+read Buffer equality, last-write-wins, delete, idempotent delete |
| B — Signal round-trip per SignalDataTypeMap key | 10 | one `it` per key: `pre-key`, `session`, `sender-key`, `sender-key-memory`, `app-state-sync-key`, `app-state-sync-version`, `lid-mapping`, `device-list`, `tctoken`, `identity-key` |
| C — write semantics | 5 | null-deletes, multi-category single write, unknown-id reads, mixed reads, last-write-wins |
| D — delete + clear (AUTH-07) | 5 | id delete, no-op delete, clear wipes all categories, **clear wipes creds too**, store remains functional |
| E — concurrency stress | 3 | 1000 parallel session writes, 100 parallel writeCreds, 500 reads + 500 writes interleaved |
| F — close | 2 | post-close ops reject `ZaileysStoreError{code:'STORE_CLOSED'}`, idempotent close |

## MessageStore Contract — 30 scenarios

| Group | Count | Coverage |
|-------|-------|----------|
| A — Message CRUD | 6 | missing→undefined, save→get round-trip, last-write-wins, empty list, descending sort, limit+before pagination |
| B — Chat CRUD | 4 | missing→undefined, round-trip, listChats, `archived: true` filter |
| C — Contact CRUD | 3 | missing→undefined, full-field round-trip, listContacts |
| D — Presence | 3 | missing→undefined, round-trip, overwrite |
| E — bind(socket) | 4 | `messages.upsert`, `chats.upsert`, `contacts.upsert`, `presence.update` all persist via `EventEmitter` |
| F — concurrency + clear + close | 6 | 1000-parallel saveMessage, clear empties all, post-close STORE_CLOSED, idempotent close, mixed 300×3 parallel saves, listMessages returns immutable copies |

## Contract Tightenings (beyond CONTEXT.md)

- **Byte-equality after concurrency:** Group E1 (auth) verifies the post-stress read returns the exact written bytes for every id (not just count) — guards against silent buffer truncation in adapters using JSON intermediates.
- **`clear()` wipes creds too:** D4 promotes AUTH-07 from "signal categories are cleared" to "creds row is also reset to undefined", forcing adapters to share the clear pathway across the bundle.
- **Immutable list returns:** F6 (message) asserts mutating a returned `WAMessage[]` does not affect subsequent reads — pushes adapters to return defensive copies.
- **`STORE_CLOSED` on both halves of the bundle:** F1 (auth) checks the code on `signal.*` AND `creds.*` after a single `signal.close()` — encodes the assumption that the bundle shares a lifecycle.

## Verification

| Check | Result |
|-------|--------|
| `pnpm typecheck` | PASS (0 errors) |
| `pnpm audit:comments` | PASS (29 src files, 0 violations — tests excluded from scan scope) |
| `grep -c "it(" tests/contracts/auth-store.contract.ts` | 30 |
| `grep -c "it(" tests/contracts/message-store.contract.ts` | 30 |

## Commits

| Hash | Subject |
|------|---------|
| `aa3dbe6` | `test(contracts): add shared fixtures for auth + message store suites` |
| `3b1f28d` | `test(contracts): add runAuthStoreContract factory with 30 scenarios` |
| `5a3ab07` | `test(contracts): add runMessageStoreContract + barrel index` |

## Hand-off

Wave 2 plan-003 (file/memory defaults) and Wave 3 plans 004–006 (sqlite/redis/postgres) import:

```ts
import { runAuthStoreContract, runMessageStoreContract } from '../contracts/index.js'

runAuthStoreContract('FileAuthStore', async () => bundle)
runMessageStoreContract('MemoryMessageStore', async () => store)
```

Each adapter test file picks up 60 scenarios for free.

## Self-Check: PASSED

- tests/contracts/fixtures.ts present
- tests/contracts/auth-store.contract.ts present (30 `it`)
- tests/contracts/message-store.contract.ts present (30 `it`)
- tests/contracts/index.ts present
- All three task commits in `git log` on branch `v4`
