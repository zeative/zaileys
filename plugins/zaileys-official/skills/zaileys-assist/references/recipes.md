# zaileys recipes

Copy-paste cookbook of complete, verified zaileys patterns. Every block is a full runnable program. Import is always `import { Client } from 'zaileys'`.

## Core facts (verified against source)

| Fact | Detail |
| --- | --- |
| Import | `import { Client } from 'zaileys'` |
| `autoConnect` | default `true` — `connect()` is scheduled in a microtask on construction; register handlers synchronously right after `new Client()`. Set `false` to call `await client.connect()` yourself. |
| `connect()` | EXISTS. Returns `Promise<void>` that resolves on first open, rejects if closed before opening. |
| Builder | `client.send(jid)` → set ONE content method (`text`/`image`/`video`/`videoNote`/`audio`/`document`/`sticker`/`location`/`contact`/`poll`/`album`/`buttons`/`template`/`list`/`carousel`/`event`/`groupInvite`/`product`/`requestPhoneNumber`/`sharePhoneNumber`/`limitSharing`) → optional modifiers (`reply`, `mentions`, `mentionAll`, `disappearing`) → `await` resolves to `WAMessageKey`. |
| `message` event | umbrella: `client.on('message', ctx => …)` fires ONCE for any inbound message (any `chatType`), alongside the specific `text`/`image`/… event. Good for one catch-all handler. |
| Send result | awaiting the builder yields a `WAMessageKey`; read `key.id` for the message id. |
| `ignoreMe` | default `true` — bot's own messages are dropped before handlers. Set `false` to receive them. |
| JIDs | user `628xxx@s.whatsapp.net`, group `xxx@g.us`. |
| Default auth | `FileAuthStore` at `./.zaileys/auth/<sessionId>`. Default store: `MemoryMessageStore` (RAM only). |

Message context (`text` handler `msg`): `senderId`, `senderName`, `roomId` (group JID or `null`), `text`, `isGroup`, `isFromMe`, `mentions`, `links`, `timestamp`, `message()` (full `WAMessage`), `await replied()` (quoted `MessageContext | null`), `reply(content, opts?)`, `react(emoji)`. There is no `connecting` event — observe `client.state`.

---

## 1. Minimal connect + echo

When to use: smallest possible working bot — scan QR, reply to every text.

```typescript
import { Client } from 'zaileys'

const client = new Client()

client.on('qr', ({ qrString }) => console.log('Scan QR:', qrString))
client.on('connect', ({ me }) => console.log('Connected as', me.id))

client.on('text', async (msg) => {
  const quoted = await msg.replied()
  if (quoted) console.log('In reply to:', quoted.senderId, '|', quoted.text)
  await client.send(msg.senderId).text(`Halo ${msg.senderName ?? ''}! You said: ${msg.text}`)
})
```

---

## 2. Owner-only bot with sender guard (digitsOf)

When to use: restrict handling to your own number; compare stripped digits, never raw JIDs.

```typescript
import { Client } from 'zaileys'

const digitsOf = (jid: string): string => (jid.split(/[:@]/)[0] ?? '').replace(/\D/g, '')

const OWNER = digitsOf(process.env['OWNER'] ?? '')
if (!OWNER) {
  console.error('Set OWNER (your number), e.g. OWNER=6285xxxx bun run bot.ts')
  process.exit(1)
}

const client = new Client()

client.on('qr', ({ qrString }) => console.log('Scan QR:', qrString))
client.on('connect', ({ me }) => console.log('Connected as', me.id))
client.on('disconnect', ({ reason, willReconnect }) => {
  console.log('Disconnected:', reason, willReconnect ? '(reconnecting)' : '')
})

client.on('text', async (msg) => {
  if (digitsOf(msg.senderId) !== OWNER) return
  await msg.react('👀')
  await msg.reply(`Echo: ${msg.text}`)
})
```

---

## 3. QR vs pairing login

When to use: pick the auth flow. QR is the default; pairing needs an E.164 `phoneNumber` (digits only, no `+`).

```typescript
import { Client } from 'zaileys'

// --- QR (default) ---
const qrClient = new Client({ authType: 'qr', qrTerminal: true }) // qrTerminal:false to render yourself
qrClient.on('qr', ({ qrString, expiresAt }) => {
  console.log('Scan QR:', qrString, '— expires', new Date(expiresAt).toISOString())
})
qrClient.on('connect', ({ me }) => console.log('QR connected as', me.id))

// --- Pairing code ---
const pairClient = new Client({
  authType: 'pairing',
  phoneNumber: '6281234567890', // REQUIRED for pairing; E.164 digits, no '+'
})
pairClient.on('pairing-code', ({ code, expiresAt }) => {
  console.log('Enter in WhatsApp:', code, '— expires', new Date(expiresAt).toISOString())
})
pairClient.on('connect', ({ me }) => console.log('Pairing connected as', me.id))
```

