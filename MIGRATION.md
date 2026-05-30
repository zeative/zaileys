# Migrating from Zaileys v3 to v4

Zaileys **v4.0.0 is a complete rewrite** — a clean break from the v3.x API. There is no
backward-compatibility shim; the public surface was redesigned around typed events, a
chainable builder, an auto-connect lifecycle, and pluggable storage. This guide maps every
v3 concept to its v4 replacement with side-by-side snippets.

It also tracks the underlying upgrade to **Baileys `7.0.0-rc13`** (from `7.0.0-rc.9`),
which patches the critical message-spoofing vulnerability **CVE-2026-48063**. See
[SECURITY.md](./SECURITY.md) for details.

## Breaking changes at a glance

| Area              | v3                                                | v4                                                                  |
| ----------------- | ------------------------------------------------- | ------------------------------------------------------------------- |
| Connect           | `new Client({...})` + implicit connect            | `new Client({...})` **auto-connects** on construction               |
| Session option    | `session: 'zaileys'`                              | `sessionId: 'zaileys'`                                              |
| Command prefix    | `prefix: '/'`                                      | `commandPrefix: '/' \| ['/', '!']`                                  |
| Pairing number    | `phoneNumber: 6280000000` (number)                | `phoneNumber: '6280000000'` (string)                                |
| Inbound events    | single raw `wa.on('messages', ctx => ...)`        | typed per-event `client.on('text' \| 'image' \| ...)`               |
| Message ctx       | `ctx.text`, `ctx.roomId`, `ctx.isFromMe`          | `msg.content`, `msg.jid`, `msg.fromMe`                              |
| Sending           | `wa.send(jid, { text, image, ... })` object spread| chainable `client.send(jid).text(...).image(...)`                   |
| Buttons           | `wa.button(jid, {...})`                            | `client.send(jid).buttons([...])` / `.list({...})`                  |
| Reactions         | `wa.reaction(msg, '👍')`                          | `client.react(key, '👍')`                                          |
| Edit / delete     | `wa.edit(msg, text)` / `wa.delete(msg)`           | `client.edit(key).text(...)` / `client.delete(key, {...})`          |
| Storage           | implicit file-based LMDB store                    | explicit pluggable `AuthStore` + `MessageStore` (file/sqlite/redis/pg) |
| Plugins           | `definePlugins(...)` + `plugins/` dir + HMR       | command framework: `client.command(name, handler)` + `client.use(mw)` |
| Logs              | `showLogs`, `fancyLogs`                           | `logger` option (structural, pino-compatible)                       |
| FFmpeg            | bundled, `disableFFmpeg`                          | native media handling; no bundled FFmpeg flag                       |

## 1. Client instantiation

v3 constructed the client and connected implicitly with a large options bag.

**v3**

```typescript
import { Client } from 'zaileys'

const wa = new Client({
  session: 'zaileys',
  authType: 'qr',
  prefix: '/',
  showLogs: true,
  fancyLogs: false,
})
```

**v4** — the client **auto-connects** on construction (no separate connect call). Register
handlers synchronously and they fire as soon as the connection comes up.

```typescript
import { Client } from 'zaileys'

const client = new Client({
  sessionId: 'zaileys',
  authType: 'qr',
  commandPrefix: '/',
})
```

Pairing-code auth now takes the phone number as a **string**:

```typescript
// v3
const wa = new Client({ authType: 'pairing', phoneNumber: 6280000000 })

// v4
const client = new Client({ authType: 'pairing', phoneNumber: '6280000000' })
```

If you need manual control over when the socket opens, disable auto-connect:

```typescript
const client = new Client({ autoConnect: false })
await client.connect()
```

## 2. Event model

v3 used a single raw `messages` event with a wide context object you had to inspect.

**v3**

```typescript
wa.on('messages', async (ctx) => {
  if (ctx.text === 'ping') {
    await wa.send(ctx.roomId, 'Pong!')
  }
  if (ctx.isFromMe) return
})
```

**v4** — events are split by type, each with a typed payload. No `if (ctx.chatType === ...)`
branching.

```typescript
client.on('text', async (msg) => {
  if (msg.content === 'ping') {
    await client.send(msg.jid).text('Pong!')
  }
  if (msg.fromMe) return
})

client.on('image', async (msg) => {
  const { buffer } = await msg.download()
})

client.on('reaction', (msg) => console.log(msg.emoji))
```

### Connection lifecycle

**v3** combined connection state into logs and a single `connection` flow. **v4** exposes
discrete typed events:

