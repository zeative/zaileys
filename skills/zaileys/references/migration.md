# Migration and version history

The only file in this skill that names versions. Everything else describes the current v4 API.

## Contents

- Upgrade checklist
- v3 to v4
- Changes within v4, newest first
- 4.15.0 security and session hardening
- 4.8.0 to 4.14.1
- 4.3.0 to 4.7.2

## Upgrade checklist

1. Read the installed version: `node -p "require('./node_modules/zaileys/package.json').version"`. Read the target
   from `npm view zaileys version` or the user's request.
2. Read every entry below between the two versions, and run each entry's detection grep on the project.
3. Upgrade: `npm install zaileys@^4` (or the project's package manager). Stay on the v4 line; this skill targets v4.
4. Apply the fixes, then `npx tsc --noEmit`. Renamed options and fields surface as type errors; behaviour changes
   don't, which is why the greps exist.
5. Relink only when an entry says so (v3 → v4). No v4 upgrade invalidates a stored v4 session.
6. Renaming `sessionId` (for example to satisfy 4.15.0 validation) points the default file store at a new empty
   folder: stop the bot, rename `./.zaileys/auth/<old>` to `./.zaileys/auth/<new>`, then start it.
7. Start the bot, wait for `[zaileys] Connected as …`, and send it a test message from another account.

## v3 to v4

v4.0.0 is a rewrite with no compatibility layer. It moved to Baileys `7.0.0-rc13` (fixing CVE-2026-48063,
message spoofing via `protocolMessage.type`); current v4 uses `7.0.0-rc14`. Node.js 20 or newer.
v3 session data does not work: the first v4 run shows a new QR or pairing code. Remove the old entry under
Linked devices on the phone. The repo's `MIGRATION.md` is outdated (it shows fields such as `msg.content` and
`msg.jid` that don't exist); follow https://zaileys.kejaa.id/releases/migration instead.

| Area | v3 | v4 |
| --- | --- | --- |
| Instance | `const wa = new Client(…)` | `const client = new Client(…)`, still auto-connects (`autoConnect: false` to opt out) |
| Session | `session: 'zaileys'` (default `'zaileys'`) | `sessionId`, default `'default'`, stored in `./.zaileys/auth/<sessionId>` |
| Pairing number | `phoneNumber: 6281234567890` | `phoneNumber: '6281234567890'` |
| Prefix | `prefix: '/'` | `commandPrefix: '/'` (string or array); commands stay off without it |
| Logs | `showLogs`, `fancyLogs`, `showSpinner` | `statusLog` (default `true`), `logger`, `ZAILEYS_DEBUG` |
| Receiving | `wa.on('messages', ctx => …)` | `client.on('message' \| 'text' \| 'image' \| …)`; `text` excludes captions and taps |
| Connection, calls | `connection`, `calls` events | `connect`, `disconnect`, `qr`, `pairing-code`, `reconnecting`, `call-incoming`, `call-ended` |
| Context values | `ctx.replied`, `ctx.roomName`, `ctx.receiverName`, `ctx.text` nullable | `await msg.replied()`, `await msg.roomName()`, `await msg.receiverName()`, `msg.text` is `''` when empty, `msg.roomId` is `string \| null` |
| Sending | `wa.send(roomId, { text, image, replied })` | `client.send(jid).text(…)`, `.image(src, { caption })`, `.reply(msg.message())` |
| Mentions | parsed from `@number` in text | `.mentions([jid])`, `.mentionAll()` |
| Buttons | `wa.button(roomId, {…})` | `.buttons([...], { text, footer })`, `.list({ buttonText, sections })` |
| Mutations | `wa.reaction`, `wa.edit`, `wa.delete`, `wa.forward`, `wa.presence` | `msg.react()`, `client.edit(key).text()`, `client.delete(key)` (one key, for everyone by default), `client.forward(key, to)`, `client.presence.typing(jid)` |
| Storage | built in | `auth` and `store` options; message store defaults to memory |
| Plugins | `definePlugins(fn, { matcher })`, `pluginsDir`, `pluginsHmr` | `definePlugin({ name, message })`, `plugins: { dir, watch }` |
| Injection, citation | `wa.inject()`, `ctx.injection`, any `citation` key | plain variables; `citation: { authors, banned }` only |
| Auto behaviour | `autoRead`, `autoOnline`, `autoPresence`, `autoMentions`, `autoRejectCall` on | removed, except `autoRejectCall` (now off); `autoDelete` on (30 days) |
| Removed | `disableFFmpeg`, `limiter`, `deleteSessionOnLogout`, `autoMarkAI`, `maxReplies`, `fakeReply` | ffmpeg bundled; `broadcast(…, { rateLimitPerSec })`; `logout()` always deletes |
| History sync | `syncFullHistory` on | off; `baileys: { syncFullHistory: true }` |

Detect v3 code: `grep -rnE "wa\.(on|send|button|reaction|edit|delete|forward|presence|inject)|definePlugins|pluginsDir|showLogs|prefix:|session:" --include='*.ts' --include='*.js' .`

<!-- snippet-check: skip — v3 API -->
```ts
const wa = new Client({ session: 'zaileys', authType: 'pairing', phoneNumber: 6281234567890, prefix: '/', showLogs: true })

wa.on('messages', async (ctx) => {
  if (ctx.isFromMe) return
  if (ctx.text === 'ping') await wa.send(ctx.roomId, { text: 'Pong!', replied: ctx.message() })
  await wa.button(ctx.roomId, { text: 'Choose:', buttons: { type: 'simple', data: [{ id: 'a', text: 'A' }] } })
  const sent = await wa.send(ctx.roomId, 'Original')
  await wa.edit(sent, 'Edited')
  await wa.reaction(ctx.message(), '👍')
})
```

```ts
import { Client } from 'zaileys'

const bot = new Client({
  sessionId: 'zaileys',
  authType: 'pairing',
  phoneNumber: '6281234567890',
  commandPrefix: '/',
})

bot.on('text', async (msg) => {
  const chat = msg.roomId ?? msg.senderId
  try {
    if (msg.text === 'ping') await msg.reply('Pong!')
    await bot.send(chat).buttons([{ id: 'a', text: 'A' }], { text: 'Choose:' })
    const key = await bot.send(chat).text('Original')
    await bot.edit(key).text('Edited')
    await msg.react('👍')
  } catch (error) {
    console.error(error)
  }
})
```

Storage, plugins, and citation:

<!-- snippet-check: skip — v3 API -->
```ts
export default definePlugins(async (wa, ctx) => {
  await wa.send(ctx.messages.roomId, 'Hello from plugin!')
}, { matcher: ['/hello'] })

wa.inject('config', { storeName: 'Toko Budi' })
const wa = new Client({ pluginsDir: 'plugins', citation: { premium: async () => [6281234567890] } })
```

```ts
import { Client, definePlugin, RedisMessageStore, SqliteAuthStore } from 'zaileys'

export default definePlugin({
  name: 'hello',
  message: async (ctx) => {
    await ctx.reply('Hello from a plugin!')
  },
})

const config = { storeName: 'Toko Budi' }

const shop = new Client({
  commandPrefix: '/',
  plugins: { dir: './plugins' },
  auth: new SqliteAuthStore({ database: './data/auth.db' }),
  store: new RedisMessageStore({ url: 'redis://localhost:6379' }),
  citation: { authors: ['6281234567890@s.whatsapp.net'], banned: async (jid) => jid.startsWith('62898') },
})

shop.on('text', async (msg) => {
  if (await msg.citation.banned()) return
  await msg.reply(`Welcome to ${config.storeName}`)
})
```

Database stores need their driver installed (`better-sqlite3`, `redis`, `pg`, `convex`). Custom roles such as
premium users become your own lists checked in the handler or in `client.use()` middleware.

## Changes within v4, newest first

Only entries that break code or change behaviour. Additive features are omitted.

**4.16.0:** `htmlApp()` (experimental) was redesigned. Removed: `buildHtmlAppContent`, `HtmlAppDevice`, the `AIRichPart`
re-export, and the options `text`, `footer`, `fallbackUrl`, `fallbackButtonText`, `trustedSources`, and `bypassDownload`.
A non-Android `device` now sends `fallback` as plain text, or throws `INVALID_RECIPIENT` without it, instead of a
webview button. The follow-up edit that skipped the Download prompt is gone because it reloaded the card whenever
the keyboard opened. Detect: `grep -rnE "buildHtmlAppContent|HtmlAppDevice|AIRichPart|fallbackUrl|trustedSources|bypassDownload" src`.
Fix: keep `htmlApp(markup, { title, height, device, fallback })`; move any `text` or `footer` into the page itself.

4.15.1 only fixes animated stickers on ffmpeg 7 and newer; no action.

## 4.15.0 security and session hardening

| Change | What breaks | Detect | Fix |
| --- | --- | --- | --- |
| Signed webhooks required | Cloud webhook POSTs without `appSecret` get `401 webhook requires appSecret (or allowUnsigned for local dev)`; no messages arrive | `grep -rn "provider: *['\"]cloud" .` then check for `appSecret` | Set `cloud.appSecret`. `allowUnsigned: true` only for local development |
| `sessionId` validated | Constructor throws `invalid sessionId "<id>": use 1-64 characters from A-Z a-z 0-9 _ -` | `grep -rn "sessionId" .` — look for `.` `@` `:` `/` spaces, phone JIDs, or length over 64 | Pick a valid id and rename the auth folder to match (checklist step 6) |
| Only explicit logout erases credentials | `bad-session`, `connection-replaced`, `forbidden` no longer delete the session; code expecting a fresh QR after them keeps getting the old session | `grep -rnE "bad-session|connection-replaced|forbidden" .` | Usually nothing — it was data loss. To restore: `session: { clearAuthOn: [...] }` below |
| Media limits and read blocks | Media over 64 MB, from loopback/LAN URLs, or inside the auth directory fails with `MEDIA_LOAD_FAILED` | `grep -rnE "localhost|127\.0\.0\.1|192\.168\.|\.zaileys" .` near sends | `media: { maxBytes, allowPrivateNetwork: true }`; never serve files from the auth folder |
| Decompression and size caps | Images above 50 megapixels throw `Image too large to decode safely`; URL fetches in media helpers cap at 64 MB | Bots processing user-uploaded images | `media.maxImagePixels` for trusted input only |
| Bounded ffmpeg queue | Under load, conversions reject with `ffmpeg queue is full (64 jobs waiting)` or `ffmpeg job waited more than 120000ms for a slot`; jobs are killed after 120 s | Sticker, audio, or video conversion in hot paths | `media: { maxConcurrentFfmpeg, maxQueuedFfmpeg, ffmpegQueueTimeoutMs }`, or catch and reply later |
| `tablePrefix` on SQLite and Postgres stores | Nothing by default — unprefixed tables are used as before | `grep -rnE "(Sqlite|Postgres)(Auth|Message)Store" .` | To share one database between sessions, give each a prefix; adding one to an existing session points it at empty tables, so relink or copy the rows |
| Quoted context `verified` flag | Nothing breaks, but a quote rebuilt from the sender's `contextInfo` has `verified: false` — its text, author, and `isFromMe` are forgeable | `grep -rn "replied()" .` used for permissions | Require `quoted.verified` before trusting a quote |
| Namespace-aware identity checks | A `@lid` never matches a phone-number entry in `citation`, admin checks, or call allow lists | `grep -rn "citation" .` | Write entries as phone JIDs (`…@s.whatsapp.net`), which `senderId` resolves to |
| Plugin watch off in production | Hot reload stops when `NODE_ENV=production` | `grep -rn "plugins:" .` | `plugins: { watch: true }` if really wanted; reload in production lets anyone who can write the folder run code |
| Credentials load before the socket | A failing auth store now rejects `connect()` instead of silently registering a new device | Custom or database auth stores | Fix the store; the error is a `ZaileysStoreError` |
| Re-pair refusal | A QR request for a registered session emits `error` (`WhatsApp asked to pair again while a registered session is stored; aborting to protect it`) and disconnects | `error` listeners | If the device really was unlinked, call `client.logout()` and relink |
| Store `reopen()` and credential backups | `connect()` after `disconnect()` now reopens stores; custom stores without `reopen()` throw `this auth or message store adapter cannot be reopened after disconnect(); …` | `grep -rnE "implements (AuthStore|MessageStore)|AuthCredsStore" .` | Implement `reopen()`; optionally `backupCreds()` and `readBackupCreds()` |
| Scoped `clear()` | `RedisMessageStore.clear()` and `ConvexMessageStore.clear()` no longer log the bot out | — | Remove workarounds that re-linked after clearing history |

Restore the pre-4.15 erase behaviour:

```ts
import { Client } from 'zaileys'

const legacy = new Client({
  session: { clearAuthOn: ['logged-out', 'bad-session', 'connection-replaced', 'forbidden'] },
})
```

Webhook, media, and database options after 4.15.0:

```ts
import { Client, PostgresAuthStore } from 'zaileys'

const cloudBot = new Client({
  provider: 'cloud',
  cloud: {
    accessToken: process.env.WA_TOKEN ?? '',
    phoneNumberId: process.env.WA_PHONE_ID ?? '',
    verifyToken: process.env.WA_VERIFY_TOKEN,
    appSecret: process.env.WA_APP_SECRET,
  },
})

const lanBot = new Client({
  sessionId: 'shop-1',
  media: { allowPrivateNetwork: true, maxBytes: 128 * 1024 * 1024 },
  auth: new PostgresAuthStore({ connectionString: process.env.DATABASE_URL, tablePrefix: 'shop1_' }),
})

lanBot.on('text', async (msg) => {
  const quoted = await msg.replied()
  if (quoted?.verified && quoted.isFromMe && msg.text === '/delete') {
    await msg.reply('Deleting the quoted order')
  }
})
```

## 4.8.0 to 4.14.1

| Version | Change | What breaks | Detect | Fix |
| --- | --- | --- | --- | --- |
| 4.14.1 | Commands run from media captions | A photo captioned `/sticker` now runs the command; bots that also parse captions in an `image` or `message` handler handle it twice | `grep -rnE "on\(['\"](image|video|message)['\"]" .` with prefix checks inside | Remove the manual caption parsing |
| 4.14.0 | `ctx.send(to?)` on command context | Nothing | — | Prefer `ctx.send()` over `ctx.client.send(…)` |
| 4.13.0 | Every send inherits the chat's disappearing timer | Messages sent into a chat with disappearing messages on now vanish too (4.11.2 did this for replies only) | Bots that expect permanent receipts or invoices | No opt-out; `.disappearing(seconds)` overrides with another positive duration. The timer comes from the latest inbound message in that chat |
| 4.12.0 | Plugin handler `command` renamed to `message` | Plugins with `command: async (ctx) => …` compile-error and their command never runs | `grep -rn "command:" plugins` | Rename the key to `message` |
| 4.8.7 | Inbound group statuses decode | `message`, `text`, `image` now fire for group status posts | Command routing on `message`/`text` in groups | `if (msg.isGroupStatus) return` |
| 4.8.7 | Relay content applies modifiers | `.mentions()`, `.mentionAll()`, `.disappearing()` now take effect on buttons, lists, carousels | — | Remove workarounds |
| 4.8.0 | Cloud API provider | Nothing for WhatsApp Web | — | — |

<!-- snippet-check: skip — plugin API before 4.12.0 -->
```ts
export default definePlugin({ name: 'ping', command: async (ctx) => { await ctx.reply('pong') } })
```

```ts
import { definePlugin } from 'zaileys'

export default definePlugin({
  name: 'ping',
  message: async (ctx) => {
    if (ctx.isGroupStatus) return
    await ctx.send().text('pong')
  },
})
```

## 4.3.0 to 4.7.2

| Version | Change | What breaks | Detect | Fix |
| --- | --- | --- | --- | --- |
| 4.7.2 | Spurious `logged-out` right after connect is retried | Nothing; sessions stop disappearing | — | — |
| 4.5.0 | `autoDelete` on by default, 1-month retention | Stored messages older than 30 days are pruned; `forward()` and quotes of old messages stop resolving | `grep -rn "autoDelete" .` (absent means on) | `autoDelete: false`, or `autoDelete: { maxAgeMs }` |
| 4.4.0 | LID-only sender, room, and receiver resolved to phone numbers | IDs saved earlier as `…@lid` no longer match `senderId` | Databases keyed by `senderId` | Normalize saved IDs with `client.lidToPn()` |
| 4.3.0 | `uniqueId` became 16-char uppercase hex; `staticId` added | Saved `uniqueId` values from earlier releases don't match | Databases keyed by `uniqueId` | Re-key, or use `staticId` (stable hash of room and sender) |