Note: with `authType: 'pairing'` and no `phoneNumber`, `connect()` rejects with `phoneNumber is required when authType is "pairing"`.

---

## 4. Command bot with prefix + middleware + args

When to use: slash-command router. Framework is OFF until you pass `commandPrefix`. Aliases via `|`, subcommands via spaces, longest match wins.

```typescript
import { Client, type Middleware } from 'zaileys'

const client = new Client({ commandPrefix: ['/', '!'] })

client.on('qr', ({ qrString }) => console.log('Scan QR:', qrString))

const logging: Middleware = async (ctx, next) => {
  console.log(`[command] ${ctx.command} from ${ctx.senderId} args=${ctx.args.join(',')}`)
  await next() // call exactly once to continue; skip it to short-circuit
}
client.use(logging)

client.command('ping', async (ctx) => {
  await ctx.reply('pong')
})

client.command('help|h|?', async (ctx) => {
  await ctx.reply('Commands: /ping, /weather <city>, /help')
})

client.command('weather', async (ctx) => {
  const city = ctx.args[0]              // positional args (flags + command words removed)
  const unit = ctx.flags['unit']        // --unit=c  ->  'c'   |   --verbose  ->  true
  if (!city) {
    await ctx.reply('Usage: /weather <city> [--unit=c]')
    return
  }
  await ctx.reply(`Weather in ${city}: sunny, 28${unit === 'f' ? 'F' : 'C'}`)
})

client.on('connect', ({ me }) => console.log('Command bot ready as', me.id))
```

`ctx` extends the message context and adds `command`, `args`, `flags`, `json` (first valid JSON arg), `raw`, `reply`, `react`, `edit` (edits the last `ctx.reply`).

---

## 5. Interactive buttons + handling the click

When to use: reply/CTA buttons. Reply buttons (`{ id, text }`) emit `button-click`; CTA buttons (url/copy/call) act client-side and emit NO event.

```typescript
import { Client } from 'zaileys'

const TO = process.env['TO'] ?? '' // e.g. 628xxx@s.whatsapp.net
const client = new Client()

client.on('qr', ({ qrString }) => console.log('Scan QR:', qrString))

client.on('connect', async () => {
  // Reply buttons (1–10) + mixed CTA in one message
  await client.send(TO).buttons(
    [
      { id: 'yes', text: 'Yes' },
      { id: 'no', text: 'No' },
      { type: 'url', text: 'Docs', url: 'https://github.com/zeative/zaileys', webview: true },
      { type: 'copy', text: 'Copy code', code: 'ZAILEYS-2026' },
      { type: 'call', text: 'Call us', phone: '6287833764462' },
    ],
    { title: 'Mixed buttons', text: 'reply + url + copy + call', footer: 'tap any' },
  )
})

const actions: Record<string, (jid: string) => Promise<unknown>> = {
  yes: (jid) => client.send(jid).text('You said yes!'),
  no: (jid) => client.send(jid).text('Maybe next time.'),
}

client.on('button-click', async (ctx) => {
  console.log('button-click →', ctx.buttonId, ctx.buttonText, 'from', ctx.sender.jid)
  await actions[ctx.buttonId]?.(ctx.sender.jid)
})
```

Other button option keys: `subtitle` (text header), `image`/`video` (media header, provide one), `bottomSheet: { listTitle, buttonTitle, buttonsLimit }`, `limitedTimeOffer: { text, copyCode, expiresAt }` (expiresAt in **seconds**). `.template({ header, body, footer, buttons })` is the ≤3-reply-button shortcut.

---

## 6. List + carousel

When to use: `list` = single-select sheet of rows (≤10 total) → `list-select`. `carousel` = swipeable product cards (≤10), each with own media + buttons.

