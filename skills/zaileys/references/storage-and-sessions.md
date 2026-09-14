# Storage and sessions

## Contents

- Two stores, two jobs
- Auth stores
- Message stores
- Missing drivers and store errors
- Where the default session lives
- Why a restart asks for a new QR
- Disconnect, logout, and what erases a session
- Backups and recovery
- Several accounts
- Retention and auto-delete
- Keeping sessions out of git and images
- Moving to another store

## Two stores, two jobs

| Option | Holds | Default | Losing it means |
| --- | --- | --- | --- |
| `auth` (`AuthStoreBundle`: `creds` + `signal`) | Login credentials and Signal keys — full account access | `new FileAuthStore({ basePath: './.zaileys/auth/<sessionId>' })` | A new QR or pairing code |
| `store` (`MessageStore`) | Messages, chats, contacts, presence; scheduled jobs on Convex | `new MemoryMessageStore()` | `msg.replied()`, `forward()`, `downloadMedia()` and Baileys retries can't find older messages |

Pair any auth store with any message store. The Cloud API ignores `auth`; `store` still records messages
there. Nothing is encrypted at rest: anyone with the files or rows can use the account.

## Auth stores

All are exported from `zaileys`. Every one implements `reopen()`, so `connect()` after `disconnect()` works
on the same `Client`.

| Class | Constructor options | Needs | Gotcha |
| --- | --- | --- | --- |
| `FileAuthStore` | `{ basePath?: string }` (default `'./.zaileys/auth'` when constructed yourself) | nothing | `basePath` is resolved against the working directory. Files are written atomically with mode `0600`, dirs `0700` |
| `MemoryAuthStore` | none | nothing | Gone on exit — every start shows a QR. Tests only |
| `SqliteAuthStore` | `{ database: string \| Buffer, readonly?, tablePrefix? }` | `better-sqlite3` (^11) | Tables `auth_creds`, `auth_signal`; WAL mode adds `-wal` and `-shm` files |
| `PostgresAuthStore` | `{ connectionString?, pool?, max?, tablePrefix? }` — exactly one of `connectionString`/`pool` | `pg` (^8.11) | Tables `zaileys_auth_creds`, `zaileys_auth_signal`. A `pool` you pass is yours to `end()` |
| `RedisAuthStore` | `{ url?, client?, namespace? }` — exactly one of `url`/`client` | `redis` (^4.7) | Keys `<namespace>:auth:*`; default namespace `'zaileys'`. A passed `client` must already be connected |
| `ConvexAuthStore` | `{ url?, client?, namespace? }` | `convex` (^1) plus the deployed `zaileys:*` functions | `clear()` wipes the **whole namespace** — never share it with a message store |

`tablePrefix` (SQL stores) must match `^[A-Za-z][A-Za-z0-9_]{0,40}$` — so no `-`, even though `sessionId`
allows it. Redis namespaces allow only `A-Z a-z 0-9 _ . : -`. Invalid values throw `STORE_CONNECTION_FAILED`
from the constructor. Without a prefix the original table names are used, so existing databases keep working.

`cacheSignal` (default `true`) wraps the auth store in an in-memory key cache on first connect; leave it on,
it cuts database round-trips per message.

## Message stores

| Class | Options | `listMessages` default limit | Notes |
| --- | --- | --- | --- |
| `MemoryMessageStore` | none | all | Grows with traffic until auto-delete prunes it; empty after restart |
| `SqliteMessageStore` | `{ database, readonly?, tablePrefix? }` | 100 | Tables `messages`, `chats`, `contacts`, `presence` |
| `PostgresMessageStore` | `{ connectionString?, pool?, max?, tablePrefix? }` | 100 | Tables `zaileys_messages`, `zaileys_chats`, `zaileys_contacts`, `zaileys_presence` |
| `RedisMessageStore` | `{ url?, client?, namespace? }` | 100 | Presence keys expire after 300 s; `clear()` only deletes its own key families |
| `ConvexMessageStore` | `{ url?, client?, namespace? }` | all | The only built-in store that persists `scheduleAt()` jobs |

There is no file-based message store. The message store is read through `client.store`
(`listMessages(jid, { limit, before })`, `getMessage(key)`, `listChats()`, `getContact(jid)`,
`getPresence(jid)`); timestamps are Unix **seconds**. Never hand one store instance to two clients: messages
carry no account field.

## Missing drivers and store errors

Drivers are optional peer dependencies loaded on first use, so a missing one fails at connect time — as a
rejected `connect()`, or on the `error` event with `autoConnect`.

