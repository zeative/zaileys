# Multiple Accounts — Running Many WhatsApp Numbers

> Source: https://zeative.github.io/zaileys/multi-account

# Multiple Accounts

Zaileys has no "multi-account mode" — and it doesn't need one. **One `Client` = one account.** Run as
many as you like in one process, mixing providers freely. The whole job is keeping each account's
**session, storage, and lifecycle isolated**.

This page covers the isolation rules (including two sharp edges that silently corrupt sessions), a
production-ready registry pattern, and ban-safety per number.

## The one rule

```typescript

const cs = new Client({ sessionId: 'support' })   // account A
const sales = new Client({ sessionId: 'sales' })  // account B
```

`sessionId` is the isolation key: it namespaces the **default auth folder**
(`./.zaileys/auth/<sessionId>`) and the scheduler. Two clients with different `sessionId`s are fully
independent — separate sockets, separate creds, separate reconnect state.

**`sessionId` only isolates the *default* file auth store.** The moment you pass a custom `auth` or
`store`, isolation becomes *your* responsibility — see the matrix below. Two clients pointed at the
same Postgres database will **overwrite each other's credentials**, even with different `sessionId`s.

## Storage isolation matrix

What actually isolates each backend (verified against the adapters):

| Backend | Isolate with | Shared instance safe? |
| --- | --- | :---: |
| **File** (default auth) | `basePath` — auto-derived from `sessionId` | ✅ isolated by default |
| **Memory** (default store) | a new instance per `Client` (the default) | ✅ if you don't pass one in |
| **SQLite** | a **separate `database` file** per account | ❌ never share one file |
| **Redis** | a distinct **`namespace`** per account | ❌ default is `'zaileys'` for everyone |
| **Convex** | a distinct **`namespace`** per account | ❌ same as Redis |
| **Postgres** | a **separate database or schema** per account | ❌ **no namespace option exists** |

### ⚠️ Postgres: the sharp edge

The Postgres adapters use **fixed table names** (`zaileys_auth_creds`, `zaileys_auth_signal`,
`zaileys_messages`, `zaileys_chats`) and store credentials under a **fixed row id `'default'`**. There
is no namespace/prefix option. Two accounts on the same `connectionString` will:

- **clobber each other's credentials** (both write `id = 'default'`), and
- **mix message history** (rows are keyed by `(remote_jid, id, from_me)` — no account column).

✅ Give each account its own database, or its own **schema** via the connection string:

```typescript
const acctA = new Client({
  sessionId: 'a',
  auth: new PostgresAuthStore({ connectionString: `${BASE}?options=-c%20search_path%3Dacct_a` }),
  store: new PostgresMessageStore({ connectionString: `${BASE}?options=-c%20search_path%3Dacct_a` }),
})
```

(Create the schemas first: `CREATE SCHEMA acct_a; CREATE SCHEMA acct_b;`)

### Redis / Convex: always set a namespace

```typescript
const acctA = new Client({
  sessionId: 'a',
  auth: new RedisAuthStore({ url: REDIS_URL, namespace: 'wa:acct_a' }),
  store: new RedisMessageStore({ url: REDIS_URL, namespace: 'wa:acct_a' }),
})
const acctB = new Client({
  sessionId: 'b',
  auth: new RedisAuthStore({ url: REDIS_URL, namespace: 'wa:acct_b' }),
  store: new RedisMessageStore({ url: REDIS_URL, namespace: 'wa:acct_b' }),
})
```

Both default to `'zaileys'` — leave it out on two accounts and they share one keyspace.

**Never share a single `store` *instance* across clients.** Message keys are
`remoteJid|id|fromMe` — there's no account discriminator, so two accounts talking to the same
contact will read each other's history.

## The registry pattern (recommended)

Don't hand-roll variables per account. Build a small registry — it scales from 2 to 200.