```typescript
client.on('qr', ({ qrString }) => console.log(qrString))
client.on('pairing-code', ({ code }) => console.log(code))
client.on('connect', ({ me }) => console.log('online as', me.id))
client.on('reconnecting', ({ attempt, delayMs }) => console.log('retry', attempt, 'in', delayMs))
client.on('disconnect', ({ reason, willReconnect }) => console.log(reason, willReconnect))
client.on('error', ({ error }) => console.error(error))
```

New inbound events surfaced in v4 (Baileys rc10–rc13 features): `'group-update'`,
`'group-join'`, `'group-leave'`, `'member-tag'`, `'mention'`, `'mention-all'`,
`'poll-vote'`, `'button-click'`, `'list-select'`, `'history-sync'`, `'limited'` (463
reach-out timelock), `'presence'`, `'call-incoming'`, `'call-ended'`, `'newsletter'`.

## 3. Builder API

v3 sent messages by spreading an options object. v4 uses a chainable builder that returns
the sent `WAMessageKey` when awaited.

**v3**

```typescript
await wa.send(ctx.roomId, { text: 'Hello' })

await wa.send(ctx.roomId, {
  text: 'This is a reply!',
  replied: ctx.message(),
})

await wa.send(ctx.roomId, {
  image: 'https://example.com/image.jpg',
  caption: 'Check this out!',
})
```

**v4**

```typescript
await client.send(jid).text('Hello')

await client.send(jid).text('This is a reply!').reply(quotedKey)

await client.send(jid).image('https://example.com/image.jpg', { caption: 'Check this out!' })
```

Media, polls, location, contacts, and albums are all builder methods:

```typescript
await client.send(jid).video('./clip.mp4', { caption: 'cool' })
await client.send(jid).audio('./voice.ogg', { ptt: true })
await client.send(jid).document('./file.pdf', { fileName: 'file.pdf' })
await client.send(jid).sticker('./art.webp')
await client.send(jid).poll('Favorite color?', ['Red', 'Blue', 'Green'])
await client.send(jid).album([
  { type: 'image', src: './a.jpg' },
  { type: 'video', src: './b.mp4' },
])
```

### Buttons and lists

**v3**

```typescript
await wa.button(ctx.roomId, {
  text: 'Choose an option:',
  buttons: { type: 'simple', data: [{ id: 'btn1', text: 'Option 1' }] },
})
```

**v4**

```typescript
await client.send(jid).buttons([{ id: 'btn1', text: 'Option 1' }])

await client.send(jid).list({
  title: 'Menu',
  sections: [{ title: 'Section', rows: [{ id: 'r1', title: 'Row 1' }] }],
})
```

### Mentions

**v3** auto-detected `@number` strings in text. **v4** is explicit via builder modifiers:

```typescript
await client.send(jid).text('Hi @6281234567890').mentions(['6281234567890@s.whatsapp.net'])
await client.send(groupJid).text('Everyone!').mentionAll()
```

### Edit, delete, react, forward

**v3**

```typescript
const sent = await wa.send(ctx.roomId, 'Original')
await wa.edit(sent, 'Edited')
await wa.delete(sent)
await wa.reaction(ctx.message(), '👍')
await wa.forward(ctx.roomId, { text: 'fwd', isForwardedMany: true })
```

**v4** — these are first-class `Client` methods keyed by `WAMessageKey`:

```typescript
const key = await client.send(jid).text('Original')
await client.edit(key).text('Edited')
await client.delete(key, { forEveryone: true })
await client.react(key, '👍')
await client.forward(key, otherJid)
```

## 4. Storage

v3 stored auth and chat history together implicitly (LMDB). v4 splits storage into two
independent, pluggable interfaces — **`AuthStore`** (credentials + signal data) and
**`MessageStore`** (message/chat history) — so you can, e.g., keep auth in Redis while
messages live in Postgres.

**v3** — implicit, tied to `session`:

```typescript
const wa = new Client({ session: 'zaileys' })
```

**v4** — `file` is the zero-config default; opt into other adapters explicitly:

```typescript
import { Client, SqliteAuthStore, RedisMessageStore } from 'zaileys'

const client = new Client({
  sessionId: 'zaileys',
  auth: new SqliteAuthStore({ database: './auth.db' }),
  store: new RedisMessageStore({ url: 'redis://localhost:6379' }),
})
```