| Code | Typical message | Cause and fix |
| --- | --- | --- |
| `STORE_NOT_AVAILABLE` | `better-sqlite3 belum terpasang. Run: pnpm add better-sqlite3` (the text is Indonesian) | Any failure to load `better-sqlite3` — also a native ABI mismatch after a Node.js upgrade. Read `error.cause`; `npm rebuild better-sqlite3` for the latter |
| `STORE_NOT_AVAILABLE` | `pg is not installed. Run: pnpm add pg` | Any failure to import `pg` |
| `STORE_NOT_AVAILABLE` | `redis peer dependency missing. Run: pnpm add redis` / `convex peer dependency missing…` | Module not found. Other import failures become `STORE_CONNECTION_FAILED` `failed to load redis module` |
| `STORE_CONNECTION_FAILED` | `provide either pool or connectionString, not both`, `pass either client OR url, not both`, `provided redis client is not open…`, `invalid tablePrefix …` | Constructor or first-use misconfiguration; the driver error is in `error.cause` |
| `STORE_READ_FAILED` / `STORE_WRITE_FAILED` | `failed to read creds.json`, `redis write failed` | Disk, permissions, database health |
| `STORE_CORRUPTED` | `failed to parse sqlite blob` | A damaged SQLite row |
| `STORE_CLOSED` | `SqliteAuthStore is closed` | The store was used directly after `disconnect()`; `client.connect()` reopens it |

A failed credentials read aborts `connect()` instead of starting a fresh login, so a database outage at boot
doesn't overwrite the session. Credential writes during a session are fire-and-forget: a failure only logs at
`warn`, which the default logger hides — set `ZAILEYS_DEBUG=warn` or pass a `logger` in production.

## Where the default session lives

`new Client({ sessionId: 'shop' })` stores the session in `./.zaileys/auth/shop/` relative to
`process.cwd()`: `creds.json`, `signal/<type>/<id>.json`, and any `creds.revoked-*.json`
snapshots. `sessionId` defaults to `'default'` and must match `^[A-Za-z0-9_-]{1,64}$` (the constructor throws
`invalid sessionId …`) because it becomes part of a path that is later removed recursively. Once you pass
`auth`, `sessionId` no longer picks the folder — `basePath` does.

Pin the location so the process manager, a `cd`, or a container `WORKDIR` can't move it:

```ts
import path from 'node:path'
import { Client, FileAuthStore } from 'zaileys'

const sessionDir = process.env.SESSION_DIR ?? '/var/lib/shop-bot'

const client = new Client({
  sessionId: 'shop',
  auth: new FileAuthStore({ basePath: path.join(sessionDir, 'auth', 'shop') }),
})
```

## Why a restart asks for a new QR

| Cause | Fix |
| --- | --- |
| Started from a different directory (PM2/systemd/IDE run configs set their own cwd) | Absolute `basePath`, or set the working directory explicitly |
| Container without a volume, or a platform with an ephemeral disk | Mount a volume at the session path, or use a database store |
| `sessionId` changed (or was derived from something unstable, like a hostname) | Keep it constant; rename the old folder to the new id |
| `MemoryAuthStore` | Use a persistent store |
| The last run ended with `logged-out` (or a reason you added to `session.clearAuthOn`) | Expected — link again |
| `[zaileys] The saved session looks invalid or corrupted…` after repeated closes before login | Stop the bot, delete that session's folder or rows, link again |

## Disconnect, logout, and what erases a session

| Action or reason | Credentials | Reconnects |
| --- | --- | --- |
| `await client.disconnect()` | Kept; closes the socket, auth and message stores (owned pools/clients too) | No. `connect()` later reopens the stores |
| `await client.logout()` | Snapshot, then erased; the device is unlinked on the phone | No |
| `logged-out` (401) | Erased after a snapshot. If it arrives right after a successful open, zaileys first retries twice, 3 s apart, because WhatsApp sends spurious logouts | No |
| `connection-replaced` (440) | Kept — the creds are valid and in use elsewhere | No |
| `forbidden` (403) | Kept | No |
| `bad-session` (500) | Kept — Baileys maps unknown stream errors to 500, so erasing here destroyed working sessions | Yes |
| `rate-limited` (429) | Kept | Yes, after `reconnect.rateLimitedDelayMs` (300 000) |
| `restart-required`, `connection-closed`, `connection-lost`, `multi-device-mismatch`, `unavailable-service`, `unknown` | Kept | Yes, with backoff |

`session.clearAuthOn` lists the reasons allowed to erase; the default is `DEFAULT_CLEAR_AUTH_REASONS`
(`['logged-out']`). Widen it only when a stuck session is worse than relinking:

```ts
import { Client, DEFAULT_CLEAR_AUTH_REASONS } from 'zaileys'

const client = new Client({
  session: { clearAuthOn: [...DEFAULT_CLEAR_AUTH_REASONS, 'bad-session'] },
})

client.on('disconnect', ({ reason, willReconnect }) => {
  if (reason === 'connection-replaced') console.error('another process is using this session')
  else if (!willReconnect) console.error(`session stopped: ${reason}`)
})
```

The docs pages on sessions still describe the older behaviour (erasing on `connection-replaced`, `forbidden`,
and `bad-session`); trust the table above and the installed `dist/index.d.ts`.

