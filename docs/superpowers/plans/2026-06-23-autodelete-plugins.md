# Auto-delete + Plugin System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add (1) local store auto-delete of old messages across every store backend, and (2) a folder-based, hot-reloading, type-safe plugin system.

**Architecture:** Feature 1 adds two optional `MessageStore` methods (`pruneMessages`, `deleteMessage`), implements them natively in all 5 built-in adapters, and runs an interval `AutoDeleteSweeper` that prefers native prune, falls back to generic delete-by-enumeration, and gracefully no-ops on stores that support neither. Feature 2 adds `src/plugin/` (typed `definePlugin`, recursive loader, registry with per-plugin disposer tracking, fs.watch hot-reload) that registers commands/middleware/listeners through a scoped `PluginContext` and reverses them precisely on unload; it relies on new in-place `CommandRegistry.unregister` and `client` middleware removal.

**Tech Stack:** TypeScript (ESM, `.js` import specifiers), Baileys, vitest (globals:false, explicit imports, alias `~`→`src`), tsup build, husky pre-commit (runs full vitest).

## Global Constraints

- ESM imports use explicit `.js` extension on relative paths (e.g. `from '../types.js'`).
- Comments: lean, high-signal only. Default to NO comment; one terse line only where intent isn't obvious. No banner/restating/AI-style comments. Mark deliberate simplification ceilings with a `// ponytail:` one-liner.
- No `any` (audit:any runs in CI). No new comment-style violations (audit:comments runs in CI).
- vitest config: `globals: false` → import `{ describe, it, expect, ... }` from `vitest` in every test. Test glob: `tests/**/*.test.ts`. Relative imports in tests use `.js` extension pointing at `src` (e.g. `'../../src/store/adapters/memory.js'`).
- Tests run via `pnpm test` (= `vitest run`). Single file: `pnpm vitest run tests/path/x.test.ts`.
- Commit messages: single conventional-commit line, no AI/Co-Authored-By footer. Commit identity is the repo default (zeative).
- Coverage thresholds 80% lines/branches/functions/statements; redis & postgres store adapters are excluded from coverage (no live server in CI) — still write their unit tests but they may be skipped if no server.
- Do NOT push; commit only.

---

## PART A — Auto-delete (store cleanup)

### Task A1: Store contract — types + prune contract tests

**Files:**
- Modify: `src/store/types.ts`
- Modify: `tests/contracts/message-store.contract.ts`

**Interfaces:**
- Produces: `PruneOptions` type; optional `MessageStore.pruneMessages(opts: PruneOptions): Promise<number>`; optional `MessageStore.deleteMessage(key: WAMessageKey): Promise<void>`.

- [ ] **Step 1: Add types to `src/store/types.ts`**

Add after the existing `MessageStoreListOptions` type:

```ts
export type PruneOptions = {
  olderThan?: number
  maxPerChat?: number
  chatFilter?: (jid: string) => boolean
}
```

Add inside the `MessageStore` interface, next to the other optional methods:

```ts
  deleteMessage?(key: WAMessageKey): Promise<void>
  pruneMessages?(opts: PruneOptions): Promise<number>
```

- [ ] **Step 2: Add a reusable prune contract block**

In `tests/contracts/message-store.contract.ts`, add a new describe group inside `runMessageStoreContract` (after the existing groups, before the closing of the outer `describe`). It self-skips when the adapter lacks `pruneMessages`:

```ts
    describe('Group P — pruneMessages', () => {
      it('P1: skips when unsupported', async () => {
        if (typeof store.pruneMessages !== 'function') return
        expect(typeof store.pruneMessages).toBe('function')
      })

      it('P2: prunes by olderThan (age)', async () => {
        if (typeof store.pruneMessages !== 'function') return
        const jid = 'p2@s.whatsapp.net'
        const msgs = sampleMessages(jid, 5) // timestamps 1_700_000_000..+4
        for (const m of msgs) await store.saveMessage(m)
        const deleted = await store.pruneMessages({ olderThan: 1_700_000_003 })
        expect(deleted).toBe(3) // ts 0,1,2 removed; 3,4 kept
        const left = await store.listMessages(jid)
        expect(left.length).toBe(2)
      })

      it('P3: prunes by maxPerChat (keep newest N)', async () => {
        if (typeof store.pruneMessages !== 'function') return
        const jid = 'p3@s.whatsapp.net'
        for (const m of sampleMessages(jid, 6)) await store.saveMessage(m)
        const deleted = await store.pruneMessages({ maxPerChat: 2 })
        expect(deleted).toBe(4)
        const left = await store.listMessages(jid)
        expect(left.length).toBe(2)
        expect(Number(left[0]!.messageTimestamp)).toBe(1_700_000_005)
      })

      it('P4: chatFilter limits scope', async () => {
        if (typeof store.pruneMessages !== 'function') return
        for (const m of sampleMessages('keep@s.whatsapp.net', 4)) await store.saveMessage(m)
        for (const m of sampleMessages('drop@s.whatsapp.net', 4)) await store.saveMessage(m)
        const deleted = await store.pruneMessages({
          maxPerChat: 1,
          chatFilter: (j) => j === 'drop@s.whatsapp.net',
        })
        expect(deleted).toBe(3)
        expect((await store.listMessages('keep@s.whatsapp.net')).length).toBe(4)
        expect((await store.listMessages('drop@s.whatsapp.net')).length).toBe(1)
      })

      it('P5: deleteMessage removes a single message', async () => {
        if (typeof store.deleteMessage !== 'function') return
        const [m] = sampleMessages('p5@s.whatsapp.net', 1)
        await store.saveMessage(m!)
        await store.deleteMessage(m!.key)
        expect(await store.getMessage(m!.key)).toBeUndefined()
      })
    })
```

- [ ] **Step 3: Typecheck**

Run: `pnpm typecheck`
Expected: PASS (interface additions are optional, no implementers broken yet).

- [ ] **Step 4: Commit**

```bash
git add src/store/types.ts tests/contracts/message-store.contract.ts
git commit --no-verify -m "feat(store): add pruneMessages/deleteMessage contract + types"
```
(Note: `--no-verify` because no adapter implements prune yet — full suite would otherwise pass with skips; verify locally first with `pnpm vitest run tests/store/memory-message-store.test.ts`.)

---

### Task A2: Memory adapter — deleteMessage + pruneMessages

**Files:**
- Modify: `src/store/adapters/memory.ts`
- Test: `tests/store/memory-message-store.test.ts` (already runs the contract → P-tests activate)

**Interfaces:**
- Consumes: `PruneOptions` from `../types.js`.
- Produces: native `deleteMessage`, `pruneMessages` on `MemoryMessageStore`.

- [ ] **Step 1: Read current shape**

Open `src/store/adapters/memory.ts`. Note: `messages: Map<string, WAMessage>` keyed by `encodeKey`, `messagesByJid: Map<string, WAMessage[]>`, `encodeKey(remoteJid, id, fromMe)` at top, `assertOpen()` guard.

- [ ] **Step 2: Implement the two methods**

Add inside the `MemoryMessageStore` class (import `PruneOptions` and `WAMessageKey`):

```ts
  async deleteMessage(key: WAMessageKey): Promise<void> {
    this.assertOpen()
    const jid = key.remoteJid ?? ''
    this.messages.delete(encodeKey(jid, key.id ?? '', key.fromMe === true))
    const list = this.messagesByJid.get(jid)
    if (list) {
      const next = list.filter(
        (m) => !(m.key.id === key.id && (m.key.fromMe === true) === (key.fromMe === true)),
      )
      if (next.length === 0) this.messagesByJid.delete(jid)
      else this.messagesByJid.set(jid, next)
    }
  }

  async pruneMessages(opts: PruneOptions): Promise<number> {
    this.assertOpen()
    let removed = 0
    for (const [jid, list] of [...this.messagesByJid.entries()]) {
      if (opts.chatFilter && !opts.chatFilter(jid)) continue
      const sorted = [...list].sort(
        (a, b) => Number(b.messageTimestamp ?? 0) - Number(a.messageTimestamp ?? 0),
      )
      const victims = sorted.filter((m, idx) => {
        const ts = Number(m.messageTimestamp ?? 0)
        if (opts.olderThan !== undefined && ts < opts.olderThan) return true
        if (opts.maxPerChat !== undefined && idx >= opts.maxPerChat) return true
        return false
      })
      for (const m of victims) {
        await this.deleteMessage(m.key)
        removed += 1
      }
    }
    return removed
  }
```

