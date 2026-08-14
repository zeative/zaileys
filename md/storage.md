# Storage Adapters

> Source: https://zeative.github.io/zaileys/storage

# Storage Adapters

Zaileys persists two completely independent pieces of state, and you can back each with a different
adapter. Auth lives in an **`AuthStore`** (login credentials + Signal protocol keys) and chat data
lives in a **`MessageStore`** (messages, chats, contacts, presence). They never share a backend
unless you choose to, so you can keep your session in SQLite while streaming message history into
Redis.

```typescript

const client = new Client({
  auth: new SqliteAuthStore({ database: './auth.db' }),
  store: new RedisMessageStore({ url: 'redis://localhost:6379' }),
})
```

If you omit both options, Zaileys uses safe defaults — see [Defaults](#defaults). For where `auth`
and `store` sit among the other client options, see [Configuration](/configuration).

## The two store types

| Concern | Interface | What it holds | When it is written |
| ------- | --------- | ------------- | ------------------ |
| Session | `AuthStore` (a.k.a. `AuthStoreBundle`) | `creds.json`-style credentials + Signal keys (pre-keys, sessions, sender keys, app-state sync keys, …) | On every login and key rotation, by Baileys |
| History | `MessageStore` | Messages, chats, contacts, presence (and optionally scheduled jobs) | Continuously, via socket event listeners |

### AuthStore

An `AuthStore` is a bundle of two sub-stores:

```typescript
interface AuthStoreBundle {
  readonly creds: AuthCredsStore   // readCreds / writeCreds / deleteCreds
  readonly signal: AuthStore       // read / write / delete / clear / close
}
```

You pass an instance to `Client({ auth })`. Zaileys wires it into Baileys' authentication state for
you — you never call `read`/`write` yourself. On a logged-out disconnect (WhatsApp 401/410) Zaileys
calls `clear()` so a stale session is wiped before the next login.

### MessageStore

A `MessageStore` records the conversation as it streams in. After connecting, Zaileys calls
`store.bind(socket)`, which subscribes the store to Baileys events (`messages.upsert`,
`chats.upsert`, `contacts.upsert`, `presence.update`, and where supported `messages.update` /
`chats.update`). From then on you can query it:

```typescript

const store = new SqliteMessageStore({ database: './history.db' })
const client = new Client({ store })

client.on('connect', async () => {
  // newest-first, paginated chat history for one JID
  const recent = await store.listMessages('628123456789@s.whatsapp.net', { limit: 50 })
  console.log(`loaded ${recent.length} messages`)

  const chats = await store.listChats({ archived: false })
  const contacts = await store.listContacts()
  console.log(chats.length, 'chats,', contacts.length, 'contacts')
})
```

Read methods every `MessageStore` exposes:

| Method | Returns | Notes |
| ------ | ------- | ----- |
| `getMessage(key)` | `WAMessage \| undefined` | `key` is a Baileys `WAMessageKey` |
| `listMessages(jid, options?)` | `WAMessage[]` | Newest-first; `options.limit` (default `100`) and `options.before` (timestamp) for paging |
| `getChat(jid)` / `listChats({ archived? })` | `Chat` / `Chat[]` | `archived` filter optional |
| `getContact(jid)` / `listContacts()` | `Contact` / `Contact[]` | |
| `getPresence(jid)` | `PresenceData \| undefined` | |

JIDs follow WhatsApp conventions: individual chats are `628xxx@s.whatsapp.net` and groups are
`xxx@g.us`. `listMessages('…@g.us', …)` works the same for group history.

## Pruning old messages

The auto-delete sweeper (enabled by default — see [Auto-Delete](/auto-delete)) calls two optional
`MessageStore` methods to remove stale messages. All five built-in adapters implement both.

### `pruneMessages(opts)`

```typescript
pruneMessages?(opts: PruneOptions): Promise<number>
```

Deletes messages matching `opts` and returns the number of records deleted. Built-in adapters
execute this as a single efficient query (e.g. a SQL `DELETE WHERE`).

### `deleteMessage(key)`

```typescript
deleteMessage?(key: WAMessageKey): Promise<void>
```

Deletes one message by its Baileys `WAMessageKey`. Used by the sweeper as a fallback when
`pruneMessages` is not implemented — it enumerates and deletes messages individually.

### `PruneOptions`

| Field | Type | Description |
| ----- | ---- | ----------- |
| `olderThan` | `number` | Epoch timestamp in **seconds** (matches the stored `messageTimestamp`). Messages with a timestamp older than this value are deleted. |
| `maxPerChat` | `number` | Keep only the newest N messages per chat. Applied after the age filter. |
| `chatFilter` | `(jid: string) => boolean` | Restrict pruning to chats whose JID passes the predicate. |

All fields are optional — you may pass any combination. When `olderThan` is omitted, only
`maxPerChat` applies (and vice versa).

  `olderThan` is an epoch time in **seconds**, not milliseconds — it maps directly to the
  `messageTimestamp` field stored by Baileys. The auto-delete sweeper converts its `maxAgeMs`
  option to seconds before passing it here: `Math.floor((Date.now() - maxAgeMs) / 1000)`.

Custom stores can participate in auto-delete by implementing `pruneMessages` (preferred — efficient
native query) or at least `deleteMessage` (sweeper falls back to one-by-one deletion). A store that
implements neither causes the sweeper to disable itself with a warning. See [Auto-Delete](/auto-delete)
for the full sweeper behavior.

## Defaults

If you do not pass `auth` / `store`, Zaileys picks:

| Option | Default adapter | Effect |
| ------ | --------------- | ------ |
| `auth` | `FileAuthStore({ basePath: './.zaileys/auth/<sessionId>' })` | Session survives restarts, scoped per `sessionId` |
| `store` | `MemoryMessageStore()` | History kept in RAM only — lost on restart |

```typescript

// auth → ./.zaileys/auth/<sessionId>, store → in-memory
const client = new Client({ sessionId: 'main' })
```

The default message store is **in-memory**: chat history (and any scheduled jobs) vanish when the
process exits. Pick a persistent `store` adapter if you need durable history or restart-safe
[scheduled broadcasts](/automation).

## Available adapters

| Adapter | Auth store | Message store | Peer dependency |
| ------- | ---------- | ------------- | --------------- |
| File | `FileAuthStore` ⭐ | — | none |
| Memory | `MemoryAuthStore` | `MemoryMessageStore` ⭐ | none |
| SQLite | `SqliteAuthStore` | `SqliteMessageStore` | `better-sqlite3` |
| Postgres | `PostgresAuthStore` | `PostgresMessageStore` | `pg` |
| Redis | `RedisAuthStore` | `RedisMessageStore` | `redis` |
| Convex | `ConvexAuthStore` | `ConvexMessageStore` | `convex` |

⭐ = default for that store type. There is **no** file-backed message store — pair `FileAuthStore`
with one of the other message stores (or `MemoryMessageStore`) if you want messages persisted.

Every non-built-in adapter loads its peer lazily. A missing peer throws a `ZaileysStoreError` with
code `STORE_NOT_AVAILABLE` at first use (not at install/import time), so installs never break.
Install peers like any other dependency — see [Installation](/installation).

## File (default auth)

Stores creds and Signal keys as JSON files under `basePath`, using atomic temp-file writes and
`BufferJSON` so binary keys round-trip byte-for-byte. No peer dependency.

| Option | Type | Default | Description |
| ------ | ---- | ------- | ----------- |
| `basePath` | `string` | `'./.zaileys/auth'` | Directory for `creds.json` and `signal/` key files |

```typescript

const client = new Client({
  auth: new FileAuthStore({ basePath: './.sessions/bot-1' }),
})
```

`FileAuthStore` is an auth store only. There is no `FileMessageStore`; if you do not set `store`,
message history stays in memory.

## Memory

Everything lives in process memory and is gone on exit. Ideal for tests, scratch scripts, or
ephemeral workers. No peer dependency, no constructor options.

```typescript

const client = new Client({
  auth: new MemoryAuthStore(),
  store: new MemoryMessageStore(),
})
```

`MemoryAuthStore` does not persist credentials — you re-scan the QR on every restart. Use it only
when that is acceptable.

## SQLite

Embedded single-file database via `better-sqlite3` (WAL mode, prepared statements). Both stores
auto-create their tables on first use. Buffers are stored as `BLOB`s serialized with `BufferJSON`.

**Peer dependency:** `better-sqlite3`

  
```bash
npm i better-sqlite3
```

  
```bash
pnpm add better-sqlite3
```

  
```bash
yarn add better-sqlite3
```

  
```bash
bun add better-sqlite3
```

`SqliteAuthStore` and `SqliteMessageStore` share the same options:

| Option | Type | Default | Description |
| ------ | ---- | ------- | ----------- |
| `database` | `string \| Buffer` | — (required) | Path to the `.db` file (or `:memory:`) |
| `readonly` | `boolean` | `false` | Open the database read-only |

```typescript

const client = new Client({
  auth: new SqliteAuthStore({ database: './auth.db' }),
  store: new SqliteMessageStore({ database: './history.db' }),
})
```

You can point both stores at the **same** `database` file — their tables (`auth_creds`,
`auth_signal`, `messages`, `chats`, `contacts`, `presence`) do not collide.

## Postgres

Backed by `pg`. Tables (`zaileys_auth_creds`, `zaileys_auth_signal`, `zaileys_messages`,
`zaileys_chats`, `zaileys_contacts`, `zaileys_presence`) are created automatically with `jsonb`
payloads and the right indexes.

**Peer dependency:** `pg`

  
```bash
npm i pg
```

  
```bash
pnpm add pg
```

  
```bash
yarn add pg
```

  
```bash
bun add pg
```

Both `PostgresAuthStore` and `PostgresMessageStore` take:

| Option | Type | Default | Description |
| ------ | ---- | ------- | ----------- |
| `connectionString` | `string` | — | Postgres URL; the adapter creates and owns the pool |
| `pool` | `Pool` (from `pg`) | — | A pre-built pool you own and close yourself |
| `max` | `number` | `pg` default | Max pool size (only when `connectionString` is used) |

`connectionString` and `pool` are mutually exclusive — pass exactly one. Passing both, or neither,
throws a `ZaileysStoreError` (`STORE_CONNECTION_FAILED`).

```typescript
// Connection string — the adapter owns the pool lifecycle

const conn = process.env.DATABASE_URL!
const client = new Client({
  auth: new PostgresAuthStore({ connectionString: conn, max: 5 }),
  store: new PostgresMessageStore({ connectionString: conn }),
})
```

```typescript
// Pre-built pool — you own and close it

const pool = new Pool({ connectionString: process.env.DATABASE_URL })
const client = new Client({ auth: new PostgresAuthStore({ pool }) })
// when the store owns the pool it closes it on shutdown; a pool you pass in is yours to end()
```

## Redis

Backed by the `redis` client. Keys are namespaced (`<namespace>:auth:*`, `<namespace>:msg:*`, …) so
multiple sessions can share one Redis instance. Messages use sorted sets for newest-first paging;
presence entries get a short TTL.

**Peer dependency:** `redis`

  
```bash
npm i redis
```

  
```bash
pnpm add redis
```

  
```bash
yarn add redis
```

  
```bash
bun add redis
```

Both `RedisAuthStore` and `RedisMessageStore` take:

| Option | Type | Default | Description |
| ------ | ---- | ------- | ----------- |
| `url` | `string` | — | Redis URL; the adapter creates, connects and owns the client |
| `client` | `RedisClientType` | — | A pre-built, **already-connected** client you own |
| `namespace` | `string` | `'zaileys'` | Key prefix; isolates sessions sharing one server |

`url` and `client` are mutually exclusive — pass exactly one. If you pass a `client`, you must have
already called `await client.connect()`; an unopened client throws `STORE_CONNECTION_FAILED`.

```typescript
// URL — adapter manages the connection

const client = new Client({
  auth: new RedisAuthStore({ url: 'redis://localhost:6379', namespace: 'wa-auth' }),
  store: new RedisMessageStore({ url: 'redis://localhost:6379', namespace: 'wa-store' }),
})
```

```typescript
// Shared, pre-connected client

const redis = createClient({ url: 'redis://localhost:6379' })
await redis.connect()

const client = new Client({
  auth: new RedisAuthStore({ client: redis, namespace: 'wa-auth' }),
  store: new RedisMessageStore({ client: redis, namespace: 'wa-store' }),
})
```

`clear()` only removes keys within the store's `namespace`. When auth and store share one Redis
instance, give them **distinct namespaces** so wiping one (e.g. on logout) does not delete the
other.

## Convex

Convex is a hosted reactive backend reached through **deployed functions**, so unlike the other
adapters it needs a one-time deploy step. Both stores talk to a single `zaileys_kv` table through
the functions `zaileys:get|set|del|clear|list`.

**Peer dependency:** `convex`

### Deploy the functions

In your Convex project, merge the `zaileys_kv` table from
[`examples/convex/schema.ts`](https://github.com/zeative/zaileys/blob/main/examples/convex/schema.ts)
into your `convex/schema.ts`, copy
[`examples/convex/zaileys.ts`](https://github.com/zeative/zaileys/blob/main/examples/convex/zaileys.ts)
into your project as `convex/zaileys.ts`, then deploy:

```bash
npx convex dev   # or: npx convex deploy
```

### Install the peer

  
```bash
npm i convex
```

  
```bash
pnpm add convex
```

  
```bash
yarn add convex
```

  
```bash
bun add convex
```

### Wire it into the Client

```typescript

const url = process.env.CONVEX_URL // e.g. https://your-deployment.convex.cloud

const client = new Client({
  auth: new ConvexAuthStore({ url, namespace: 'wa-auth' }),
  store: new ConvexMessageStore({ url, namespace: 'wa-store' }),
})

client.on('qr', ({ qrString }) => console.log('Scan QR:', qrString))
client.on('connect', ({ me }) => console.log('Connected as', me.id, '— session in Convex'))
```

Both `ConvexAuthStore` and `ConvexMessageStore` take:

| Option | Type | Default | Description |
| ------ | ---- | ------- | ----------- |
| `url` | `string` | — | Convex deployment URL; the adapter builds a `ConvexHttpClient` |
| `client` | `ConvexClientLike` | — | A pre-built Convex client (e.g. `ConvexHttpClient`) you own |
| `namespace` | `string` | `'zaileys'` | Logical partition inside `zaileys_kv` |

Pass a pre-built client instead of a `url` if you already have one:

```typescript

const convex = new ConvexHttpClient(process.env.CONVEX_URL!)
const auth = new ConvexAuthStore({ client: convex, namespace: 'wa-auth' })
const store = new ConvexMessageStore({ client: convex, namespace: 'wa-store' })
```

Use **distinct `namespace` values for auth vs store** when they share one deployment — `clear()`
wipes a whole namespace, and auth `clear()` runs on a 401/410 logout. The full deploy walkthrough
lives in
[`examples/convex/README.md`](https://github.com/zeative/zaileys/blob/main/examples/convex/README.md)
and the runnable script in
[`examples/convex-store.ts`](https://github.com/zeative/zaileys/blob/main/examples/convex-store.ts).

## Scheduled-job persistence

[Scheduled broadcasts](/automation) (`client.schedule(...)`) store a `ScheduledJobRecord` so pending
sends can be re-armed after a restart. This relies on the **message store** implementing the
optional `saveScheduledJob` / `listScheduledJobs` / `deleteScheduledJob` methods.

| Message store | Persists scheduled jobs? |
| ------------- | ------------------------ |
| `ConvexMessageStore` | ✅ Yes |
| `MemoryMessageStore` | ❌ In-memory only |
| `SqliteMessageStore` | ❌ In-memory only |
| `PostgresMessageStore` | ❌ In-memory only |
| `RedisMessageStore` | ❌ In-memory only |

Only `ConvexMessageStore` implements the scheduled-job methods today. With every other message
store, scheduled jobs are held in process memory and are **lost on restart** — the scheduler simply
falls back to its in-memory map. If you need restart-safe schedules, use the Convex store.

## Mixing auth and store adapters

Because the two stores are independent you can mix freely — there is no requirement that they share
a backend.

```typescript

// Session on disk, history in Redis
const client = new Client({
  auth: new FileAuthStore({ basePath: './.zaileys/auth/main' }),
  store: new RedisMessageStore({ url: 'redis://localhost:6379', namespace: 'wa' }),
})
```

```typescript

const pool = new Pool({ connectionString: process.env.DATABASE_URL })
const redis = createClient({ url: 'redis://localhost:6379' })
await redis.connect()

// Durable auth in Postgres, fast history in Redis
const client = new Client({
  auth: new PostgresAuthStore({ pool }),
  store: new RedisMessageStore({ client: redis, namespace: 'wa-store' }),
})
```

## Tips and gotchas

- **Buffers round-trip safely.** Every adapter serializes with `BufferJSON`, so binary Signal keys
  and media references survive storage byte-for-byte.
- **Errors are typed.** Failures throw `ZaileysStoreError` with a `code` such as
  `STORE_NOT_AVAILABLE` (missing peer), `STORE_CONNECTION_FAILED`, `STORE_READ_FAILED`,
  `STORE_WRITE_FAILED`, `STORE_CORRUPTED`, or `STORE_CLOSED`. See [Error handling](/error-handling).
- **Owned vs. provided clients.** When you pass a `url` / `connectionString`, the adapter creates and
  closes the connection for you. When you pass a `client` / `pool`, the lifecycle is yours.
- **`listMessages` paging.** It returns newest-first; pass `before` (a message timestamp) plus
  `limit` to walk backwards through history.
- **Per-session scoping.** The default `FileAuthStore` path includes `sessionId`, so multiple clients
  in one process do not clash. With Redis/Convex use distinct `namespace` values to achieve the same.

See also: [Configuration](/configuration) · [Broadcast & Schedule](/automation) ·
[Installation](/installation).