```typescript
import { Client } from 'zaileys'
import { readFileSync } from 'node:fs'

const TO = process.env['TO'] ?? ''
const client = new Client()

client.on('qr', ({ qrString }) => console.log('Scan QR:', qrString))

client.on('connect', async () => {
  await client.send(TO).list({
    title: '🍔 Menu',
    description: 'Pick your order',
    buttonText: 'View menu', // required
    footerText: 'zaileys',
    sections: [
      { title: 'Food', rows: [{ id: 'pizza', title: 'Pizza', description: '$6' }, { id: 'ramen', title: 'Ramen', description: '$5' }] },
      { title: 'Drinks', rows: [{ id: 'coffee', title: 'Coffee', description: '$2' }] },
    ],
  })

  const img = readFileSync('./pizza.png') // path | URL | Buffer all accepted
  await client.send(TO).carousel(
    [
      { title: 'Pizza Mozzarella', body: '$6', footer: 'zaileys', image: img, buttons: [{ id: 'buy_pizza', text: 'Order' }, { type: 'url', text: 'Detail', url: 'https://github.com/zeative/zaileys' }] },
      { title: 'Ramen Kaldu', body: '$5', footer: 'zaileys', image: img, buttons: [{ id: 'buy_ramen', text: 'Order' }, { type: 'copy', text: 'Promo', code: 'RAMEN5' }] },
    ],
    { text: '🛍️ Product Carousel' },
  )
})

client.on('list-select', (ctx) => {
  console.log('list-select →', ctx.rowId, ctx.title, 'from', ctx.sender.jid)
})
client.on('button-click', (ctx) => console.log('card button →', ctx.buttonId))
```

---

## 7. AIRich markdown response (with directives)

When to use: render Meta-AI-style rich cards from plain markdown. There is NO `aiRich()` method — it is the `{ rich: true }` flag on `.text()`. `TextOptions = { rich?, title?, footer?, sources? }`; `sources` is `Array<[faviconUrl, linkUrl, displayName]>`.

```typescript
import { Client } from 'zaileys'

const TO = process.env['TO'] ?? ''
const client = new Client()

client.on('qr', ({ qrString }) => console.log('Scan QR:', qrString))

client.on('connect', async () => {
  const md = [
    '*Tech Brief* ☕',
    '',
    'Roundup from [zaileys](https://github.com/zeative/zaileys).',  // hyperlink chip
    'Monitored automatically. [](https://github.com/zeative/zaileys)', // empty label = numbered citation
    '',
    'Formula: [E = mc^2|160|44]<https://latex.codecogs.com/png.image?E%20%3D%20mc%5E2>', // LaTeX: [expr|w|h]<imageUrl>
    '',
    '```typescript',
    "import { Client } from 'zaileys'",
    'const client = new Client()',
    '```',
    '',
    '| Repo | Stars |',   // table: header row + |---| separator
    '|---|---|',
    '| zaileys | 12.4k |',
    '',
    '![shot](https://placehold.co/600x800/png)',  // image; consecutive image lines = gallery
    '![shot](https://placehold.co/512x512/png)',
    '',
    ':::video',                                    // directive block
    'https://example.com/clip.mp4 | 10',           // url | durationSeconds
    ':::',
    '',
    ':::product',
    '- title: Sticker Pack | price: Rp35.000 | sale: Rp25.000 | brand: zaileys | image: https://placehold.co/512x512/png | url: https://github.com/zeative/zaileys',
    ':::',
    '',
    ':::tip',
    'Tap an image to open the full preview',
    ':::',
    '',
    ':::suggest',                                  // follow-up pills, split on |
    'See changelog | Upgrade guide | Compare v3 vs v4',
    ':::',
  ].join('\n')

  await client.send(TO).text(md, {
    rich: true,
    title: '📰 zaileys Daily',
    footer: '💡 Dibuat dengan zaileys',
    sources: [['https://avatars.githubusercontent.com/u/9919?s=64', 'https://github.com/zeative/zaileys', 'zaileys on GitHub']],
  })
})
```

Directives: `suggest`, `tip`, `image`, `video`, `product`, `reels`, `post`. Each `:::name` on its own line, body items optionally `-`/`*` prefixed, `key: value` pairs split on `|`, closed by bare `:::`. `product` requires `title` (items without it are dropped). `rich:true` cannot be combined with plain styling on the same call; empty rich content throws.

Rich reply (same options on `msg.reply`):

```typescript
client.on('text', async (msg) => {
  if (msg.text.trim().toLowerCase() === 'rich') {
    await msg.reply(['*Rich reply* ✨', '', ':::suggest', 'Again | Close', ':::'].join('\n'), { rich: true, title: '🤖 zaileys' })
  }
})
```

---

## 8. Send media (image / video / audio / sticker / document)

When to use: any media. `MediaSource = string (path/URL/base64) | Buffer | URL`. Send as-is, or transform first with `Media`.

```typescript
import { Client } from 'zaileys'
import { readFileSync } from 'node:fs'

