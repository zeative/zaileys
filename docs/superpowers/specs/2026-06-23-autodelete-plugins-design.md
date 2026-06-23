# Design — Auto-delete (store cleanup) + Plugin system

Date: 2026-06-23 · Branch: `v4` · Repo: zaileys

Two new features for the zaileys WhatsApp library. A third candidate
(`isSuspiciousLink` payload field) was **dropped from scope** during brainstorming.

---

## Feature 1 — Auto-delete (local store cleanup)

### Goal
Prune old messages from the `MessageStore` so it never grows unbounded.
Purely local — never sends WhatsApp delete/revoke. Must work across **every**
store backend (all 5 built-in adapters **and** user-supplied custom stores),
and must never crash a store that can't prune.

### Config (`ClientOptions.autoDelete`)
```ts
autoDelete?: {
  maxAgeMs?: number       // delete messages older than this (e.g. 7*24*3600_000). default: undefined (off)
  maxPerChat?: number     // keep only N newest messages per chat. default: undefined (off)
  intervalMs?: number     // sweep period. default: 60_000
  chats?: 'all' | ((jid: string) => boolean)  // scope filter. default: 'all'
}
```
- If **both** `maxAgeMs` and `maxPerChat` are unset → sweeper never starts
  (zero cost default, YAGNI).
- At least one set → sweeper runs on `intervalMs`.

### Store contract changes (`src/store/types.ts`)
Add two **optional** methods to `MessageStore`:
```ts
pruneMessages?(opts: PruneOptions): Promise<number>   // returns count deleted
deleteMessage?(key: WAMessageKey): Promise<void>      // generic delete primitive
```
```ts
export type PruneOptions = {
  olderThan?: number                  // ms epoch cutoff; delete ts < olderThan
  maxPerChat?: number                 // keep newest N per chat
  chatFilter?: (jid: string) => boolean
}
```

### Sweeper (`src/automation/auto-delete.ts`)
`AutoDeleteSweeper` started on connect, stopped on `disconnect()`:
1. `setInterval(intervalMs)`, timer `.unref()` so it never holds the process open.
2. Each tick resolves a cutoff (`Date.now() - maxAgeMs`) and calls the best
   available strategy:
   - **store has `pruneMessages`** → call it (native, efficient). Preferred.
   - **else store has `deleteMessage`** → generic fallback: `listChats()` →
     for each jid passing `chatFilter`, `listMessages(jid)`, compute victims
     (age + keep-newest-N), `deleteMessage(key)` each.
   - **else** → `logger.warn` **once** (`AUTO_DELETE_UNSUPPORTED`), then disable
     the sweeper for this store. Never throws.
3. Each tick wrapped in try/catch → a prune error is logged, never crashes the bot.
4. Re-entrancy guard: skip a tick if the previous one is still running.

### Per-adapter native `pruneMessages` (all 5)
| Adapter | Age prune | Count prune (keep newest N/chat) |
|---|---|---|
| **memory** (`memory.ts`) | filter `messagesByJid` index by ts, drop from maps | sort desc, slice to N, drop tail |
| **sqlite** (`sqlite.ts`) | `DELETE FROM zaileys_messages WHERE timestamp < ?` | `DELETE ... WHERE rowid IN (SELECT ... row_number() OVER (PARTITION BY remote_jid ORDER BY timestamp DESC) > N)` (sqlite ≥3.25) |
| **postgres** (`postgres.ts`) | `DELETE FROM zaileys_messages WHERE timestamp < $1` | window `row_number() OVER (PARTITION BY remote_jid ORDER BY timestamp DESC)` delete `> N` |
| **redis** (`redis.ts`) | per index key: `zRangeByScore(-inf, cutoff)` → `hDel` data + `zRemRangeByScore` | per index key: `zRemRangeByRank(key, 0, -(N+1))` + `hDel` removed members. Enumerate index keys via `SCAN` on `msgIndexKey` prefix |
| **convex** (`convex.ts`) | `kv.list(MSG prefix)`, delete entries with `sortKey < cutoff` | group by jid, keep newest N, delete rest |

`chatFilter` applied per-jid in every adapter. Each native impl returns total
deleted count.

### Files touched
- `src/store/types.ts` — `+pruneMessages?`, `+deleteMessage?`, `+PruneOptions`
- `src/store/adapters/{memory,sqlite,postgres,redis,convex}.ts` — implement both
- `src/automation/auto-delete.ts` — **new** sweeper
- `src/client/types.ts` — `+autoDelete` on `ClientOptions`
- `src/client/client.ts` — start sweeper after connect, stop on disconnect
- `src/index.ts` — export `PruneOptions` type

---

## Feature 2 — Plugins (folder-based, nested, type-safe, hot-reload)

### Goal
User drops plugin files in a folder; library auto-scans **recursively**, loads
each, and each plugin may register **commands + event handlers + middleware +
lifecycle hooks**. Hot-reload **on by default**, with clean teardown (no leaks).
Robust: one bad plugin never takes down the others ("aman" = error isolation,
**not** a security sandbox — plugins are trusted code).