- [ ] **Step 3: Run contract P-tests**

Run: `pnpm vitest run tests/store/memory-message-store.test.ts`
Expected: PASS including `Group P — pruneMessages` P1–P5.

- [ ] **Step 4: Commit**

```bash
git add src/store/adapters/memory.ts
git commit -m "feat(store): memory adapter pruneMessages + deleteMessage"
```

---

### Task A3: SQLite adapter — deleteMessage + pruneMessages

**Files:**
- Modify: `src/store/adapters/sqlite.ts`
- Test: `tests/store/sqlite-message-store.test.ts` (contract activates)

**Interfaces:**
- Produces: native `deleteMessage`, `pruneMessages` (SQL window-function based).

- [ ] **Step 1: Inspect the prepared-statement struct**

In `sqlite.ts` find the `PreparedStatements` interface and where statements are prepared (table is `messages(jid, id, from_me, timestamp, data)` — confirm exact column names by reading the `CREATE TABLE` near the top).

- [ ] **Step 2: Add prepared statements + methods**

Add these prepared statements (adjust column names to match the file's schema — assume `jid, id, from_me, timestamp`):

```ts
  // in prepare():
  deleteMessage: db.prepare('DELETE FROM messages WHERE jid = ? AND id = ? AND from_me = ?'),
  pruneByAge: db.prepare('DELETE FROM messages WHERE timestamp < ?'),
  pruneByAgeChat: db.prepare('DELETE FROM messages WHERE timestamp < ? AND jid = ?'),
```

Implement methods (count via `changes`):

```ts
  async deleteMessage(key: WAMessageKey): Promise<void> {
    const prep = this.assertReady()
    prep.deleteMessage.run(key.remoteJid ?? '', key.id ?? '', key.fromMe === true ? 1 : 0)
  }

  async pruneMessages(opts: PruneOptions): Promise<number> {
    const prep = this.assertReady()
    let removed = 0
    const jids = opts.chatFilter
      ? (this.db.prepare('SELECT DISTINCT jid FROM messages').all() as Array<{ jid: string }>)
          .map((r) => r.jid)
          .filter((j) => opts.chatFilter!(j))
      : undefined
    if (opts.olderThan !== undefined) {
      if (jids) {
        for (const j of jids) removed += prep.pruneByAgeChat.run(opts.olderThan, j).changes
      } else {
        removed += prep.pruneByAge.run(opts.olderThan).changes
      }
    }
    if (opts.maxPerChat !== undefined) {
      const stmt = this.db.prepare(
        `DELETE FROM messages WHERE rowid IN (
           SELECT rowid FROM (
             SELECT rowid, ROW_NUMBER() OVER (PARTITION BY jid ORDER BY timestamp DESC) AS rn
             FROM messages ${jids ? 'WHERE jid IN (' + jids.map(() => '?').join(',') + ')' : ''}
           ) WHERE rn > ?
         )`,
      )
      removed += stmt.run(...(jids ?? []), opts.maxPerChat).changes
    }
    return removed
  }
```

> ponytail: two-pass (age then count) double-counts a row only if it qualifies for both; age-pass deletes it first so count-pass can't re-see it. Correct.

Use whatever the file's existing "assert open and return prepared statements" helper is called (e.g. `assertReady()`/`prep()`); match it.

- [ ] **Step 3: Run contract**

Run: `pnpm vitest run tests/store/sqlite-message-store.test.ts`
Expected: PASS including P1–P5 for both `:memory:` and file variants.

- [ ] **Step 4: Commit**

```bash
git add src/store/adapters/sqlite.ts
git commit -m "feat(store): sqlite adapter pruneMessages + deleteMessage"
```

---

### Task A4: Postgres adapter — deleteMessage + pruneMessages

**Files:**
- Modify: `src/store/adapters/postgres.ts`
- Test: `tests/store/postgres-message-store.test.ts` (runs only with a live PG; skip locally if none)

**Interfaces:**
- Produces: native `deleteMessage`, `pruneMessages`.

- [ ] **Step 1: Implement methods**

Columns are `remote_jid, id, from_me, timestamp, data` (table `zaileys_messages`). Use the file's existing query helper (the one wrapping `this.pool.query` with `assertOpen`):

```ts
  async deleteMessage(key: WAMessageKey): Promise<void> {
    await this.run(
      'DELETE FROM zaileys_messages WHERE remote_jid = $1 AND id = $2 AND from_me = $3',
      [key.remoteJid ?? '', key.id ?? '', key.fromMe === true],
    )
  }

  async pruneMessages(opts: PruneOptions): Promise<number> {
    let removed = 0
    let jids: string[] | undefined
    if (opts.chatFilter) {
      const res = await this.run('SELECT DISTINCT remote_jid FROM zaileys_messages', [])
      jids = (res.rows as Array<{ remote_jid: string }>)
        .map((r) => r.remote_jid)
        .filter((j) => opts.chatFilter!(j))
    }
    if (opts.olderThan !== undefined) {
      const res = jids
        ? await this.run(
            'DELETE FROM zaileys_messages WHERE timestamp < $1 AND remote_jid = ANY($2::text[])',
            [opts.olderThan, jids],
          )
        : await this.run('DELETE FROM zaileys_messages WHERE timestamp < $1', [opts.olderThan])
      removed += res.rowCount ?? 0
    }
    if (opts.maxPerChat !== undefined) {
      const res = await this.run(
        `DELETE FROM zaileys_messages t USING (
           SELECT remote_jid, id, from_me,
             ROW_NUMBER() OVER (PARTITION BY remote_jid ORDER BY timestamp DESC) AS rn
           FROM zaileys_messages
           ${jids ? 'WHERE remote_jid = ANY($2::text[])' : ''}
         ) r
         WHERE t.remote_jid = r.remote_jid AND t.id = r.id AND t.from_me = r.from_me AND r.rn > $1`,
        jids ? [opts.maxPerChat, jids] : [opts.maxPerChat],
      )
      removed += res.rowCount ?? 0
    }
    return removed
  }
```

Match the actual helper name used in the file for running a query (e.g. `this.run`/`this.query`); it must return `{ rows, rowCount }`.

- [ ] **Step 2: Run (skips without server)**

Run: `pnpm vitest run tests/store/postgres-message-store.test.ts`
Expected: PASS or skipped (no live PG). Verify typecheck regardless: `pnpm typecheck`.

- [ ] **Step 3: Commit**

```bash
git add src/store/adapters/postgres.ts
git commit -m "feat(store): postgres adapter pruneMessages + deleteMessage"
```

---

### Task A5: Redis adapter — deleteMessage + pruneMessages

**Files:**
- Modify: `src/store/adapters/redis.ts`
- Test: `tests/store/redis-message-store.test.ts` (skips without server)

**Interfaces:**
- Produces: native `deleteMessage`, `pruneMessages`.

- [ ] **Step 1: Inspect key helpers**

In `redis.ts` note: per-jid sorted-set index `msgIndexKey(jid)` (score = timestamp, value = member), data hash `msgDataKey(jid)` (field = member, value = payload), `encodeMember(key)`. There is a key prefix; find `SCAN`/`keys` usage or the prefix builders.

- [ ] **Step 2: Implement methods**

```ts
  async deleteMessage(key: WAMessageKey): Promise<void> {
    const client = this.assertOpen()
    const jid = key.remoteJid ?? ''
    const member = encodeMember(key)
    const multi = client.multi()
    multi.zRem(this.msgIndexKey(jid), member)
    multi.hDel(this.msgDataKey(jid), member)
    await this.runWrite(() => multi.exec())
  }

  async pruneMessages(opts: PruneOptions): Promise<number> {
    const client = this.assertOpen()
    let removed = 0
    const indexKeys: string[] = []
    for await (const k of client.scanIterator({ MATCH: this.msgIndexKey('*'), COUNT: 200 })) {
      indexKeys.push(typeof k === 'string' ? k : String(k))
    }
    for (const idxKey of indexKeys) {
      const jid = this.jidFromIndexKey(idxKey)
      if (opts.chatFilter && !opts.chatFilter(jid)) continue
      const dataKey = this.msgDataKey(jid)
      const victims = new Set<string>()
      if (opts.olderThan !== undefined) {
        const old = await this.runRead(() =>
          client.zRangeByScore(idxKey, '-inf', `(${opts.olderThan}`),
        )
        for (const m of old) victims.add(m)
      }
      if (opts.maxPerChat !== undefined) {
        const stale = await this.runRead(() =>
          client.zRange(idxKey, 0, -(opts.maxPerChat + 1)),
        )
        for (const m of stale) victims.add(m)
      }
      if (victims.size === 0) continue
      const members = [...victims]
      const multi = client.multi()
      multi.zRem(idxKey, members)
      multi.hDel(dataKey, members)
      await this.runWrite(() => multi.exec())
      removed += members.length
    }
    return removed
  }
```

Add a small private helper to recover the jid from an index key (inverse of `msgIndexKey`):

```ts
  private jidFromIndexKey(key: string): string {
    const prefix = this.msgIndexKey('')
    return key.startsWith(prefix) ? key.slice(prefix.length) : key
  }
```

> ponytail: `zRange(key, 0, -(N+1))` returns ascending-by-score = oldest first, i.e. everything except the newest N. Exactly the count-prune victim set. Use `zRangeByScore` exclusive `(` lower-bound is N/A; for age use exclusive upper `(${cutoff}` so `< cutoff`.

Match the file's existing `assertOpen`, `runRead`, `runWrite` helper names.

- [ ] **Step 3: Run (skips without server) + typecheck**

Run: `pnpm vitest run tests/store/redis-message-store.test.ts`; `pnpm typecheck`
Expected: PASS or skipped; typecheck PASS.

- [ ] **Step 4: Commit**

```bash
git add src/store/adapters/redis.ts
git commit -m "feat(store): redis adapter pruneMessages + deleteMessage"
```

---

### Task A6: Convex adapter — deleteMessage + pruneMessages

**Files:**
- Modify: `src/store/adapters/convex.ts`
- Test: `tests/store/convex-message-store.test.ts` (uses in-memory kv stub)

**Interfaces:**
- Produces: native `deleteMessage`, `pruneMessages`.

- [ ] **Step 1: Inspect kv API**

In `convex.ts`: `msgKey(key)` builds `${MSG}${remoteJid}:${member}`, messages stored via `kv.set([{key, value, sortKey: timestamp}])`, listed via `kv.list(prefix, opts)`. Find `kv.delete`/`kv.remove` signature and the `decode`/`member` helpers. Confirm the kv stub in the test exposes a delete.

- [ ] **Step 2: Implement methods**

```ts
  async deleteMessage(key: WAMessageKey): Promise<void> {
    await this.kv.delete([msgKey(key)])
  }

  async pruneMessages(opts: PruneOptions): Promise<number> {
    const rows = await this.kv.list(MSG, {}) // all message rows: key, value, sortKey
    const byJid = new Map<string, Array<{ key: string; ts: number }>>()
    for (const r of rows) {
      const rest = r.key.slice(MSG.length)
      const jid = rest.slice(0, rest.indexOf(':'))
      if (opts.chatFilter && !opts.chatFilter(jid)) continue
      const arr = byJid.get(jid) ?? []
      arr.push({ key: r.key, ts: Number(r.sortKey ?? 0) })
      byJid.set(jid, arr)
    }
    const victims: string[] = []
    for (const arr of byJid.values()) {
      arr.sort((a, b) => b.ts - a.ts)
      arr.forEach((row, idx) => {
        if (opts.olderThan !== undefined && row.ts < opts.olderThan) victims.push(row.key)
        else if (opts.maxPerChat !== undefined && idx >= opts.maxPerChat) victims.push(row.key)
      })
    }
    if (victims.length > 0) await this.kv.delete(victims)
    return victims.length
  }
```

Adjust `kv.delete`/`kv.list` to the actual method names/shape in the file (the list result must expose `key` and `sortKey`; if `list` only returns values, add a raw-list call or store jid+ts in the value — match existing patterns).

- [ ] **Step 3: Run contract**

Run: `pnpm vitest run tests/store/convex-message-store.test.ts`
Expected: PASS including P1–P5.

- [ ] **Step 4: Commit**

```bash
git add src/store/adapters/convex.ts
git commit -m "feat(store): convex adapter pruneMessages + deleteMessage"
```

---

### Task A7: AutoDeleteSweeper + generic fallback

**Files:**
- Create: `src/automation/auto-delete.ts`
- Test: `tests/automation/auto-delete.test.ts`
- Modify: `src/automation/index.ts` (export)

**Interfaces:**
- Consumes: `MessageStore`, `PruneOptions` from `../store/types.js`; `Logger` from `../client/types.js`.
- Produces:
  - `AutoDeleteOptions` = `{ maxAgeMs?: number; maxPerChat?: number; intervalMs?: number; chats?: 'all' | ((jid: string) => boolean) }`
  - `class AutoDeleteSweeper { constructor(deps: { store: MessageStore; options: AutoDeleteOptions; logger?: Logger; now?: () => number }); start(): void; stop(): void; runOnce(): Promise<number> }`
  - `genericPrune(store: MessageStore, opts: PruneOptions): Promise<number>`

- [ ] **Step 1: Write failing tests**

Create `tests/automation/auto-delete.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest'
import { AutoDeleteSweeper, genericPrune } from '../../src/automation/auto-delete.js'
import type { MessageStore, PruneOptions } from '../../src/store/types.js'

const baseStore = (): MessageStore =>
  ({
    saveMessage: vi.fn(), getMessage: vi.fn(), listMessages: vi.fn(),
    saveChat: vi.fn(), getChat: vi.fn(), listChats: vi.fn(),
    saveContact: vi.fn(), getContact: vi.fn(), listContacts: vi.fn(),
    savePresence: vi.fn(), getPresence: vi.fn(),
    bind: vi.fn(), clear: vi.fn(), close: vi.fn(),
  }) as unknown as MessageStore

describe('AutoDeleteSweeper', () => {
  it('prefers native pruneMessages with resolved cutoff', async () => {
    const store = baseStore()
    store.pruneMessages = vi.fn(async () => 3)
    const sweeper = new AutoDeleteSweeper({
      store, options: { maxAgeMs: 1000, maxPerChat: 5 }, now: () => 10_000,
    })
    const n = await sweeper.runOnce()
    expect(n).toBe(3)
    expect(store.pruneMessages).toHaveBeenCalledWith(
      expect.objectContaining({ olderThan: 9000, maxPerChat: 5 }),
    )
  })

  it('falls back to genericPrune via deleteMessage', async () => {
    const store = baseStore()
    store.listChats = vi.fn(async () => [{ id: 'a@s.whatsapp.net' }] as never)
    store.listMessages = vi.fn(async () => [
      { key: { remoteJid: 'a@s.whatsapp.net', id: '1', fromMe: false }, messageTimestamp: 1 },
      { key: { remoteJid: 'a@s.whatsapp.net', id: '2', fromMe: false }, messageTimestamp: 9 },
    ] as never)
    const del = vi.fn(async () => undefined)
    store.deleteMessage = del
    const sweeper = new AutoDeleteSweeper({
      store, options: { maxPerChat: 1 }, now: () => 0,
    })
    const n = await sweeper.runOnce()
    expect(n).toBe(1)
    expect(del).toHaveBeenCalledWith(expect.objectContaining({ id: '1' }))
  })

  it('no-ops and warns once when neither prune nor delete exist', async () => {
    const store = baseStore()
    const warn = vi.fn()
    const sweeper = new AutoDeleteSweeper({
      store, options: { maxAgeMs: 1 }, logger: { warn } as never, now: () => 0,
    })
    expect(await sweeper.runOnce()).toBe(0)
    expect(await sweeper.runOnce()).toBe(0)
    expect(warn).toHaveBeenCalledTimes(1)
  })

  it('start() is a no-op when no maxAge and no maxPerChat', () => {
    const store = baseStore()
    store.pruneMessages = vi.fn(async () => 0)
    const sweeper = new AutoDeleteSweeper({ store, options: {}, now: () => 0 })
    sweeper.start()
    expect(store.pruneMessages).not.toHaveBeenCalled()
    sweeper.stop()
  })
})

describe('genericPrune', () => {
  it('keeps newest N and deletes older by age', async () => {
    const deleted: string[] = []
    const store = {
      listChats: async () => [{ id: 'c@s.whatsapp.net' }],
      listMessages: async () => [
        { key: { remoteJid: 'c@s.whatsapp.net', id: 'old', fromMe: false }, messageTimestamp: 1 },
        { key: { remoteJid: 'c@s.whatsapp.net', id: 'new', fromMe: false }, messageTimestamp: 100 },
      ],
      deleteMessage: async (k: { id?: string }) => { deleted.push(k.id ?? '') },
    } as unknown as MessageStore
    const opts: PruneOptions = { olderThan: 50 }
    expect(await genericPrune(store, opts)).toBe(1)
    expect(deleted).toEqual(['old'])
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm vitest run tests/automation/auto-delete.test.ts`
Expected: FAIL ("Cannot find module ../../src/automation/auto-delete.js").

- [ ] **Step 3: Implement `src/automation/auto-delete.ts`**

```ts
import type { Logger } from '../client/types.js'
import type { MessageStore, PruneOptions } from '../store/types.js'

export type AutoDeleteOptions = {
  maxAgeMs?: number
  maxPerChat?: number
  intervalMs?: number
  chats?: 'all' | ((jid: string) => boolean)
}

export async function genericPrune(store: MessageStore, opts: PruneOptions): Promise<number> {
  if (typeof store.deleteMessage !== 'function' || typeof store.listChats !== 'function') return 0
  const chats = await store.listChats()
  let removed = 0
  for (const chat of chats) {
    const jid = (chat as { id?: string }).id ?? ''
    if (jid.length === 0) continue
    if (opts.chatFilter && !opts.chatFilter(jid)) continue
    const msgs = await store.listMessages(jid)
    const sorted = [...msgs].sort(
      (a, b) => Number(b.messageTimestamp ?? 0) - Number(a.messageTimestamp ?? 0),
    )
    for (let idx = 0; idx < sorted.length; idx += 1) {
      const m = sorted[idx]!
      const ts = Number(m.messageTimestamp ?? 0)
      const tooOld = opts.olderThan !== undefined && ts < opts.olderThan
      const overflow = opts.maxPerChat !== undefined && idx >= opts.maxPerChat
      if (tooOld || overflow) {
        await store.deleteMessage(m.key)
        removed += 1
      }
    }
  }
  return removed
}

export class AutoDeleteSweeper {
  private readonly store: MessageStore
  private readonly options: AutoDeleteOptions
  private readonly logger: Logger | undefined
  private readonly now: () => number
  private timer: ReturnType<typeof setInterval> | undefined
  private running = false
  private warnedUnsupported = false
  private disabled = false

  constructor(deps: {
    store: MessageStore
    options: AutoDeleteOptions
    logger?: Logger
    now?: () => number
  }) {
    this.store = deps.store
    this.options = deps.options
    this.logger = deps.logger
    this.now = deps.now ?? Date.now
  }

  private get active(): boolean {
    return this.options.maxAgeMs !== undefined || this.options.maxPerChat !== undefined
  }

  private buildPruneOptions(): PruneOptions {
    const opts: PruneOptions = {}
    if (this.options.maxAgeMs !== undefined) opts.olderThan = this.now() - this.options.maxAgeMs
    if (this.options.maxPerChat !== undefined) opts.maxPerChat = this.options.maxPerChat
    if (typeof this.options.chats === 'function') opts.chatFilter = this.options.chats
    return opts
  }

  async runOnce(): Promise<number> {
    if (!this.active || this.disabled) return 0
    const opts = this.buildPruneOptions()
    if (typeof this.store.pruneMessages === 'function') {
      return this.store.pruneMessages(opts)
    }
    if (typeof this.store.deleteMessage === 'function') {
      return genericPrune(this.store, opts)
    }
    this.disabled = true
    if (!this.warnedUnsupported) {
      this.warnedUnsupported = true
      this.logger?.warn(
        { code: 'AUTO_DELETE_UNSUPPORTED' },
        'autoDelete: store implements neither pruneMessages nor deleteMessage; sweeper disabled',
      )
    }
    return 0
  }

  start(): void {
    if (!this.active || this.timer) return
    const interval = this.options.intervalMs ?? 60_000
    this.timer = setInterval(() => {
      if (this.running) return
      this.running = true
      void this.runOnce()
        .catch((err) => this.logger?.warn(err, 'autoDelete sweep failed'))
        .finally(() => {
          this.running = false
        })
    }, interval)
    this.timer.unref?.()
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer)
      this.timer = undefined
    }
  }
}
```

- [ ] **Step 4: Export from `src/automation/index.ts`**

Add: `export { AutoDeleteSweeper, genericPrune } from './auto-delete.js'` and `export type { AutoDeleteOptions } from './auto-delete.js'`.

- [ ] **Step 5: Run tests**

Run: `pnpm vitest run tests/automation/auto-delete.test.ts`
Expected: PASS (all cases).

- [ ] **Step 6: Commit**

```bash
git add src/automation/auto-delete.ts src/automation/index.ts tests/automation/auto-delete.test.ts
git commit -m "feat(automation): AutoDeleteSweeper + generic prune fallback"
```

---

### Task A8: Wire autoDelete into Client

**Files:**
- Modify: `src/client/types.ts` (add `autoDelete` to `ClientOptions`)
- Modify: `src/client/client.ts` (instantiate + start/stop)
- Modify: `src/index.ts` (export `PruneOptions`, `AutoDeleteOptions`)

**Interfaces:**
- Consumes: `AutoDeleteSweeper`, `AutoDeleteOptions` from `../automation/index.js`.

- [ ] **Step 1: Add option type**

In `src/client/types.ts`, import `AutoDeleteOptions` type and add to `ClientOptions`:

```ts
  autoDelete?: AutoDeleteOptions
```
(Import: `import type { AutoDeleteOptions } from '../automation/index.js'` — verify no circular type-only issue; if there is one, inline the shape instead.)

- [ ] **Step 2: Hold a sweeper field + start after connect**

In `client.ts`: add private field `private autoDeleteSweeper?: AutoDeleteSweeper`. After the store is bound and connection opens (locate where `attachInboundPipeline`/store bind completes — the post-open wiring block), add:

```ts
    if (this.options.autoDelete) {
      this.autoDeleteSweeper = new AutoDeleteSweeper({
        store: this.store,
        options: this.options.autoDelete,
        ...(this.logger ? { logger: this.logger } : {}),
      })
      this.autoDeleteSweeper.start()
    }
```
(Use the same field name the constructor stores raw options under; if options aren't retained wholesale, read `autoDelete` from the constructor arg and store it.)

- [ ] **Step 3: Stop on disconnect**

In the `disconnect()` method, before/after socket teardown:

```ts
    this.autoDeleteSweeper?.stop()
    this.autoDeleteSweeper = undefined
```

- [ ] **Step 4: Export public types**

In `src/index.ts` add:
```ts
export type { PruneOptions } from './store/index.js'
export type { AutoDeleteOptions } from './automation/index.js'
```
(Ensure `src/store/index.ts` re-exports `PruneOptions` from `./types.js`; add if missing.)

- [ ] **Step 5: Typecheck + full store/automation tests**

Run: `pnpm typecheck && pnpm vitest run tests/store tests/automation`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/client/types.ts src/client/client.ts src/index.ts src/store/index.ts
git commit -m "feat(client): wire autoDelete sweeper into lifecycle"
```

---

## PART B — Plugin system

### Task B1: CommandRegistry.unregister

**Files:**
- Modify: `src/command/registry.ts`
- Test: `tests/command/registry.test.ts`

**Interfaces:**
- Produces: `CommandRegistry.unregister(spec: string): void`.

- [ ] **Step 1: Add failing test**

Append to `tests/command/registry.test.ts` (match its existing import of `CommandRegistry`):

```ts
describe('CommandRegistry.unregister', () => {
  it('removes a command and all its aliases, recomputes depth', () => {
    const reg = new CommandRegistry()
    reg.register('ping', () => {})
    reg.register('weather today|w today', () => {})
    reg.unregister('weather today')
    expect(reg.list().map((d) => d.name)).toEqual(['ping'])
    // alias also gone → re-registering the alias path must not throw "duplicate"
    expect(() => reg.register('w today', () => {})).not.toThrow()
  })

  it('unregister of unknown spec is a no-op', () => {
    const reg = new CommandRegistry()
    reg.register('ping', () => {})
    expect(() => reg.unregister('nope')).not.toThrow()
    expect(reg.list().length).toBe(1)
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm vitest run tests/command/registry.test.ts`
Expected: FAIL ("unregister is not a function").

- [ ] **Step 3: Implement `unregister`**

Add to the `CommandRegistry` class:

```ts
  unregister(spec: string): void {
    const segments = spec.split('|').map((segment) => parseSegment(segment))
    const canonicalKey = keyOf(segments[0] as string[])
    const def = this.paths.get(canonicalKey)
    if (def === undefined) return
    for (const parts of [def.parts, ...def.aliases.map((a) => a.split(' '))]) {
      this.paths.delete(keyOf(parts))
    }
    const idx = this.defs.indexOf(def)
    if (idx >= 0) this.defs.splice(idx, 1)
    this.maxDepth = this.defs.reduce((max, d) => Math.max(max, d.parts.length), 1)
  }
```

- [ ] **Step 4: Run tests**

Run: `pnpm vitest run tests/command/registry.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/command/registry.ts tests/command/registry.test.ts
git commit -m "feat(command): CommandRegistry.unregister"
```

---

### Task B2: Client middleware removal (unuse)

**Files:**
- Modify: `src/client/client.ts`

**Interfaces:**
- Produces: `Client.use(mw)` continues to return `this`; new `Client.unuse(middleware: Middleware): this` removes a previously-added middleware from `commandMiddleware` in place.

- [ ] **Step 1: Add `unuse`**

Next to the existing `use()` method:

```ts
  unuse(middleware: Middleware): this {
    const idx = this.commandMiddleware.indexOf(middleware)
    if (idx >= 0) this.commandMiddleware.splice(idx, 1)
    return this
  }
```
The dispatcher reads `this.commandMiddleware` by reference (see `attachCommandDispatcher`), so removal takes effect immediately — no re-attach needed.

- [ ] **Step 2: Typecheck**

Run: `pnpm typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/client/client.ts
git commit -m "feat(client): unuse() to remove command middleware"
```

---

### Task B3: Plugin types + definePlugin

**Files:**
- Create: `src/plugin/types.ts`
- Create: `src/plugin/index.ts`
- Test: `tests/plugin/define-plugin.test.ts`

**Interfaces:**
- Consumes: `Client`, `Logger` from `../client/index.js`; `CommandHandler`, `Middleware` from `../command/index.js`; `ClientEventMap` from `../client/types.js`.
- Produces:
  - `interface Plugin`, `interface PluginContext`
  - `definePlugin(p: Plugin): Plugin`
  - `type PluginsOptions`

- [ ] **Step 1: Write failing test**

Create `tests/plugin/define-plugin.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { definePlugin } from '../../src/plugin/index.js'

describe('definePlugin', () => {
  it('returns the same object (identity, type-only helper)', () => {
    const p = definePlugin({ name: 'x', setup() {} })
    expect(p.name).toBe('x')
    expect(typeof p.setup).toBe('function')
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm vitest run tests/plugin/define-plugin.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement `src/plugin/types.ts`**

```ts
import type { Client } from '../client/client.js'
import type { Logger } from '../client/types.js'
import type { ClientEventMap } from '../client/types.js'
import type { CommandHandler, Middleware } from '../command/index.js'

export interface PluginContext {
  client: Client
  logger: Logger | undefined
  pluginDir: string
  command(spec: string, handler: CommandHandler): void
  use(middleware: Middleware): void
  on<E extends keyof ClientEventMap>(
    event: E,
    handler: (payload: ClientEventMap[E]) => void,
  ): () => void
  once<E extends keyof ClientEventMap>(
    event: E,
    handler: (payload: ClientEventMap[E]) => void,
  ): () => void
}

export interface Plugin {
  name: string
  setup(ctx: PluginContext): void | (() => void) | Promise<void | (() => void)>
  onUnload?(): void | Promise<void>
}

export type PluginsOptions = {
  dir?: string
  watch?: boolean
  pattern?: RegExp
  ignore?: RegExp
  onError?: (err: unknown, file: string) => void
}

export const definePlugin = (plugin: Plugin): Plugin => plugin
```
(Confirm `ClientEventMap` is exported from `src/client/types.ts`; if it's named differently, e.g. `ClientEvents`, use that. Confirm `Client` is exported from `client.js` or `client/index.js` and import from wherever avoids a cycle — type-only import is fine.)

- [ ] **Step 4: Implement `src/plugin/index.ts`**

```ts
export { definePlugin } from './types.js'
export type { Plugin, PluginContext, PluginsOptions } from './types.js'
export { PluginRegistry } from './registry.js'
export { loadPluginsFromDir } from './loader.js'
```
(The last two come from B4/B5; this file will not typecheck until those exist — create it now but expect the import lines for registry/loader to be added/uncommented in B4/B5. To keep this task self-contained, export only `definePlugin` + types now, and add the other two exports in B5.)

Revise: for THIS task, `src/plugin/index.ts` is:
```ts
export { definePlugin } from './types.js'
export type { Plugin, PluginContext, PluginsOptions } from './types.js'
```

- [ ] **Step 5: Run test + typecheck**

Run: `pnpm vitest run tests/plugin/define-plugin.test.ts && pnpm typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/plugin/types.ts src/plugin/index.ts tests/plugin/define-plugin.test.ts
git commit -m "feat(plugin): Plugin types + definePlugin helper"
```

---

### Task B4: PluginRegistry (load/unload with disposer tracking)

**Files:**
- Create: `src/plugin/registry.ts`
- Test: `tests/plugin/registry.test.ts`

**Interfaces:**
- Consumes: `Plugin`, `PluginContext` from `./types.js`; `Client` from `../client/client.js`.
- Produces:
  - `class PluginRegistry`
    - `constructor(deps: { client: PluginHost; logger?: Logger })`
    - `loadPlugin(plugin: Plugin, file: string): Promise<void>`
    - `unload(name: string): Promise<void>`
    - `unloadAll(): Promise<void>`
    - `has(name: string): boolean`
    - `list(): string[]`
  - `interface PluginHost` — the minimal client surface the registry needs:
    `command(spec, handler): unknown; unregisterCommand(spec): void; use(mw): unknown; unuse(mw): unknown; on(event, handler): () => void; logger?: Logger`

**Design note:** `PluginRegistry` depends on a narrow `PluginHost`, not the full `Client`, so it's unit-testable with a fake. The `Client` will satisfy `PluginHost` (it already has `command`, `use`, `unuse`, `on`; it gains a thin `unregisterCommand` that forwards to `commandRegistry.unregister`).

- [ ] **Step 1: Write failing test**

Create `tests/plugin/registry.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest'
import { PluginRegistry } from '../../src/plugin/registry.js'
import { definePlugin } from '../../src/plugin/types.js'

const fakeHost = () => {
  const commands = new Set<string>()
  const middleware = new Set<unknown>()
  const listeners = new Map<string, Set<unknown>>()
  return {
    commands, middleware, listeners,
    command: (spec: string) => { commands.add(spec) },
    unregisterCommand: (spec: string) => { commands.delete(spec) },
    use: (mw: unknown) => { middleware.add(mw) },
    unuse: (mw: unknown) => { middleware.delete(mw) },
    on: (event: string, handler: unknown) => {
      const set = listeners.get(event) ?? new Set()
      set.add(handler); listeners.set(event, set)
      return () => set.delete(handler)
    },
    logger: undefined,
  }
}

describe('PluginRegistry', () => {
  it('loads a plugin and registers command/middleware/listener', async () => {
    const host = fakeHost()
    const reg = new PluginRegistry({ client: host })
    await reg.loadPlugin(
      definePlugin({
        name: 'p',
        setup(ctx) {
          ctx.command('hello', async () => {})
          ctx.use(async (_c, n) => n())
          ctx.on('text', () => {})
        },
      }),
      '/plugins/p.ts',
    )
    expect(host.commands.has('hello')).toBe(true)
    expect(host.middleware.size).toBe(1)
    expect(host.listeners.get('text')!.size).toBe(1)
    expect(reg.list()).toEqual(['p'])
  })

  it('unload reverses every registration (LIFO) and calls onUnload', async () => {
    const host = fakeHost()
    const onUnload = vi.fn()
    const reg = new PluginRegistry({ client: host })
    await reg.loadPlugin(
      definePlugin({
        name: 'p',
        setup(ctx) {
          ctx.command('hello', async () => {})
          ctx.use(async (_c, n) => n())
          ctx.on('text', () => {})
        },
        onUnload,
      }),
      '/plugins/p.ts',
    )
    await reg.unload('p')
    expect(host.commands.size).toBe(0)
    expect(host.middleware.size).toBe(0)
    expect(host.listeners.get('text')!.size).toBe(0)
    expect(onUnload).toHaveBeenCalledOnce()
    expect(reg.has('p')).toBe(false)
  })

  it('returned teardown fn from setup runs on unload', async () => {
    const host = fakeHost()
    const teardown = vi.fn()
    const reg = new PluginRegistry({ client: host })
    await reg.loadPlugin(
      definePlugin({ name: 'p', setup: () => teardown }),
      '/plugins/p.ts',
    )
    await reg.unload('p')
    expect(teardown).toHaveBeenCalledOnce()
  })

  it('duplicate name is skipped with warning', async () => {
    const warn = vi.fn()
    const host = { ...fakeHost(), logger: { warn } as never }
    const reg = new PluginRegistry({ client: host })
    const p = definePlugin({ name: 'dup', setup() {} })
    await reg.loadPlugin(p, '/a.ts')
    await reg.loadPlugin(p, '/b.ts')
    expect(reg.list()).toEqual(['dup'])
    expect(warn).toHaveBeenCalled()
  })

  it('setup throwing is isolated (plugin not registered, no throw)', async () => {
    const host = fakeHost()
    const reg = new PluginRegistry({ client: host })
    await expect(
      reg.loadPlugin(definePlugin({ name: 'boom', setup() { throw new Error('x') } }), '/c.ts'),
    ).resolves.toBeUndefined()
    expect(reg.has('boom')).toBe(false)
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm vitest run tests/plugin/registry.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement `src/plugin/registry.ts`**

```ts
import path from 'node:path'
import type { Logger } from '../client/types.js'
import type { Plugin, PluginContext } from './types.js'

export interface PluginHost {
  command(spec: string, handler: Parameters<PluginContext['command']>[1]): unknown
  unregisterCommand(spec: string): void
  use(mw: Parameters<PluginContext['use']>[0]): unknown
  unuse(mw: Parameters<PluginContext['use']>[0]): unknown
  on: PluginContext['on']
  logger?: Logger | undefined
}

type Loaded = {
  plugin: Plugin
  file: string
  disposers: Array<() => void | Promise<void>>
}

export class PluginRegistry {
  private readonly host: PluginHost
  private readonly logger: Logger | undefined
  private readonly plugins = new Map<string, Loaded>()

  constructor(deps: { client: PluginHost; logger?: Logger }) {
    this.host = deps.client
    this.logger = deps.logger ?? deps.client.logger
  }

  has(name: string): boolean {
    return this.plugins.has(name)
  }

  list(): string[] {
    return [...this.plugins.keys()]
  }

  async loadPlugin(plugin: Plugin, file: string): Promise<void> {
    if (typeof plugin?.name !== 'string' || typeof plugin?.setup !== 'function') {
      this.logger?.warn({ file }, 'plugin: invalid shape (need name + setup); skipped')
      return
    }
    if (this.plugins.has(plugin.name)) {
      this.logger?.warn({ name: plugin.name, file }, 'plugin: duplicate name; skipped')
      return
    }
    const disposers: Loaded['disposers'] = []
    const ctx: PluginContext = {
      client: this.host as never,
      logger: this.logger,
      pluginDir: path.dirname(file),
      command: (spec, handler) => {
        this.host.command(spec, handler)
        disposers.push(() => this.host.unregisterCommand(spec))
      },
      use: (mw) => {
        this.host.use(mw)
        disposers.push(() => this.host.unuse(mw))
      },
      on: (event, handler) => {
        const off = this.host.on(event, handler)
        disposers.push(off)
        return off
      },
      once: (event, handler) => {
        const off = this.host.on(event, (payload) => {
          off()
          handler(payload)
        })
        disposers.push(off)
        return off
      },
    }
    try {
      const teardown = await plugin.setup(ctx)
      if (typeof teardown === 'function') disposers.push(teardown)
    } catch (err) {
      for (const d of disposers.reverse()) {
        try { await d() } catch { /* ignore */ }
      }
      this.logger?.error({ err, name: plugin.name, file }, 'plugin: setup failed; skipped')
      return
    }
    this.plugins.set(plugin.name, { plugin, file, disposers })
  }

  async unload(name: string): Promise<void> {
    const loaded = this.plugins.get(name)
    if (!loaded) return
    this.plugins.delete(name)
    for (const dispose of [...loaded.disposers].reverse()) {
      try { await dispose() } catch (err) { this.logger?.warn({ err, name }, 'plugin: disposer threw') }
    }
    try { await loaded.plugin.onUnload?.() } catch (err) {
      this.logger?.warn({ err, name }, 'plugin: onUnload threw')
    }
  }

  async unloadAll(): Promise<void> {
    for (const name of this.list()) await this.unload(name)
  }
}
```

- [ ] **Step 4: Run tests**

Run: `pnpm vitest run tests/plugin/registry.test.ts`
Expected: PASS (all cases).

- [ ] **Step 5: Commit**

```bash
git add src/plugin/registry.ts tests/plugin/registry.test.ts
git commit -m "feat(plugin): PluginRegistry with disposer-tracked load/unload"
```

---

### Task B5: Loader (recursive scan + dynamic import + watch)

**Files:**
- Create: `src/plugin/loader.ts`
- Modify: `src/plugin/index.ts` (add registry + loader exports)
- Test: `tests/plugin/loader.test.ts`

**Interfaces:**
- Consumes: `PluginRegistry` from `./registry.js`; `PluginsOptions` from `./types.js`.
- Produces:
  - `scanPluginFiles(dir: string, pattern: RegExp, ignore: RegExp): Promise<string[]>` (recursive)
  - `importPlugin(file: string, bust?: number): Promise<Plugin | undefined>`
  - `class PluginLoader { constructor(deps); start(): Promise<void>; stop(): Promise<void> }`

- [ ] **Step 1: Write failing test (scan + import; watch tested manually)**

Create `tests/plugin/loader.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { randomBytes } from 'node:crypto'
import { scanPluginFiles, importPlugin } from '../../src/plugin/loader.js'

const DEFAULT_PATTERN = /\.(ts|js|mjs|cjs)$/
const DEFAULT_IGNORE = /(\.d\.ts$|^_|[/\\]_)/

describe('scanPluginFiles', () => {
  let dir: string
  beforeEach(async () => {
    dir = path.join(os.tmpdir(), `zaileys-plugins-${randomBytes(6).toString('hex')}`)
    await fs.mkdir(path.join(dir, 'nested'), { recursive: true })
    await fs.writeFile(path.join(dir, 'a.js'), 'export default {}')
    await fs.writeFile(path.join(dir, 'nested', 'b.js'), 'export default {}')
    await fs.writeFile(path.join(dir, '_skip.js'), 'export default {}')
    await fs.writeFile(path.join(dir, 'types.d.ts'), '')
  })
  afterEach(async () => { await fs.rm(dir, { recursive: true, force: true }) })

  it('finds nested files, skips _-prefixed and .d.ts', async () => {
    const files = await scanPluginFiles(dir, DEFAULT_PATTERN, DEFAULT_IGNORE)
    const names = files.map((f) => path.basename(f)).sort()
    expect(names).toEqual(['a.js', 'b.js'])
  })

  it('returns [] for a missing dir', async () => {
    expect(await scanPluginFiles(path.join(dir, 'nope'), DEFAULT_PATTERN, DEFAULT_IGNORE)).toEqual([])
  })
})

describe('importPlugin', () => {
  let dir: string
  beforeEach(async () => {
    dir = path.join(os.tmpdir(), `zaileys-plug-imp-${randomBytes(6).toString('hex')}`)
    await fs.mkdir(dir, { recursive: true })
  })
  afterEach(async () => { await fs.rm(dir, { recursive: true, force: true }) })

  it('imports the default export', async () => {
    const f = path.join(dir, 'p.mjs')
    await fs.writeFile(f, 'export default { name: "p", setup() {} }')
    const plugin = await importPlugin(f)
    expect(plugin?.name).toBe('p')
  })

  it('returns undefined on a broken module', async () => {
    const f = path.join(dir, 'bad.mjs')
    await fs.writeFile(f, 'this is not valid js ((((')
    expect(await importPlugin(f)).toBeUndefined()
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm vitest run tests/plugin/loader.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement `src/plugin/loader.ts`**

```ts
import { promises as fs, watch as fsWatch, type FSWatcher } from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import type { Logger } from '../client/types.js'
import type { PluginRegistry } from './registry.js'
import type { Plugin, PluginsOptions } from './types.js'

const DEFAULT_PATTERN = /\.(ts|js|mjs|cjs)$/
const DEFAULT_IGNORE = /(\.d\.ts$|^_|[/\\]_)/

export async function scanPluginFiles(
  dir: string,
  pattern: RegExp,
  ignore: RegExp,
): Promise<string[]> {
  let entries: import('node:fs').Dirent[]
  try {
    entries = await fs.readdir(dir, { withFileTypes: true })
  } catch {
    return []
  }
  const out: string[] = []
  for (const entry of entries) {
    const full = path.join(dir, entry.name)
    if (ignore.test(entry.name) || ignore.test(full)) continue
    if (entry.isDirectory()) {
      out.push(...(await scanPluginFiles(full, pattern, ignore)))
    } else if (pattern.test(entry.name)) {
      out.push(full)
    }
  }
  return out
}

export async function importPlugin(file: string, bust?: number): Promise<Plugin | undefined> {
  try {
    const url = pathToFileURL(file).href + (bust !== undefined ? `?t=${bust}` : '')
    const mod = (await import(url)) as { default?: Plugin } & Partial<Plugin>
    const candidate = mod.default ?? (mod as Plugin)
    if (candidate && typeof candidate.name === 'string' && typeof candidate.setup === 'function') {
      return candidate
    }
    return undefined
  } catch {
    return undefined
  }
}

export class PluginLoader {
  private readonly dir: string
  private readonly pattern: RegExp
  private readonly ignore: RegExp
  private readonly watchEnabled: boolean
  private readonly onError: ((err: unknown, file: string) => void) | undefined
  private readonly registry: PluginRegistry
  private readonly logger: Logger | undefined
  private watcher: FSWatcher | undefined
  private readonly fileToName = new Map<string, string>()
  private bust = 0
  private debounce: ReturnType<typeof setTimeout> | undefined
  private readonly pending = new Set<string>()

  constructor(deps: {
    registry: PluginRegistry
    options: PluginsOptions
    logger?: Logger
  }) {
    this.registry = deps.registry
    this.logger = deps.logger
    this.dir = path.resolve(deps.options.dir ?? './plugins')
    this.pattern = deps.options.pattern ?? DEFAULT_PATTERN
    this.ignore = deps.options.ignore ?? DEFAULT_IGNORE
    this.watchEnabled = deps.options.watch !== false
    this.onError = deps.options.onError
  }

  async start(): Promise<void> {
    const files = await scanPluginFiles(this.dir, this.pattern, this.ignore)
    for (const file of files) await this.loadFile(file)
    if (this.watchEnabled) this.startWatch()
  }

  async stop(): Promise<void> {
    if (this.debounce) clearTimeout(this.debounce)
    this.watcher?.close()
    this.watcher = undefined
    await this.registry.unloadAll()
    this.fileToName.clear()
  }

  private async loadFile(file: string): Promise<void> {
    const plugin = await importPlugin(file, this.bust)
    if (!plugin) {
      const err = new Error(`failed to import plugin: ${file}`)
      this.onError?.(err, file)
      this.logger?.warn({ file }, 'plugin: import failed; skipped')
      return
    }
    const before = this.registry.list()
    await this.registry.loadPlugin(plugin, file)
    const added = this.registry.list().find((n) => !before.includes(n))
    if (added) this.fileToName.set(file, added)
  }

  private startWatch(): void {
    try {
      this.watcher = fsWatch(this.dir, { recursive: true }, (_evt, filename) => {
        if (filename == null) return
        const full = path.join(this.dir, filename.toString())
        if (this.ignore.test(filename.toString()) || !this.pattern.test(filename.toString())) return
        this.pending.add(full)
        if (this.debounce) clearTimeout(this.debounce)
        this.debounce = setTimeout(() => void this.flush(), 150)
        this.debounce.unref?.()
      })
    } catch (err) {
      this.logger?.warn({ err, dir: this.dir }, 'plugin: watch unavailable; hot-reload disabled')
    }
  }

  private async flush(): Promise<void> {
    const files = [...this.pending]
    this.pending.clear()
    this.bust += 1
    for (const file of files) {
      const existing = this.fileToName.get(file)
      if (existing) {
        await this.registry.unload(existing)
        this.fileToName.delete(file)
      }
      let stillExists = true
      try { await fs.access(file) } catch { stillExists = false }
      if (stillExists) await this.loadFile(file)
    }
  }
}
```

> ponytail: cache-bust `?t=N` busts the ESM loader cache only. Under a pure CJS require graph the suffix won't re-evaluate; default consumers run ESM/tsx so this holds. Upgrade path if CJS hot-reload is ever needed: drop the require cache entry by resolved path.

- [ ] **Step 4: Add exports to `src/plugin/index.ts`**

```ts
export { definePlugin } from './types.js'
export type { Plugin, PluginContext, PluginsOptions } from './types.js'
export { PluginRegistry } from './registry.js'
export type { PluginHost } from './registry.js'
export { PluginLoader, scanPluginFiles, importPlugin } from './loader.js'
```

- [ ] **Step 5: Run tests + typecheck**

Run: `pnpm vitest run tests/plugin && pnpm typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/plugin/loader.ts src/plugin/index.ts tests/plugin/loader.test.ts
git commit -m "feat(plugin): recursive loader + fs.watch hot-reload"
```

---

### Task B6: Wire plugins into Client

**Files:**
- Modify: `src/client/types.ts` (add `plugins` to `ClientOptions`)
- Modify: `src/client/client.ts` (add `unregisterCommand`, satisfy `PluginHost`, lifecycle)
- Modify: `src/index.ts` (export plugin surface)

**Interfaces:**
- Consumes: `PluginLoader`, `PluginRegistry` from `../plugin/index.js`; `PluginsOptions` from `../plugin/types.js`.

- [ ] **Step 1: Add option**

In `src/client/types.ts`, add to `ClientOptions`: `plugins?: PluginsOptions` (import the type from `../plugin/types.js`).

- [ ] **Step 2: Add `unregisterCommand` to Client**

In `client.ts`, near `command()`:

```ts
  unregisterCommand(spec: string): this {
    this.commandRegistry?.unregister(spec)
    return this
  }
```
This makes `Client` structurally satisfy `PluginHost` (it already has `command`, `use`, `unuse`, `on`, `logger`).

- [ ] **Step 3: Start loader after connect, stop on disconnect**

Add private fields:
```ts
  private pluginRegistry?: PluginRegistry
  private pluginLoader?: PluginLoader
```
In the post-open wiring block (same place the autoDelete sweeper starts, after commands/pipeline are ready):
```ts
    if (this.options.plugins) {
      this.pluginRegistry = new PluginRegistry({
        client: this as unknown as PluginHost,
        ...(this.logger ? { logger: this.logger } : {}),
      })
      this.pluginLoader = new PluginLoader({
        registry: this.pluginRegistry,
        options: this.options.plugins,
        ...(this.logger ? { logger: this.logger } : {}),
      })
      void this.pluginLoader.start().catch((err) =>
        this.logger?.error(err, 'plugin loader start failed'),
      )
    }
```
In `disconnect()`:
```ts
    await this.pluginLoader?.stop().catch(() => undefined)
    this.pluginLoader = undefined
    this.pluginRegistry = undefined
```
(If `disconnect()` is not async or can't await, call `void this.pluginLoader?.stop()` instead — match the method's existing style.)

- [ ] **Step 4: Export public plugin API in `src/index.ts`**

```ts
export { definePlugin } from './plugin/index.js'
export type { Plugin, PluginContext, PluginsOptions } from './plugin/index.js'
```

- [ ] **Step 5: Typecheck + full plugin/command tests**

Run: `pnpm typecheck && pnpm vitest run tests/plugin tests/command`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/client/types.ts src/client/client.ts src/index.ts
git commit -m "feat(client): wire plugin loader into lifecycle"
```

---

### Task B7: Examples + build verification

**Files:**
- Create: `examples/plugins/greet.ts` (sample plugin)
- Create: `examples/quickstart-plugins.ts` (sample usage)

**Interfaces:** none (docs/examples only).

- [ ] **Step 1: Write the sample plugin**

`examples/plugins/greet.ts`:
```ts
import { definePlugin } from 'zaileys'

export default definePlugin({
  name: 'greet',
  setup(ctx) {
    ctx.command('hello', async (c) => {
      await c.reply('hi there 👋')
    })
    ctx.on('text', (m) => ctx.logger?.info({ text: m.text }, 'greet saw text'))
    return () => ctx.logger?.info('greet unloaded')
  },
})
```

- [ ] **Step 2: Write the usage example**

`examples/quickstart-plugins.ts`:
```ts
import { Client } from 'zaileys'

const client = new Client({
  sessionId: 'plugins-demo',
  commandPrefix: '!',
  plugins: { dir: './examples/plugins', watch: true },
  autoDelete: { maxAgeMs: 7 * 24 * 60 * 60 * 1000, maxPerChat: 500, intervalMs: 60_000 },
})

client.on('connection', (u) => console.log('connection:', u.status))
```
(Verify `connection` event name + payload field against `ClientEventMap`; adjust to the real event/field.)

- [ ] **Step 3: Build the library (ensures new src compiles under tsup, dist updated for husky)**

Run: `pnpm build`
Expected: tsup builds with no errors; `dist/` updated.

- [ ] **Step 4: Full test + audits (mirror husky pre-commit)**

Run: `pnpm typecheck && pnpm test && pnpm audit:comments && pnpm audit:any`
Expected: all PASS.

- [ ] **Step 5: Commit (with hooks — full gate)**

```bash
git add examples/plugins/greet.ts examples/quickstart-plugins.ts dist
git commit -m "docs(examples): plugin + autoDelete quickstart"
```

---

## Self-Review

**Spec coverage:**
- Auto-delete config (maxAgeMs/maxPerChat/intervalMs/chats) → A8 + A7 `AutoDeleteOptions`. ✓
- Both-unset → sweeper off → A7 `active` getter + B-test "no-op when no maxAge/maxPerChat". ✓
- `pruneMessages?`/`deleteMessage?` interface → A1. ✓
- Native prune in all 5 adapters → A2–A6 (memory, sqlite, postgres, redis, convex). ✓
- Sweeper prefer native → fallback deleteMessage → warn-once skip → A7 tests. ✓
- unref + try/catch + re-entrancy guard → A7 `start()`. ✓
- `definePlugin` identity, autocomplete → B3. ✓
- PluginContext command/use/on/once tracked → B4. ✓
- Recursive nested scan, ignore _/.d.ts → B5 `scanPluginFiles`. ✓
- watch:true default hot-reload + clean teardown → B5 `PluginLoader` + `watchEnabled = watch !== false`. ✓
- Error isolation (one bad plugin) → B4 setup-throw test + B5 import-undefined path. ✓
- CommandRegistry.unregister + middleware removal → B1, B2. ✓
- Lifecycle wiring → A8, B6. ✓
- Exports (definePlugin, types, PruneOptions, AutoDeleteOptions) → A8, B6. ✓
- Out of scope (isSuspiciousLink, sandbox, WA revoke) → not implemented. ✓

**Placeholder scan:** No TBD/TODO. All code blocks concrete. Adapter tasks note "match existing helper name" — these are real instructions to verify a name in-file, not placeholders; the surrounding code is complete.

**Type consistency:** `pruneMessages(opts: PruneOptions): Promise<number>` and `deleteMessage(key): Promise<void>` consistent A1↔A2–A6↔A7. `PluginContext`/`Plugin`/`PluginHost` consistent B3↔B4↔B5↔B6. `AutoDeleteOptions` consistent A7↔A8. `unregister`/`unregisterCommand`/`unuse` names consistent B1↔B2↔B4↔B6.

**Risk notes for executor:**
- Adapter internal helper names (`assertReady`, `this.run`, `runRead/runWrite`, `kv.delete`) are assumed — VERIFY each against the file before writing; the SQL/Redis/Convex logic is correct but the wrapper call must match.
- `ClientEventMap` export name in `src/client/types.ts` — verify (could be `ClientEvents`).
- Postgres/Redis tests skip without a live server; rely on typecheck + the memory/sqlite/convex contract runs for prune correctness coverage.
