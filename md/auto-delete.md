# Auto-Delete

> Source: https://zeative.github.io/zaileys/auto-delete

# Auto-Delete

zaileys includes a built-in sweeper that periodically removes old messages from the **local store**.
It runs on a configurable interval, always keeping the last `maxAgeMs` worth of messages — a true
rolling/sliding retention window, not a one-shot purge. A message stored today is quietly removed
approximately 30 days later (the default).

Auto-delete is **enabled by default** with a 1-month retention period. You do not need any
configuration to get basic housekeeping.

```typescript

// No config needed — sweeper is on, keeps the last 30 days.
const client = new Client()
```

  Auto-delete permanently removes messages from the **local store only**. It never sends a
  WhatsApp delete or revoke — messages on WhatsApp's servers and on other devices are completely
  unaffected. Deletions from the local store are irreversible.

## How it works

Every `intervalMs` (default 60 s), the sweeper wakes up and computes a cutoff timestamp:

```
cutoff = now - maxAgeMs
```

It then calls the store's `pruneMessages` method, passing the cutoff, any `maxPerChat` count cap,
and the `chats` scope filter. Any message whose `messageTimestamp` is older than the cutoff is
deleted. When `maxPerChat` is also set, only the newest N messages per chat are kept, regardless of
age.

Because the window slides with the clock, messages are removed continuously — not all at once. There
is no sudden spike of deletions at the 30-day mark.

**Implementation details worth knowing:**

- The interval timer is `unref()`'d — it will not keep the Node.js process alive on its own.
- A re-entrancy guard skips a tick if the previous sweep is still running (e.g. a slow DB).
- The sweeper starts after the client connects and stops when `disconnect()` is called.
- If the store exposes no `pruneMessages` and no `deleteMessage`, the sweeper logs a one-time
  warning and disables itself — it never throws or crashes the bot. See [Custom stores](#custom-stores).

## Configuration

Pass `autoDelete` to the `Client` constructor to override any field. Your object is **merged** over
the defaults — you only need to supply what you want to change.

```typescript

const client = new Client({
  autoDelete: {
    maxAgeMs: 7 * 24 * 60 * 60 * 1000, // 7 days
  },
})
```

To disable auto-delete entirely, pass `false`:

```typescript
const client = new Client({ autoDelete: false })
```

### `AutoDeleteOptions`

| Option | Type | Default | Description |
| ------ | ---- | ------- | ----------- |
| `maxAgeMs` | `number` | `2_592_000_000` (30 days) | Delete messages whose `messageTimestamp` is older than `now - maxAgeMs`. The retention window slides with the clock. |
| `maxPerChat` | `number` | unset | Keep only the newest N messages per chat, regardless of age. Has no effect unless set. |
| `intervalMs` | `number` | `60_000` (60 s) | How often the sweeper runs in milliseconds. |
| `chats` | `'all' \| ((jid: string) => boolean)` | `'all'` | Scope filter. Pass a predicate to restrict sweeping to specific chats. |

  The `maxAgeMs` default is `30 * 24 * 60 * 60 * 1000` = `2_592_000_000` ms. When you pass an
  `autoDelete` object without specifying `maxAgeMs`, this default is still applied — the object you
  pass is merged over the built-in defaults, not replaced.

## Examples

### Default — do nothing

The sweeper is already running with 30-day retention. No config needed.

```typescript

const client = new Client()

client.on('connect', () => {
  console.log('Connected — auto-delete running with 30-day retention.')
})
```

### Custom retention window

Keep only the last 7 days of messages across all chats:

```typescript

const client = new Client({
  autoDelete: {
    maxAgeMs: 7 * 24 * 60 * 60 * 1000, // 7 days
  },
})
```

### Count cap scoped to group chats

Keep at most 500 messages per group, sweeping every 5 minutes. `maxAgeMs` still defaults to 30 days
— messages older than 30 days are also removed unless you override `maxAgeMs: Infinity`.

```typescript

const client = new Client({
  autoDelete: {
    maxPerChat: 500,
    intervalMs: 5 * 60 * 1000, // 5 minutes
    chats: (jid) => jid.endsWith('@g.us'), // groups only
  },
})
```

### Disable auto-delete

```typescript

const client = new Client({ autoDelete: false })
```

## Custom stores

The sweeper adapts to what the store exposes, in order of preference:

1. **`pruneMessages(opts)`** — the store handles pruning natively and returns a count of deleted
   messages. All 5 built-in adapters (Memory, SQLite, Postgres, Redis, Convex) implement this
   efficiently (e.g. a single SQL `DELETE WHERE`).
2. **`deleteMessage(key)`** — fallback for stores that have no native prune: the sweeper enumerates
   chats, lists messages, and deletes old ones one by one.
3. **Neither** — the sweeper logs a one-time warning and disables itself silently.

If you are building a custom store, implementing `pruneMessages` is the recommended path. See
[Pruning old messages](/storage#pruning-old-messages) for the full interface.

## See also

- [Storage Adapters](/storage) — all five built-in adapters and the `pruneMessages` / `deleteMessage` interface.
- [Configuration](/configuration) — the `autoDelete` ClientOption alongside all other connection options.