```typescript

export interface Account {
  id: string
  options?: Partial<ClientOptions>
}

const clients = new Map<string, Client>()

export function createAccount({ id, options }: Account): Client {
  if (clients.has(id)) return clients.get(id)!

  const client = new Client({
    sessionId: id,                       // isolates auth dir + scheduler
    autoConnect: false,                  // start them deliberately
    ...options,
  })

  // Tag every log line with the account — you'll need this the first time one misbehaves.
  client.on('connect', ({ me }) => console.log(`[${id}] connected as ${me.id}`))
  client.on('disconnect', ({ reason, willReconnect }) =>
    console.warn(`[${id}] disconnected: ${reason}${willReconnect ? ' (reconnecting)' : ''}`),
  )
  client.on('error', ({ error }) => console.error(`[${id}]`, error))

  clients.set(id, client)
  return client
}

export const getAccount = (id: string): Client | undefined => clients.get(id)
export const allAccounts = (): Client[] => [...clients.values()]
```

### Start them all

```typescript
const ACCOUNTS = ['support', 'sales', 'billing']

for (const id of ACCOUNTS) createAccount({ id })

// connect in parallel, but don't let one failure kill the rest
const results = await Promise.allSettled(allAccounts().map((c) => c.connect()))
results.forEach((r, i) => {
  if (r.status === 'rejected') console.error(`[${ACCOUNTS[i]}] failed to connect:`, r.reason)
})
```

Use `autoConnect: false` for multi-account. The default (`true`) fires `connect()` on the next
microtask, so every account races to authenticate at once — with QR logins that means several QR codes
printed at the same time and no control over order.

### Shut down cleanly

```typescript
async function shutdown() {
  await Promise.allSettled(allAccounts().map((c) => c.disconnect()))
  process.exit(0)
}
process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)
```

`disconnect()` closes the socket **and** the auth/message stores. Skipping it on a DB-backed store can
leave connections dangling.

## Handling messages per account

Handlers are per-client, so keep the account id in scope — never rely on a global "current" client.

```typescript
function wire(id: string, client: Client) {
  client.on('text', async (msg) => {
    if (msg.isFromMe) return
    // reply with the SAME client that received it
    await msg.reply(`[${id}] you said: ${msg.text}`)
  })
}
```

The classic multi-account bug: receiving on account A and replying with `clients.get('b')`. Always
reply via `msg.reply()` or the client that owns the handler.

## Mixing providers

Nothing stops you from running the unofficial and official providers side by side — a common setup is
a personal number for groups and a Cloud API number for campaigns:

```typescript
const community = new Client({ sessionId: 'community' })            // 🔗 groups, polls
const campaigns = new Client({                                       // ☁️ templates, OTP
  provider: 'cloud',
  cloud: { accessToken, phoneNumberId, verifyToken, appSecret },
})
```

Gate provider-specific features so a shared code path doesn't explode — see
[Choose Your Provider](/providers):

```typescript
if (client.provider === 'baileys') await client.group.create('Team', [jid])
else await client.sendTemplate(to, 'welcome', 'en_US')
```

## Cloud: multiple numbers behind one webhook

**Sharp edge.** A Meta app has **one callback URL**, but every phone number on the WABA posts to it.
Zaileys' webhook handler does **not** filter by `metadata.phone_number_id` — feed the same payload to
two clients and **both** will process **both** numbers' messages (duplicate replies).

Route by `phone_number_id` before dispatching:

```typescript
const byPhoneId = new Map<string, Client>([
  [process.env.WA_PHONE_ID_A!, acctA],
  [process.env.WA_PHONE_ID_B!, acctB],
])

// one endpoint, N accounts
export async function POST(req: Request) {
  const raw = await req.text()
  const body = JSON.parse(raw)
  const phoneId = body?.entry?.[0]?.changes?.[0]?.value?.metadata?.phone_number_id
  const client = byPhoneId.get(phoneId)
  if (!client) return new Response('OK', { status: 200 })   // ack unknown numbers, don't 500

  // hand the ORIGINAL raw body over so signature verification still passes
  return client.webhook()(new Request(req.url, { method: 'POST', headers: req.headers, body: raw }))
}
```