## Backups and recovery

Before any erase, zaileys calls `auth.creds.backupCreds()`. What survives depends on the store, because the
erase then runs `signal.clear()` and `creds.deleteCreds()`:

| Store | Snapshot | Still there after the erase |
| --- | --- | --- |
| File | `creds.revoked-<timestamp>.json` in `basePath` (one per erase, never pruned) | Yes — `clear()` skips them. A corrupt `creds.json` is also read from the newest snapshot |
| Memory | In memory | Until the process exits |
| Redis | `<namespace>:auth:creds-backup` | Yes |
| SQLite, Postgres | Row `id = 'backup'` in the creds table | No — `clear()` deletes every creds row, backup included |
| Convex | Key `creds-backup` | No — `clear()` wipes the namespace |

The snapshot covers `creds` only; Signal keys are gone, so restoring is best effort, and pointless after a
real logout (WhatsApp revoked the device). It exists for erases that shouldn't have happened:

```ts
import { FileAuthStore } from 'zaileys'

const auth = new FileAuthStore({ basePath: '/var/lib/shop-bot/auth/shop' })
const snapshot = await auth.creds.readBackupCreds?.()
if (snapshot) await auth.creds.writeCreds(snapshot)
```

Run that with the bot stopped. For real backups, stop the process (or snapshot the volume/database) and copy
the whole session — a copy taken mid-write can pair new creds with old keys.

## Several accounts

One `Client` per number, each with a unique `sessionId` and its own storage. `msg.channelId` is the
`sessionId` that received a message; reply through that client.

| Store | Separate accounts with |
| --- | --- |
| Default file store | Automatic (`./.zaileys/auth/<sessionId>`); with your own `FileAuthStore`, a distinct `basePath` |
| SQLite, Postgres | `tablePrefix` per account in one database, or separate files/databases/schemas |
| Redis, Convex | A distinct `namespace` per account and per store (`wa:shop:auth`, `wa:shop:history`) |

```ts
import { Client, SqliteAuthStore, SqliteMessageStore } from 'zaileys'

const createAccount = (id: string) => {
  const tablePrefix = `${id.replace(/-/g, '_')}_`
  return new Client({
    sessionId: id,
    auth: new SqliteAuthStore({ database: '/data/whatsapp.db', tablePrefix }),
    store: new SqliteMessageStore({ database: '/data/whatsapp.db', tablePrefix }),
  })
}

const accounts = new Map(['shop', 'support'].map((id) => [id, createAccount(id)]))
```

Start ids with a letter so the prefix is valid. `media` options are process-wide — the last client
constructed wins. One crash stops every account in a process; a process per account isolates them.

## Retention and auto-delete

On WhatsApp Web, `autoDelete` defaults to `{ maxAgeMs: 30 days }`, sweeping every `intervalMs` (60 000) after
the connection opens; your fields merge over the defaults. Options: `maxAgeMs`, `maxPerChat`, `intervalMs`,
`chats: 'all' | (jid) => boolean`; `autoDelete: false` keeps everything. It only prunes zaileys' copy, and uses
`pruneMessages()` when the store has it (all built-ins do), else `deleteMessage()` per message.

- It never runs on the Cloud API, so a long-running Cloud server on `MemoryMessageStore` grows forever —
  prune on a timer yourself, or use a database store.
- `maxPerChat` alone doesn't bound memory: new chats keep adding messages.
- Pruned messages can no longer be quoted, forwarded, or downloaded by key.

```ts
import { Client, SqliteMessageStore } from 'zaileys'

const store = new SqliteMessageStore({ database: '/data/messages.db' })
const client = new Client({
  provider: 'cloud',
  cloud: { accessToken: process.env.WA_TOKEN!, phoneNumberId: process.env.WA_PHONE_ID! },
  store,
})

setInterval(() => {
  const weekAgo = Math.floor(Date.now() / 1000) - 7 * 24 * 60 * 60
  store.pruneMessages({ olderThan: weekAgo }).catch((error) => console.error('prune failed:', error))
}, 60 * 60 * 1000).unref()
```

## Keeping sessions out of git and images

```text
.zaileys/
*.db
*.db-wal
*.db-shm
```

Put the same lines in `.dockerignore`: a session baked into an image leaks with the image and gets shared by
every container started from it. Read database URLs from the environment. Media loading already refuses
paths inside `.zaileys` and the `FileAuthStore` directory; a SQLite session file elsewhere is not protected —
add its folder to `media.deniedDirs`.

## Moving to another store

Simplest: point `auth` at the new store, link again, delete the old folder. To keep the login, stop the bot
and copy `creds` plus every `signal/<type>` entry with `readCreds`/`writeCreds` and `signal.read`/`signal.write`
(file names escape characters outside `[a-zA-Z0-9._-]` as `_` + hex). The full script is at
https://zaileys.kejaa.id/data/storage#move-from-files-to-a-database.
