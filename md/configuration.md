# Configuration

> Source: https://zeative.github.io/zaileys/configuration

# Configuration

Every zaileys bot starts by constructing a `Client` with a `ClientOptions` object. This page is the
exhaustive reference for **every** option the constructor accepts, the exact default it falls back
to, and how each one changes the client's behavior. All defaults below are read straight from the
`Client` constructor source, not guessed.

```typescript

const client = new Client({ sessionId: 'default' })
```

  `ClientOptions` is fully optional — `new Client()` works and applies every default in the table
  below. The most common reason to pass options is to pick a login method ([`authType`](#authtype--phonenumber)),
  enable [commands](#commandprefix) via `commandPrefix`, or swap in a persistent
  [storage adapter](/storage) via `auth` / `store`.

## All options at a glance

| Option | Type | Default | Description |
| ------ | ---- | ------- | ----------- |
| `sessionId` | `string` | `'default'` | Identifies this session. Used as the default auth folder name and as the `sessionId` field on every emitted event. |
| `authType` | `'qr' \| 'pairing'` | `'qr'` | Login method: scan a QR code (`'qr'`) or request an 8-digit pairing code (`'pairing'`, requires `phoneNumber`). |
| `phoneNumber` | `string` | `undefined` | Phone number in international digits (e.g. `'628xxx'`). **Required** when `authType` is `'pairing'`; ignored for `'qr'`. |
| `auth` | `AuthStoreBundle` | `FileAuthStore` at `./.zaileys/auth/<sessionId>` | Where Baileys credentials and signal keys are persisted. See [Storage Adapters](/storage). |
| `store` | `MessageStore` | `MemoryMessageStore` | Where messages, chats, contacts, presence, and scheduled jobs are stored. See [Storage Adapters](/storage). |
| `logger` | `Logger \| Partial<Logger>` | Pino logger, level from `ZAILEYS_DEBUG` (default `silent`) | Structured logger with `debug` / `info` / `warn` / `error` / `fatal`. A partial object is padded with no-ops. |
| `commandPrefix` | `string \| string[]` | `undefined` (no prefixes → commands disabled) | Trigger prefix(es) that activate the [command framework](/commands), e.g. `'/'` or `['/', '!']`. |
| `ignoreMe` | `boolean` | `true` | When `true`, inbound messages sent by your own account are dropped before reaching handlers. |
| `citation` | `CitationConfig` | `undefined` | Configures the per-message `citation.authors()` / `citation.banned()` predicates available in message context. |
| `reconnect` | `ReconnectOptions` | `{}` (strategy defaults below) | Tunes the auto-reconnect backoff strategy. |
| `authGuard` | `AuthGuardOptions` | on (bounds QR/pairing regeneration) | Caps how many QR codes / pairing codes the client regenerates, with an escalating pairing cooldown, so a stuck auth loop can't spam WhatsApp into a restriction. |
| `operationGuard` | `OperationGuardOptions` | on (spaces group/community/newsletter ops) | Serializes and rate-limits sensitive group / community / newsletter operations per category so rapid bulk actions don't trip a ban. |
| `presence` | `PresenceThrottleOptions` | on (drops duplicate presence) | Drops repeated presence updates (typing / recording / online) for the same chat within a short window. |
| `scheduleRateLimitPerSec` | `number` | `1` (`0` disables) | Max scheduled messages dispatched per second, smoothing out a backlog of overdue jobs so they don't all fire at once. |
| `autoRejectCall` | `boolean \| AutoRejectCallOptions` | `false` (off) | 🔗 **Unofficial only.** Auto-reject incoming WhatsApp calls. `true` rejects every call; pass an object for an allow-list and an `onReject` hook. |
| `autoDelete` | `AutoDeleteOptions \| false` | `on (1-month retention)` | Periodically prune old messages from the local store. See [Auto-Delete](/auto-delete). |
| `plugins` | `PluginsOptions` | `undefined` | Load and hot-reload plugins from a folder. See [Plugins](/plugins). |
| `autoConnect` | `boolean` | `true` | When `true`, the constructor calls `connect()` on the next microtask. Set `false` to connect manually. |
| `qrTerminal` | `boolean` | `true` | When `true`, prints the QR code to the terminal in addition to emitting the `qr` event. |
| `statusLog` | `boolean` | `true` | When `true`, writes human-readable connection status lines to `stderr` and suppresses noisy libsignal logs. |
| `cacheSignal` | `boolean` | `true` | When `true`, wraps the auth store with an in-memory signal-key cache for faster reads. |
| `baileys` | `Partial<UserFacingSocketConfig>` | `{}` | Extra Baileys socket config merged into the internal config (after the internal defaults `markOnlineOnConnect: false` / `syncFullHistory: false` / `qrTimeout: 60000`, before the managed `auth` / `logger`). |

  `auth` and `logger` are **forced** internally and override anything you pass through `baileys`.
  The safety defaults `markOnlineOnConnect: false`, `syncFullHistory: false`, and `qrTimeout` are set
  **before** your `baileys` spread, so those three you *can* override. Use the top-level `auth` /
  `store` / `logger` options rather than reaching into `baileys` for those concerns.

## `sessionId`

A label for this connection. It has two effects: it becomes the default auth folder
(`./.zaileys/auth/<sessionId>`) when you do not pass a custom `auth`, and it is included as the
`sessionId` field on **every** emitted event so you can tell sessions apart in a multi-account
process.

```typescript

const primary = new Client({ sessionId: 'account-a' })
const secondary = new Client({ sessionId: 'account-b' })

primary.on('connect', ({ sessionId, me }) => console.log(sessionId, 'ready as', me.id))
secondary.on('connect', ({ sessionId, me }) => console.log(sessionId, 'ready as', me.id))
```

  Two clients sharing the same `sessionId` would also share the same default auth folder and clash.
  Give each account a unique `sessionId`.

## `authType` & `phoneNumber`

`authType` selects how you log in. With the default `'qr'`, a QR string is emitted (and printed to
the terminal unless [`qrTerminal`](#qrterminal) is `false`). With `'pairing'`, the client requests
an 8-digit code for the given `phoneNumber` and emits it via the `pairing-code` event.

```typescript

const client = new Client({ authType: 'qr' })

client.on('qr', ({ qrString, expiresAt }) => {
  console.log('Scan this QR:', qrString, 'expires at', new Date(expiresAt))
})
```

```typescript

const client = new Client({
  authType: 'pairing',
  phoneNumber: '628xxxxxxxxxx',
})

client.on('pairing-code', ({ code, expiresAt }) => {
  console.log('Enter this code in WhatsApp:', code, 'expires at', new Date(expiresAt))
})
```

  When `authType` is `'pairing'` and `phoneNumber` is missing, `connect()` rejects with
  `phoneNumber is required when authType is "pairing"`. With [`autoConnect`](#autoconnect) on (the
  default), that rejection surfaces through the `error` event.

## `commandPrefix`

Setting `commandPrefix` activates the [command framework](/commands). Pass a single prefix or an
array; empty strings are filtered out. When no prefix is configured, `client.command(...)` handlers
never fire (the dispatcher only attaches once there is at least one prefix, at least one registered
command, and a live socket).

```typescript

const client = new Client({ commandPrefix: ['/', '!'] })

const logging: Middleware = async (ctx, next) => {
  console.log(`[command] ${ctx.command} from ${ctx.senderId}`)
  await next()
}

client.use(logging)

client.command('ping', async (ctx) => {
  await ctx.reply('pong')
})
```

See [Commands](/commands) for spec syntax, args/flags parsing, and middleware.

## `ignoreMe`

With the default `true`, any inbound message whose sender is your own logged-in account is dropped
before reaching `text` / message handlers — handy so an echo bot does not respond to itself. Set it
to `false` when you intentionally want to react to your own messages (for example an owner-triggered
command from your own number).

```typescript

// React to messages from your own account too (e.g. owner-only triggers).
const client = new Client({ ignoreMe: false })

client.on('text', async (msg) => {
  if (msg.text === '.ping') await msg.reply('pong')
})
```

## `auth`

The credential/signal-key store. Defaults to a `FileAuthStore` rooted at
`./.zaileys/auth/<sessionId>`. Pass any `AuthStoreBundle` to persist auth elsewhere (SQLite,
Postgres, Redis, Convex, or your own implementation). The bundle has two halves:

```typescript
interface AuthStoreBundle {
  readonly creds: AuthCredsStore   // readCreds / writeCreds / deleteCreds
  readonly signal: AuthStore       // read / write / delete / clear / close
}
```

```typescript

const client = new Client({
  sessionId: 'main',
  auth: new SqliteAuthStore({ database: './zaileys.db' }),
})
```

  Unless you disable [`cacheSignal`](#cachesignal), the client wraps your `auth` in an in-memory
  signal-key cache on first connect. See [Storage Adapters](/storage) for every bundled adapter and
  its constructor options.

## `store`

The message/chat/contact/presence store, also used to persist scheduled broadcast jobs. Defaults to
`MemoryMessageStore` (lost on restart). Swap in a persistent `MessageStore` for durability — the
store is bound to the socket on connect and powers quoted-message lookups and the
[scheduler](/automation).

```typescript

const client = new Client({
  store: new SqliteMessageStore({ database: './zaileys.db' }),
})
```

See [Storage Adapters](/storage) for the full `MessageStore` interface and adapter options.

## `logger`

A structured logger with `debug`, `info`, `warn`, `error`, and `fatal` methods. When omitted, zaileys
builds a Pino logger whose level comes from the `ZAILEYS_DEBUG` environment variable:

| `ZAILEYS_DEBUG` | Resulting level |
| --------------- | --------------- |
| unset | `silent` |
| `1` | `info` |
| `silent` / `fatal` / `error` / `warn` / `info` / `debug` / `trace` | that exact level |
| anything else | `silent` |

You may pass a **partial** logger — any missing method is replaced with a no-op, so providing just
`error` and `warn` is valid.

```typescript

const client = new Client({
  logger: {
    debug: () => {},
    info: (...a) => console.log('[info]', ...a),
    warn: (...a) => console.warn('[warn]', ...a),
    error: (...a) => console.error('[error]', ...a),
    fatal: (...a) => console.error('[fatal]', ...a),
  },
})
```

  The quickest way to see internal logs without writing a custom logger is `ZAILEYS_DEBUG=1` (or
  `ZAILEYS_DEBUG=debug`) in your environment.

## `citation`

Supplies the predicates behind the per-message `citation` object in [message context](/events). Both
fields accept either a list of JIDs or an async predicate function.

```typescript

const client = new Client({
  citation: {
    authors: ['628xxx@s.whatsapp.net'],         // or (jid) => jid.endsWith('@s.whatsapp.net')
    banned: (jid) => jid.startsWith('62800'),
  },
})

client.on('text', async (msg) => {
  if (await msg.citation.banned()) return
  if (await msg.citation.authors()) await msg.reply('Hello, author!')
})
```

## `reconnect`

Tunes the exponential-backoff reconnect strategy. The default `{}` uses the values below; override
only the fields you care about.

| Field | Type | Default | Description |
| ----- | ---- | ------- | ----------- |
| `enabled` | `boolean` | `true` | Whether to reconnect at all after a non-fatal disconnect. |
| `maxAttempts` | `number` | `Infinity` | Maximum reconnect attempts before giving up. |
| `initialDelayMs` | `number` | `3000` | Base delay for the first attempt; doubles each subsequent attempt. (Default raised from `1000` — instant reconnect storms are a ban trigger.) |
| `maxDelayMs` | `number` | `60000` | Upper bound on the (jittered) delay between attempts. |
| `jitterFactor` | `number` | `0.2` | Randomization applied to the delay (±20% by default) to avoid thundering herds. |
| `rateLimitedDelayMs` | `number` | `300000` | Fixed backoff used when the disconnect reason is `rate-limited` (HTTP 429), instead of the exponential ladder. |

```typescript

const client = new Client({
  reconnect: {
    maxAttempts: 10,
    initialDelayMs: 2000,
    maxDelayMs: 30000,
    jitterFactor: 0.3,
  },
})
```

  Fatal disconnects (such as logged-out) never trigger a reconnect regardless of these settings;
  zaileys clears the auth folder so you can re-authenticate. See [Events](/events) for the
  `disconnect` / `reconnecting` payloads.

  A `rate-limited` (HTTP 429) disconnect is **non-fatal** — zaileys still reconnects, but it uses the
  fixed `rateLimitedDelayMs` (default 5 minutes) instead of the exponential ladder, so it backs off
  hard rather than hammering WhatsApp while you are being throttled.

## `authGuard`

`authGuard` bounds how many times the client regenerates a login QR or requests a pairing code. Every
reconnect creates a fresh socket that re-emits a QR / requests a new pairing code; with no cap and no
cooldown, an auth flow that never completes turns into a loop that spams WhatsApp — which answers with
HTTP 429 (`rate-overlimit`) and the dreaded *"Your account is restricted right now"*. The guard puts a
ceiling on that.

| Field | Type | Default | Description |
| ----- | ---- | ------- | ----------- |
| `enabled` | `boolean` | `true` | Set `{ enabled: false }` to restore the old unlimited behavior. |
| `maxQrAttempts` | `number` | `5` | Total QR codes emitted before the client gives up. |
| `maxPairingAttempts` | `number` | `3` | Total pairing-code requests before giving up. |
| `pairingCooldownMs` | `number` | `60000` | Base cooldown between pairing requests; it escalates per attempt (60s, then 120s, then 180s…) capped at `300000` (5 min). |

When the budget is exhausted the client **stops** (it does not keep looping), emits an
[`auth-exhausted`](/events) event, and tears down. Calling `client.connect()` again resets the budget
and retries; the budget also resets automatically on a successful connection.

```typescript

const client = new Client({
  authType: 'pairing',
  phoneNumber: '628xxxxxxxxxx',
  authGuard: {
    maxPairingAttempts: 3,
    pairingCooldownMs: 60_000,
  },
})

client.on('auth-exhausted', ({ kind, attempts, max }) => {
  console.error(`auth gave up after ${attempts}/${max} ${kind} attempts — fix auth, then connect() again`)
})
```

  Keep `authGuard` on. It is the main protection against spamming WhatsApp into an account
  restriction during a stuck QR / pairing loop. Only set `{ enabled: false }` if you have your own
  external throttling. See [Account restricted / banned](/troubleshooting) if you have already hit
  the limit.

## `operationGuard`

`operationGuard` serializes and spaces out sensitive group / community / newsletter operations.
Rapidly joining or creating groups and mass-adding members is one of the top ban triggers, so each
operation **category** has a minimum interval — a rapid second call to the same category simply waits
until the interval elapses.

| Field | Type | Default | Description |
| ----- | ---- | ------- | ----------- |
| `enabled` | `boolean` | `true` | Set `{ enabled: false }` to disable spacing entirely. |
| `intervalsMs` | `Partial<Record<OperationCategory, number>>` | `{}` | Per-category minimum-interval overrides (ms). |

Default minimum interval per category:

| Category | Default interval (ms) |
| -------- | --------------------- |
| `group.create` | `60000` |
| `group.join` | `30000` |
| `group.participants` | `10000` |
| `group.update` | `3000` |
| `community.create` | `120000` |
| `community.join` | `30000` |
| `community.update` | `3000` |
| `newsletter.create` | `120000` |
| `newsletter.follow` | `2000` |
| `newsletter.update` | `3000` |

The affected methods are `client.group.create` / `addMember` / `removeMember` / `promote` / `demote` /
`acceptInvite`, `client.community.create` / `createGroup` / `acceptInvite`, and
`client.newsletter.create` / `follow` / `unfollow`.

```typescript

const client = new Client({
  operationGuard: {
    intervalsMs: {
      'group.participants': 15_000, // slow member adds down even further
    },
  },
})
```

  Mass group joins / creates / member-adds on a fresh number are a fast path to a ban. Leaving
  `operationGuard` on (the default) keeps those calls spaced out automatically. Disable with
  `{ enabled: false }` only if you handle pacing yourself.

## `presence`

`presence` drops duplicate presence updates. A repeated `client.presence.typing(jid)` /
`recording(jid)` / `online()` for the **same** `(type, chat)` within `minIntervalMs` is silently
dropped (no socket call); different chats are independent.

| Field | Type | Default | Description |
| ----- | ---- | ------- | ----------- |
| `enabled` | `boolean` | `true` | Set `{ enabled: false }` to send every presence update. |
| `minIntervalMs` | `number` | `1000` | Window within which a repeated presence update for the same chat is dropped. |

```typescript

const client = new Client({
  presence: { minIntervalMs: 1000 },
})
```

  Spamming presence updates (e.g. emitting "typing…" on every keystroke) is needless socket traffic
  that contributes to looking abusive. Throttling is on by default; disable it with
  `{ enabled: false }` if you need every update through.

## `scheduleRateLimitPerSec`

Caps how many scheduled messages are dispatched per second (default `1`; set `0` to disable). If many
overdue scheduled jobs come due at the same instant — for example right after `loadPending()` replays
a backlog — they no longer all fire simultaneously, which would otherwise look like a burst of
automated sends.

```typescript

const client = new Client({
  scheduleRateLimitPerSec: 1, // at most one scheduled message per second
})
```

  Smoothing the scheduler's output spreads a backlog over time instead of blasting it at once. Set
  `scheduleRateLimitPerSec: 0` only if you explicitly want every due job to fire immediately.

## `autoConnect`

With the default `true`, the constructor schedules `connect()` on the next microtask, so simply
constructing a `Client` starts connecting. Set it to `false` to register listeners first (or do
setup work) and connect explicitly.

```typescript

const client = new Client({ autoConnect: false })

client.on('qr', ({ qrString }) => console.log('Scan:', qrString))
client.on('connect', ({ me }) => console.log('Ready as', me.id))

await client.connect()
```

  Under auto-connect, an early connection failure is reported through the `error` event (only if you
  have an `error` listener). With manual connect, the rejected `connect()` promise is yours to catch.

## `qrTerminal`

Controls whether the QR code is rendered to the terminal. The `qr` event still fires either way, so
disable this when you render the QR yourself (e.g. in a web UI) and do not want terminal output.

```typescript

// Emit the QR event only; do not draw it in the terminal.
const client = new Client({ qrTerminal: false })

client.on('qr', ({ qrString }) => renderInBrowser(qrString))
```

## `statusLog`

When `true` (default), zaileys writes concise connection status lines (connecting, qr, pairing-code,
connected, reconnecting, disconnect) to `stderr`, and suppresses noisy libsignal log output. Set it
to `false` for completely silent operation when you handle status via events instead.

```typescript

const client = new Client({ statusLog: false }) // no stderr status lines
```

## `cacheSignal`

When `true` (default), the client wraps your `auth` store in an in-memory cache for signal keys on
the first `connect()`, reducing repeated reads from disk/DB. Disable it if your adapter already
caches or you need every read to hit the backing store.

```typescript

const client = new Client({ cacheSignal: false })
```

## `baileys`

Escape hatch for advanced Baileys socket configuration. Your object is spread into the internal
config **after** the safety defaults `markOnlineOnConnect: false`, `syncFullHistory: false`, and
`qrTimeout: 60000` — so you can override those three — and **before** the managed `auth` and
`logger`, which you cannot.

```typescript

const client = new Client({
  baileys: {
    browser: ['zaileys', 'Chrome', '1.0.0'],
    syncFullHistory: false,
  },
})
```

  Do not set `auth` or `logger` here — the client forces them and your values are ignored. Use the
  top-level `auth` / `store` / `logger` options instead. `markOnlineOnConnect`, `syncFullHistory`,
  and `qrTimeout` are merely internal defaults you *can* override here if you really need to.

## `autoRejectCall`

🔗 **Unofficial provider only.** The official [Cloud API](/official) has no call events — calling
`client.rejectCall()` there throws `ZaileysProviderError('UNSUPPORTED_ON_CLOUD')`, and this option is
never wired.

Auto-reject incoming voice/video calls. **Off by default** — rejecting calls is opt-in.

```typescript
// reject every incoming call
const client = new Client({ autoRejectCall: true })
```

| Field | Type | Default | Description |
| --- | --- | --- | --- |
| `enabled` | `boolean` | `false` | Turn auto-rejecting on. Passing `autoRejectCall: true` is shorthand for `{ enabled: true }`. |
| `allow` | `string[] \| (jid: string) => boolean \| Promise<boolean>` | `undefined` | Callers to let ring. Array entries match the full jid **or** its digits. A predicate may be async. |
| `onReject` | `(call) => void \| Promise<void>` | `undefined` | Runs **after** a call was successfully rejected — e.g. to tell the caller why. |

```typescript
const client = new Client({
  autoRejectCall: {
    enabled: true,
    allow: ['628owner@s.whatsapp.net'],            // owner may still call
    onReject: async (call) => {
      await client.send(call.from).text('Maaf, nomor ini tidak menerima telepon 🙏')
    },
  },
})
```

The `call` passed to `onReject` is the same `call-incoming` payload:
`{ kind, callId, from, isGroup, isVideo, timestamp, status }` — so you can branch on `isVideo` /
`isGroup` inside your hook or inside `allow`.

### Rejecting manually

Leave the option off and drive it yourself from the [`call-incoming`](/events) event:

```typescript
client.on('call-incoming', async (call) => {
  if (call.isVideo) await client.rejectCall(call)   // pass the payload…
  else await client.rejectCall(call.callId, call.from) // …or the raw ids
})
```

`onReject` and `allow` failures are caught and logged — a throwing hook never crashes the client.
`client.rejectCall()` **does** throw (e.g. `NOT_CONNECTED`) so you can handle it.

## `autoDelete`

`autoDelete` periodically prunes old messages from the local store to keep memory usage bounded. It is
**enabled by default** with a 1-month retention window — no configuration needed unless you want to
change the defaults. Pass `false` to disable pruning entirely, or supply an `AutoDeleteOptions` object
to override individual fields.

| Field | Type | Default | Description |
| ----- | ---- | ------- | ----------- |
| `maxAgeMs` | `number` | `2592000000` (30 days) | Messages older than this are pruned. |
| `maxPerChat` | `number` | `undefined` | If set, keeps at most this many messages per chat (oldest removed first). |
| `intervalMs` | `number` | `60000` | How often the cleanup job runs (ms). |
| `chats` | `string[]` | `undefined` | Restrict pruning to specific chat JIDs. When omitted, all chats are pruned. |

```typescript

// Disable auto-delete entirely.
const client = new Client({ autoDelete: false })

// Override: keep messages for 7 days, run cleanup every 5 minutes.
const client2 = new Client({
  autoDelete: {
    maxAgeMs: 7 * 24 * 60 * 60 * 1000,
    intervalMs: 5 * 60 * 1000,
  },
})
```

  Auto-delete only cleans the **local store** — it never deletes messages on WhatsApp itself. Your
  chat history on other devices is unaffected.

Full guide: [Auto-Delete](/auto-delete)

## `plugins`

`plugins` enables loading and hot-reloading plugin modules from a directory. When omitted (default),
no plugins are loaded. Set it to an object with at least `dir` to activate the plugin system;
`watch` defaults to `true` so code changes are picked up without a restart during development.

| Field | Type | Default | Description |
| ----- | ---- | ------- | ----------- |
| `dir` | `string` | `'./plugins'` | Directory to scan for plugin modules. |
| `watch` | `boolean` | `true` | Hot-reload plugins when files in `dir` change. |
| `pattern` | `string \| RegExp` | `undefined` | Glob/regex filter — only matching files are loaded. |
| `ignore` | `string \| RegExp` | `undefined` | Glob/regex of files to skip. |
| `onError` | `(err: Error) => void` | `undefined` | Called when a plugin throws on load or reload. |

```typescript

const client = new Client({
  plugins: { dir: './plugins' },
})
```

  `watch` is `true` by default, which is ideal during development. Set `watch: false` in production
  to avoid the filesystem watcher overhead.

Full guide: [Plugins](/plugins)

## Fully-configured example

A `Client` exercising the full surface of `ClientOptions`:

```typescript

const client = new Client({
  sessionId: 'production-bot',
  authType: 'pairing',
  phoneNumber: '628xxxxxxxxxx',
  auth: new SqliteAuthStore({ database: './zaileys.db' }),
  store: new SqliteMessageStore({ database: './zaileys.db' }),
  commandPrefix: ['/', '!'],
  ignoreMe: true,
  citation: {
    authors: ['628xxx@s.whatsapp.net'],
    banned: (jid) => jid.startsWith('62800'),
  },
  reconnect: {
    maxAttempts: 20,
    initialDelayMs: 3000,
    maxDelayMs: 30000,
    jitterFactor: 0.25,
    rateLimitedDelayMs: 300_000,
  },
  authGuard: { maxQrAttempts: 5, maxPairingAttempts: 3 },
  operationGuard: { enabled: true },
  presence: { minIntervalMs: 1000 },
  scheduleRateLimitPerSec: 1,
  autoConnect: true,
  qrTerminal: false,
  statusLog: true,
  cacheSignal: true,
  logger: {
    info: (...a) => console.log('[info]', ...a),
    warn: (...a) => console.warn('[warn]', ...a),
    error: (...a) => console.error('[error]', ...a),
  },
  baileys: {
    browser: ['zaileys', 'Chrome', '1.0.0'],
  },
})

client.on('pairing-code', ({ code }) => console.log('Pairing code:', code))
client.on('connect', ({ me }) => console.log('Connected as', me.id))

client.command('ping', async (ctx) => {
  await ctx.reply('pong')
})
```

## Which options unlock which features

| Goal | Option(s) |
| ---- | --------- |
| Enable the [command router](/commands) | `commandPrefix` |
| Persist auth/messages across restarts | `auth`, `store` → [Storage Adapters](/storage) |
| Log in without scanning a QR | `authType: 'pairing'` + `phoneNumber` |
| Render the QR in your own UI | `qrTerminal: false` + listen for the [`qr` event](/events) |
| Run multiple accounts in one process | one `Client` per unique `sessionId` |
| Quiet operation | `statusLog: false`, default `silent` logger |
| Connect on your own schedule | `autoConnect: false` + `await client.connect()` |
| Per-message author/ban checks | `citation` → [Events](/events) |
| Avoid WhatsApp spam restriction / ban | `authGuard`, `operationGuard`, `presence` (on by default) |

## See also

- [Client & Lifecycle](/client) — connecting, events, sending, domain namespaces
- [Events](/events) — full event payloads and message context
- [Commands](/commands) — the framework `commandPrefix` enables
- [Storage Adapters](/storage) — every `auth` / `store` adapter and its options