Simpler alternative: **one Meta app per number**, each with its own callback URL — then each client
gets a clean endpoint and no routing is needed.

## Ban-safety is per number

Every limit WhatsApp enforces is **per account**, not per app:

- Rate limits, [`broadcast({ rateLimitPerSec })`](/automation), and warm-up all apply **per number**.
  Ten accounts blasting at once is ten numbers at risk, not one.
- On the unofficial provider, a ban hits **one** account — isolation means the others keep running.
  That's an argument for separating a "risky" outreach number from your main support number.
- On cloud, the [quality rating and messaging tier](/official/limits) are per phone number — check each:
  ```typescript
  for (const c of allAccounts()) {
    if (c.provider === 'cloud') console.log(await c.cloud.info())  // quality_rating per number
  }
  ```

## One process or many?

| Approach | Use when | Trade-off |
| --- | --- | --- |
| **All in one process** (registry above) | 2–20 accounts, shared logic | Simplest. One crash takes down every account; all sessions share the event loop + RAM. |
| **Process per account** (pm2/systemd/container) | Accounts must not affect each other; different deploy cadence | Full isolation + independent restarts. More ops overhead; needs distinct storage config per process. |
| **Worker per account** | Many accounts, CPU-heavy media | Isolation without N deploys. More plumbing. |

Each connected `Client` holds its own socket, signal store, and in-memory caches — budget RAM per
account, and prefer a DB-backed store over `MemoryMessageStore` once history matters.

Whatever you pick, keep storage isolation identical. The most common production incident is two
processes (say blue/green, or a stray local run) sharing one Redis namespace or Postgres database and
fighting over the same session — WhatsApp sees a conflict and logs one out.

## Common mistakes

| ❌ Mistake | ✅ Fix |
| --- | --- |
| Two clients → same Postgres `connectionString` | Separate database or `search_path` schema per account |
| Redis/Convex without `namespace` | Distinct `namespace` per account |
| Sharing one `store` instance across clients | One store instance per client |
| Same `sessionId` for two accounts | Unique `sessionId` per account |
| `autoConnect: true` with many QR logins | `autoConnect: false` + connect deliberately |
| Replying with the wrong client | `msg.reply()` / the owning client |
| One cloud webhook fanned out to all clients | Route by `metadata.phone_number_id` |
| `Promise.all` on connect (one failure aborts) | `Promise.allSettled` |
| Exiting without `disconnect()` | Disconnect all on SIGINT/SIGTERM |

## Full example

A runnable two-account script lives in
[`examples/multi-account.ts`](https://github.com/zeative/zaileys/blob/main/examples/multi-account.ts).

```typescript

const ACCOUNTS = ['support', 'sales'] as const
const clients = new Map<string, Client>()

for (const id of ACCOUNTS) {
  const client = new Client({
    sessionId: id,          // → ./.zaileys/auth/<id>, fully isolated
    autoConnect: false,
    autoRejectCall: true,   // no calls on bot numbers
  })

  client.on('qr', ({ qrString }) => console.log(`[${id}] scan:`, qrString))
  client.on('connect', ({ me }) => console.log(`[${id}] online as`, me.id))
  client.on('disconnect', ({ reason }) => console.warn(`[${id}] down:`, reason))
  client.on('text', async (msg) => {
    if (msg.isFromMe) return
    await msg.reply(`Halo dari ${id}!`)
  })

  clients.set(id, client)
}

await Promise.allSettled([...clients.values()].map((c) => c.connect()))

const shutdown = async () => {
  await Promise.allSettled([...clients.values()].map((c) => c.disconnect()))
  process.exit(0)
}
process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)
```

## Next steps

- [Storage Adapters](/storage) — pick and configure a backend per account.
- [Configuration](/configuration) — every `ClientOptions` field.
- [Choose Your Provider](/providers) — mixing unofficial and official numbers.
- [Automation](/automation) — rate-limited broadcast, per number.