const TO = process.env['TO'] ?? ''
const client = new Client()

client.on('qr', ({ qrString }) => console.log('Scan QR:', qrString))

client.on('connect', async () => {
  await client.send(TO).image('https://placehold.co/512x512/png', { caption: 'image ✅' })
  await client.send(TO).video(readFileSync('./clip.mp4'), { caption: 'video ✅' })
  await client.send(TO).video(readFileSync('./clip.mp4'), { gifPlayback: true }) // gif
  await client.send(TO).audio(readFileSync('./song.mp3'))
  await client.send(TO).audio(readFileSync('./voice.ogg'), { ptt: true })        // voice note
  await client.send(TO).sticker(readFileSync('./sticker.webp'))
  await client.send(TO).document(readFileSync('./report.pdf'), {
    fileName: 'report.pdf', // required
    mimetype: 'application/pdf',
    caption: 'doc ✅',
  })
  // album (images/videos in one post)
  const img = readFileSync('./photo.png')
  await client.send(TO).album([
    { type: 'image', src: img, caption: 'album 1' },
    { type: 'image', src: img, caption: 'album 2' },
  ])
})
```

Option keys: image `{ caption, viewOnce }`, video `{ caption, gifPlayback, viewOnce }`, audio `{ ptt, seconds }`, document `{ fileName (required), mimetype, caption }`, sticker `{ animated }`. To transform first: `new Media(src).sticker.create()`, `.audio.toOpus()`, `.video.toMp4()`, `.image.toJpeg()` — each returns a `Buffer` you pass to the matching content method.

---

## 9. Reply + mentions + react

When to use: quote a message, tag members, react. `mentions(jids)` requires JIDs with `@`; chain on a content builder. `react`/`reply` available both on `client` and on the `msg` context.

```typescript
import { Client } from 'zaileys'

const client = new Client()

client.on('qr', ({ qrString }) => console.log('Scan QR:', qrString))

client.on('text', async (msg) => {
  // react to the incoming message
  await msg.react('🔥')

  // reply (quotes the incoming message automatically)
  await msg.reply(`Got it, ${msg.senderName ?? 'there'}`)

  // explicit quote + mentions via the send builder
  const target = msg.roomId ?? msg.senderId
  await client
    .send(target)
    .text(`@${msg.senderId.split('@')[0]} noted`)
    .mentions([msg.senderId])
    .reply(msg.message()) // pass full WAMessage or a WAMessageKey

  // react to an arbitrary key
  await client.react(msg.message().key, '👍')
})
```

In groups, `.mentionAll()` tags everyone. `.disappearing(seconds)` sets ephemeral expiry.

---

## 10. Rate-limited broadcast with progress

When to use: one message to many recipients. `build` runs once per recipient; never rejects on per-recipient failure — failures collected in `result.failed`.

```typescript
import { Client } from 'zaileys'

const client = new Client()

client.on('qr', ({ qrString }) => console.log('Scan QR:', qrString))

const recipients = [
  '6281111111111@s.whatsapp.net',
  '6282222222222@s.whatsapp.net',
  '6283333333333@s.whatsapp.net',
]

client.on('connect', async () => {
  const result = await client.broadcast(
    recipients,
    (b) => b.text('Announcement: maintenance tonight at 22:00.'), // any builder content works (image, buttons, …)
    {
      rateLimitPerSec: 5, // global token bucket (default 5)
      retry: { maxRetries: 3, backoffMs: (attempt) => attempt * 1000 }, // optional
      onProgress: (done, total, jid, ok) => {
        console.log(`[${done}/${total}] ${jid} ${ok ? 'sent' : 'failed'}`)
      },
    },
  )
  console.log(`Sent ${result.sent.length}, failed ${result.failed.length}`)
  for (const f of result.failed) console.error(`Failed ${f.jid}: ${f.error.message}`)
})
```

`broadcast()` throws if the socket is not connected — call it inside a `connect`/message handler.

---

## 11. Scheduled send

When to use: queue a message for a future `Date`. The builder is snapshotted at schedule time, so it MUST set a recipient (via `b.to(jid)`) and content immediately.

```typescript
import { Client } from 'zaileys'

const client = new Client()

client.on('qr', ({ qrString }) => console.log('Scan QR:', qrString))