### Authoring a plugin (best DX + autocomplete)
```ts
// plugins/greet.ts
import { definePlugin } from 'zaileys'

export default definePlugin({
  name: 'greet',
  setup(ctx) {
    ctx.command('hello', async (c) => c.reply('hi!'))
    ctx.on('text', (m) => ctx.logger.info(m.text))
    ctx.use(async (c, next) => { await next() })
    return () => { /* optional teardown; or use onUnload */ }
  },
  onUnload() { /* optional */ },
})
```
`definePlugin(p)` is an identity function purely for type inference — zero
runtime cost, full autocomplete on `ctx`.

### Types (`src/plugin/types.ts`)
```ts
export interface Plugin {
  name: string
  setup(ctx: PluginContext): void | (() => void) | Promise<void | (() => void)>
  onUnload?(): void | Promise<void>
}
export interface PluginContext {
  client: Client                       // full client access
  logger: Logger
  pluginDir: string                    // dir of this plugin file
  command(spec: string, handler: CommandHandler): void
  use(middleware: Middleware): void
  on<E>(event: E, handler): () => void
  once<E>(event: E, handler): () => void
}
export const definePlugin = (p: Plugin): Plugin => p
```
Every `ctx.command/use/on/once` call is **recorded** into that plugin's disposer
list, so unload reverses them precisely (LIFO).

### Config (`ClientOptions.plugins`)
```ts
plugins?: {
  dir?: string                    // default './plugins'
  watch?: boolean                 // hot-reload. default: TRUE
  pattern?: RegExp                // default /\.(ts|js|mjs|cjs)$/
  ignore?: RegExp                 // default /(\.d\.ts$|^_|[/\\]_)/  (skip .d.ts, _-prefixed)
  onError?: (err: unknown, file: string) => void
}
```

### Mechanics (`src/plugin/`)
- **`loader.ts`** — recursive scan of `dir` (nested supported), filter by
  `pattern`/`ignore`, dynamic `import()` each file, read default export, validate
  it's a `Plugin` (has `name` + `setup`). Per-file try/catch → load failure logged
  via `onError`, skipped; siblings continue.
- **`registry.ts`** — `PluginRegistry` holds `Map<name, LoadedPlugin>` where
  `LoadedPlugin = { plugin, disposers: Array<() => void>, file }`. Duplicate
  `name` → warn + skip the later one.
  - `load(file)`: import → build scoped `PluginContext` whose register methods
    push disposers → call `setup(ctx)` → store any returned teardown fn.
  - `unload(name)`: run disposers LIFO, then `onUnload()`, then drop from map.
    Each disposer wrapped in try/catch so one throw doesn't block the rest.
- **Hot-reload (`watch:true`, default)** — `fs.watch(dir, {recursive:true})`,
  debounced (~150ms). On change to a tracked file: `unload(oldName)` →
  re-`import()` with cache-bust (`?t=<counter>` query suffix, monotonic counter —
  not `Date.now()`, kept reload-safe) → `load`. On new file: load. On delete:
  unload. All wrapped so a broken edit during dev logs and leaves the previous
  good state (best-effort) — never crashes the running bot.

### Required upstream tweaks
The existing client register APIs are append-only; plugins need to *unregister*:
- `CommandRegistry.unregister(spec)` — remove a command + its aliases from
  `paths`/`defs`; recompute `maxDepth`. (`src/command/registry.ts`)
- Middleware removal — `client.use` currently only pushes to
  `commandMiddleware`. Add an internal `client.unuse(mw)` (or return a disposer
  from a new internal path) so plugin middleware can be pulled. (`src/client/client.ts`)
- `client.on` already returns a disposer → reused directly.
- After command (un)registration the dispatcher must re-evaluate; reuse existing
  `attachCommandsIfReady()` and ensure unregister leaving zero commands is safe.

### Lifecycle wiring (`src/client/client.ts`)
- After connection opens (where pipeline/commands attach): if `plugins` config
  present, construct `PluginRegistry`, scan+load `dir`, start watcher if
  `watch !== false`.
- On `disconnect()`: stop watcher, `unload` all plugins (clean teardown).

### Files touched
- `src/plugin/{types,loader,registry,index}.ts` — **new**
- `src/command/registry.ts` — `+unregister`
- `src/client/client.ts` — `+unuse` (internal), plugin lifecycle, start/stop
- `src/client/types.ts` — `+plugins` on `ClientOptions`
- `src/index.ts` — export `definePlugin`, `Plugin`, `PluginContext`

---

## Out of scope (explicitly skipped)
- `isSuspiciousLink` payload field (dropped).
- Plugin security sandbox / capability isolation (plugins are trusted code).
- WhatsApp-side delete/revoke in auto-delete (local store only).
- Async/remote prune throttling beyond the simple interval + re-entrancy guard.

## Verification (per ponytail: one runnable check per non-trivial unit)
- `pruneMessages` memory adapter: unit test — insert N messages across 2 chats
  with varied timestamps, prune by age and by count, assert survivors + return count.
- Generic fallback path: a stub store with only `deleteMessage` → assert sweeper
  deletes correct victims.
- Plugin registry: load a plugin registering a command+listener+middleware, then
  `unload`, assert all three are gone (command unresolved, listener count 0,
  middleware removed).
- `CommandRegistry.unregister`: register `a|b` alias, unregister, assert both
  keys gone and `maxDepth` recomputed.
```