Available adapters: `FileAuthStore` (default), `MemoryAuthStore`, `SqliteAuthStore`,
`RedisAuthStore`, `PostgresAuthStore`; and `MemoryMessageStore`, `SqliteMessageStore`,
`RedisMessageStore`, `PostgresMessageStore`. The `sqlite`/`redis`/`postgres` adapters
require their optional peer dependency (`better-sqlite3` / `redis` / `pg`).

## 5. Plugins → command framework

v3 auto-loaded files from a `plugins/` directory via `definePlugins` with HMR. v4 replaces
this with an in-process command framework registered on the client.

**v3** — `plugins/hello.ts`:

```typescript
import { definePlugins } from 'zaileys'

export default definePlugins(
  async (wa, ctx) => {
    await wa.send(ctx.messages.roomId, 'Hello from plugin!')
  },
  { matcher: ['/hello'], metadata: { description: 'hello plugin' } },
)
```

**v4** — register commands and middleware directly:

```typescript
const client = new Client({ commandPrefix: ['/', '!'] })

client.use(async (ctx, next) => {
  if (ctx.command === 'admin' && !isAdmin(ctx)) return
  await next()
})

client.command('hello', async (ctx) => {
  await ctx.reply('Hello from a command!')
})

client.command('echo', async (ctx) => {
  await ctx.reply(ctx.args.join(' '))
})
```

The command context (`ctx`) exposes `ctx.command`, parsed `ctx.args`, and helpers
`ctx.reply(...)`, `ctx.react(...)`, and `ctx.edit(...)`.

> The `pluginsDir`, `pluginsHmr`, and `definePlugins` APIs no longer exist. There is no
> file-based plugin loader in v4.

## 6. Removed and renamed v3 APIs

| v3 symbol / option                       | Status in v4 | Replacement                                          |
| ---------------------------------------- | ------------ | ---------------------------------------------------- |
| `session`                                | renamed      | `sessionId`                                          |
| `prefix`                                 | renamed      | `commandPrefix` (accepts `string` or `string[]`)     |
| `phoneNumber: number`                    | retyped      | `phoneNumber: string`                                |
| `showLogs`, `fancyLogs`, `showSpinner`   | removed      | `logger` (structural, pino-compatible)               |
| `disableFFmpeg`                          | removed      | native media handling; no bundled FFmpeg flag        |
| `pluginsDir`, `pluginsHmr`               | removed      | command framework (`command()` / `use()`)            |
| `definePlugins(...)`                     | removed      | `client.command(name, handler)`                      |
| `wa.on('messages', ...)`                 | removed      | typed events: `client.on('text' \| 'image' \| ...)`  |
| `ctx.text`                               | renamed      | `msg.content`                                        |
| `ctx.roomId`                             | renamed      | `msg.jid`                                            |
| `ctx.isFromMe`                           | renamed      | `msg.fromMe`                                         |
| `ctx.senderName`                         | renamed      | `msg.sender.pushName`                                |
| `ctx.message()`                          | replaced     | `msg.key` (a `WAMessageKey`)                         |
| `wa.send(jid, { text, image, ... })`     | replaced     | `client.send(jid).text(...).image(...)` builder      |
| `wa.button(jid, {...})`                  | replaced     | `client.send(jid).buttons([...])` / `.list({...})`   |
| `wa.reaction(msg, emoji)`                | renamed      | `client.react(key, emoji)`                           |
| `wa.edit(msg, text)`                     | replaced     | `client.edit(key).text(text)`                        |
| `wa.delete(msg)`                         | replaced     | `client.delete(key, { forEveryone })`                |
| `wa.forward(jid, {...})`                 | replaced     | `client.forward(key, to)`                            |
| `wa.inject` / `wa.getInjection`          | removed      | use `client.use(mw)` to attach context                |
| `wa.plugins.*` controls                  | removed      | no plugin registry; commands are static              |
| `citation: { premium, banned }`          | removed      | implement authorization in `client.use(...)`         |
| LMDB implicit store                      | replaced     | pluggable `AuthStore` + `MessageStore`               |

## 7. After migrating

- Re-run `npm i zaileys@4` (and the optional peer dep for your chosen storage adapter).
- Delete v3 `plugins/` directories — they are no longer loaded.
- Existing v3 session folders are **not** compatible; expect a fresh QR/pairing on first run.
- Verify your code against the new typed events — TypeScript will flag every renamed field.

Need help? Open an [issue](https://github.com/zeative/zaileys/issues) or check the
[examples/](./examples) directory for full v4 programs.