client.on('connect', async () => {
  const job = await client.scheduleAt(
    new Date(Date.now() + 60_000), // 1 minute from now; past dates fire ASAP
    (b) => b.to('6281111111111@s.whatsapp.net').text('This sends in one minute.'),
  )
  console.log('Scheduled job id:', job.id)
  // job.cancel() — cancel before it fires
})
```

Restart-survival of pending jobs requires a store implementing `saveScheduledJob`/`listScheduledJobs`/`deleteScheduledJob` — only `ConvexMessageStore` does today; all others keep jobs in memory only. Invalid `Date` or empty content throws `ZaileysAutomationError` (`SCHEDULE_INVALID`).

---

## 12. Wiring each storage adapter

When to use: persist session (auth) and/or history (store). The two are independent — mix freely. Non-default adapters lazy-load a peer dep (`ZaileysStoreError` `STORE_NOT_AVAILABLE` if missing). Give auth and store **distinct namespaces** when sharing one Redis/Convex backend.

```typescript
import {
  Client,
  FileAuthStore,
  SqliteAuthStore, SqliteMessageStore,
  PostgresAuthStore, PostgresMessageStore,
  RedisAuthStore, RedisMessageStore,
  ConvexAuthStore, ConvexMessageStore,
} from 'zaileys'

// File auth (default) — no peer dep, session under ./.zaileys/auth/<sessionId>
const fileClient = new Client({ auth: new FileAuthStore({ basePath: './.sessions/bot-1' }) })

// SQLite (peer: better-sqlite3) — can share one .db file
const sqliteClient = new Client({
  auth: new SqliteAuthStore({ database: './auth.db' }),
  store: new SqliteMessageStore({ database: './history.db' }),
})

// Postgres (peer: pg) — pass connectionString OR pool (exactly one)
const pgConn = process.env['DATABASE_URL'] ?? ''
const pgClient = new Client({
  auth: new PostgresAuthStore({ connectionString: pgConn, max: 5 }),
  store: new PostgresMessageStore({ connectionString: pgConn }),
})

// Redis (peer: redis) — pass url OR a pre-connected client (exactly one); distinct namespaces
const redisClient = new Client({
  auth: new RedisAuthStore({ url: 'redis://localhost:6379', namespace: 'wa-auth' }),
  store: new RedisMessageStore({ url: 'redis://localhost:6379', namespace: 'wa-store' }),
})

// Convex (peer: convex) — deploy examples/convex/{schema,zaileys}.ts first; supports scheduled jobs
const convexUrl = process.env['CONVEX_URL'] ?? ''
const convexClient = new Client({
  auth: new ConvexAuthStore({ url: convexUrl, namespace: 'wa-auth' }),
  store: new ConvexMessageStore({ url: convexUrl, namespace: 'wa-store' }),
})

// Mix-and-match: durable file auth + fast Redis history
const mixed = new Client({
  auth: new FileAuthStore({ basePath: './.zaileys/auth/main' }),
  store: new RedisMessageStore({ url: 'redis://localhost:6379', namespace: 'wa' }),
})
```

Read methods on any `MessageStore`: `getMessage(key)`, `listMessages(jid, { limit?, before? })` (newest-first), `getChat`/`listChats({ archived? })`, `getContact`/`listContacts`, `getPresence`. Also `MemoryAuthStore` / `MemoryMessageStore` for ephemeral/tests (no persistence). There is no file-backed message store.

---

## 13. Express HTTP gateway

When to use: expose `POST /send` + `GET /health` backed by one WhatsApp client. Gate sends on a `connected` flag.

```typescript
import express, { type Request, type Response } from 'express'
import { Client } from 'zaileys'

const client = new Client()
let connected = false

client.on('qr', ({ qrString }) => console.log('Scan QR:', qrString))
client.on('connect', ({ me }) => { connected = true; console.log('WhatsApp connected as', me.id) })
client.on('disconnect', () => { connected = false })

const app = express()
app.use(express.json())

interface SendBody { jid?: string; text?: string }

app.post('/send', async (req: Request, res: Response) => {
  if (!connected) { res.status(503).json({ error: 'whatsapp not connected' }); return }
  const { jid, text } = req.body as SendBody
  if (!jid || !text) { res.status(400).json({ error: 'jid and text are required' }); return }
  try {
    const key = await client.send(jid).text(text)
    res.json({ ok: true, id: key.id })
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : String(error) })
  }
})

app.get('/health', (_req: Request, res: Response) => res.json({ connected }))

const port = Number(process.env['PORT'] ?? 4252)
app.listen(port, () => console.log(`HTTP send gateway listening on :${port}`))
```

---

## 14. Multi-account

When to use: run several independent sessions in one process. Give each a distinct `sessionId` (separate auth folders) and wire handlers per client.

```typescript
import { Client } from 'zaileys'

const primary = new Client({ sessionId: 'account-a' })
const secondary = new Client({ sessionId: 'account-b' })

primary.on('qr', ({ qrString }) => console.log('[account-a] Scan QR:', qrString))
secondary.on('qr', ({ qrString }) => console.log('[account-b] Scan QR:', qrString))

primary.on('connect', ({ me }) => console.log('[account-a] Connected as', me.id))
secondary.on('connect', ({ me }) => console.log('[account-b] Connected as', me.id))

primary.on('text', async (msg) => {
  if (msg.isFromMe) return
  await primary.send(msg.senderId).text('Reply from account A')
})
secondary.on('text', async (msg) => {
  if (msg.isFromMe) return
  await secondary.send(msg.senderId).text('Reply from account B')
})

process.on('SIGINT', async () => {
  await Promise.all([primary.disconnect(), secondary.disconnect()])
  process.exit(0)
})
```

---

## 15. Graceful shutdown

When to use: clean teardown on SIGINT/SIGTERM. `disconnect()` ends the socket and closes auth + store; `logout()` additionally wipes credentials (forces a fresh QR next run).

```typescript
import { Client } from 'zaileys'

const client = new Client()

client.on('qr', ({ qrString }) => console.log('Scan QR:', qrString))
client.on('connect', ({ me }) => console.log('Connected as', me.id))

const shutdown = async (signal: string): Promise<void> => {
  console.log(`\n${signal} received — shutting down`)
  try {
    await client.disconnect() // use client.logout() to also clear the session
  } finally {
    process.exit(0)
  }
}

process.on('SIGINT', () => void shutdown('SIGINT'))
process.on('SIGTERM', () => void shutdown('SIGTERM'))
```

---

## Diagnostics

| Symptom | Cause | Fix |
| --- | --- | --- |
| `client not connected` on `send()`/`broadcast()` | Called before `connect` event or after disconnect | Send from inside a `connect`/message handler, or `await client.connect()` when `autoConnect:false`. Throws `ZaileysBuilderError`. |
| `phoneNumber is required when authType is "pairing"` | `authType:'pairing'` without `phoneNumber` | Pass E.164 digits (no `+`), e.g. `'6281234567890'`. |
| Handlers never fire for own messages | `ignoreMe` default `true` | Set `new Client({ ignoreMe: false })`. |
| `command()` never triggers | No `commandPrefix` set | Pass `commandPrefix: '/'` (or array). Empty string/array leaves it disabled. |
| `INVALID_OPTIONS` on buttons/list | >10 buttons/rows, >3 template buttons, empty/duplicate id, missing CTA field | Stay within limits; reply ids unique + non-empty; `url` needs `url`, `copy` needs `code`, `call` needs `phone`. Throws `ZaileysBuilderError`. |
| `DUPLICATE_COMMAND` / `INVALID_COMMAND_NAME` | Reused name/alias, or empty spec | Keep names unique across aliases; non-empty spec. `ZaileysCommandError`. |
| `MIDDLEWARE_ERROR: next() called multiple times` | `next()` invoked >1× in one middleware | Call `next()` exactly once, or not at all to short-circuit. |
| `NO_SENT_MESSAGE` on `ctx.edit()` | `edit` before any `ctx.reply()` | Reply first, then edit. `ZaileysCommandError`. |
| `STORE_NOT_AVAILABLE` | Adapter peer dep missing | Install the peer (`better-sqlite3` / `pg` / `redis` / `convex`). `ZaileysStoreError`. |
| `SCHEDULE_INVALID` | Invalid `Date` or builder set no recipient/content | Set `b.to(jid)` + content in the callback; valid `Date`. `ZaileysAutomationError`. |
| Scheduled jobs lost on restart | Store lacks scheduled-job methods | Use `ConvexMessageStore` (only adapter that persists them). |
| `limitedTimeOffer` expiry wildly future | Passed `Date.now()` (ms) | `expiresAt` is **seconds**: `Math.floor(Date.now()/1000) + secs`. |
| Reconnect loop, never `connected` | Corrupt/invalid saved session | Delete `./.zaileys` (or clear the store) and re-authenticate. |

Error classes (all from `zaileys`): `ZaileysBuilderError`, `ZaileysCommandError`, `ZaileysDomainError`, `ZaileysAutomationError`, `ZaileysStoreError`.
