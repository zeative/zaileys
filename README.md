<div align="center">

<img alt="Zaileys - Simplified WhatsApp Node.js TypeScript/JavaScript API" src="https://github.com/zeative/zeative/blob/main/libraries/zaileys/zaileys-clean.png?raw=true" width="140">

<h1 align="center">Zaileys — Simplified WhatsApp Node.js <br /> TypeScript/JavaScript API</h1>

<br>

<div align="center">
  <a href="https://www.npmjs.com/package/zaileys"><img src="https://img.shields.io/npm/v/zaileys.svg" alt="NPM Version"></a>
  <a href="https://www.npmjs.com/package/zaileys"><img src="https://img.shields.io/npm/dw/zaileys?label=npm&color=%23CB3837" alt="NPM Downloads"></a>
  <a href="https://github.com/zeative/zaileys/releases"><img src="https://img.shields.io/npm/dt/zaileys" alt="NPM Downloads"></a>
  <a href="https://github.com/zeative/zaileys/actions"><img src="https://img.shields.io/github/actions/workflow/status/zeative/zaileys/ci.yml?branch=main&label=build" alt="Build Status"></a>
  <a href="https://github.com/zeative/zaileys"><img src="https://img.shields.io/badge/TypeScript-7%20native-blue?style=flat-square&logo=typescript" alt="TypeScript 7"></a>
</div>

<div align="center">
  <a href="https://github.com/zeative/zaileys/blob/main/LICENSE"><img src="https://img.shields.io/github/license/zeative/zaileys" alt="GitHub License"></a>
  <a href="https://discord.gg/KBHhTTVUc5"><img alt="Discord" src="https://img.shields.io/discord/1105833273415962654?logo=discord&label=discord&link=https%3A%2F%2Fgithub.com%2Fzeative%2Fzaileys"></a>
  <a href="https://chat.whatsapp.com/GlQfvc83mSH3F6ov06vuCt"><img alt="WhatsApp" src="https://img.shields.io/badge/WhatsApp-Group-25D366?logo=whatsapp&logoColor=white"></a>
  <a href="https://github.com/zeative/zaileys"><img src="https://img.shields.io/github/stars/zeative/zaileys" alt="GitHub Stars"></a>
  <a href="https://github.com/zeative/zaileys"><img src="https://img.shields.io/github/forks/zeative/zaileys" alt="GitHub Forks"></a>
  <a href="https://deepwiki.com/zeative/zaileys"><img src="https://deepwiki.com/badge.svg" alt="Ask DeepWiki"></a>
</div>

<br>

<div align="center">
  <p>
    <b>Zaileys</b> is a type-safe wrapper around <a href="https://github.com/WhiskeySockets/Baileys">Baileys</a> that makes building WhatsApp bots feel effortless. Construct a <code>Client</code>, listen for typed events, and send rich messages with a chainable builder — auth, reconnect, and storage are handled for you.
  </p>
</div>

<div align="center">

[⚡ Quick Start](#-quick-start) &nbsp;&nbsp;•&nbsp;&nbsp;
[🪶 Highlights](#-highlights) &nbsp;&nbsp;•&nbsp;&nbsp;
[📦 Install](#-install) &nbsp;&nbsp;•&nbsp;&nbsp;
[🎯 Feature Tours](#-feature-tours) &nbsp;&nbsp;•&nbsp;&nbsp;
[🗂️ Storage Adapters](#️-storage-adapters) &nbsp;&nbsp;•&nbsp;&nbsp;
[📚 Docs & Links](#-docs--links)

</div>

</div>

<br>

---

## ⚡ Quick Start

Install, create a `Client`, and you are online. There is no `await connect()` — the client auto-connects on construction, so any `on(...)` handler you register synchronously is wired up before the first event fires.

```typescript
import { Client } from 'zaileys'

const client = new Client()

client.on('qr', ({ qrString }) => console.log('Scan this QR:', qrString))
client.on('connect', ({ me }) => console.log('Connected as', me.id))

client.on('text', async (msg) => {
  await client.send(msg.jid).text('Halo!')
})
```

That is the whole bot. Scan the printed QR with WhatsApp → Linked Devices, and every text message gets a reply.

Prefer a pairing code instead of a QR? Pass your number:

```typescript
const client = new Client({ authType: 'pairing', phoneNumber: '6281234567890' })

client.on('pairing-code', ({ code }) => console.log('Enter this code in WhatsApp:', code))
```

## 🪶 Highlights

- ✅ **Typed events** — `on('text' | 'image' | 'reaction' | 'group-update' | ...)` with fully-typed payloads and IntelliSense. No raw Baileys decoding.
- ✅ **Chainable builder** — `client.send(jid).text(...).reply(quoted).mentions([...])` returns the sent message key when awaited.
- ✅ **Auto auth lifecycle** — QR or pairing-code selected from config, auto-reconnect with backoff, clean logout.
- ✅ **Pluggable storage** — separate `AuthStore` and `MessageStore` interfaces with `file` (default), `sqlite`, `redis`, and `postgres` adapters.
- ✅ **Command framework** — opt-in `client.command('hello', ctx => ...)` with configurable prefix, middleware, and argument parsing.
- ✅ **Automation utilities** — `client.broadcast(jids, builder, { rateLimitPerSec })` and `client.scheduleAt(date, builder)` with built-in rate limiting.
- ✅ **Dual ESM/CJS** — ships both `import` and `require` entry points plus `.d.ts` types.
- ✅ **TypeScript 7 native** — built and type-checked with the native (Go) TypeScript compiler.
- ✅ **Baileys 7.0.0-rc13** — latest upstream, including the CVE-2026-48063 spoofing patch.

## 📦 Install

```bash
npm i zaileys
# or
pnpm add zaileys
# or
yarn add zaileys
```

Requires **Node.js v20+**. The `file` storage adapter is the zero-config default and needs no extra dependencies.

Storage adapters other than `file` rely on optional peer dependencies — install only the one you use:

```bash
npm i better-sqlite3   # for SqliteAuthStore / SqliteMessageStore
npm i redis            # for RedisAuthStore / RedisMessageStore
npm i pg               # for PostgresAuthStore / PostgresMessageStore
```

## 🎯 Feature Tours

### Typed events

Each event has its own typed payload — no manual decoding, no `any`.

```typescript
client.on('text', async (msg) => {
  await client.send(msg.jid).text(`You said: ${msg.content}`)
})

client.on('image', async (msg) => {
  const { buffer } = await msg.download()
  console.log('Got an image of', buffer.length, 'bytes')
})

client.on('reaction', (msg) => console.log(msg.sender.pushName, 'reacted with', msg.emoji))
client.on('group-update', (evt) => console.log('Group changed:', evt.groupId))
```

### Chainable builder

`client.send(jid)` returns a builder. Chain content + modifiers, then `await` to send.

```typescript
await client.send(jid).text('Hello there')

await client
  .send(jid)
  .text('Reply with a mention')
  .reply(quotedKey)
  .mentions(['6281234567890@s.whatsapp.net'])

await client.send(jid).image('https://example.com/photo.jpg', { caption: 'Nice shot' })

await client.send(jid).poll('Pick one', ['Red', 'Green', 'Blue'])

await client.send(jid).album([
  { type: 'image', src: './a.jpg' },
  { type: 'image', src: './b.jpg' },
])
```

Mutate existing messages — every send returns the new `WAMessageKey`:

```typescript
const key = await client.send(jid).text('Original')
await client.edit(key).text('Edited')
await client.react(key, '👍')
await client.delete(key, { forEveryone: true })
await client.forward(key, otherJid)
```

### Command framework

Set a `commandPrefix` to activate commands. Handlers receive a typed context with parsed `args` and reply helpers.

```typescript
const client = new Client({ commandPrefix: ['/', '!'] })

client.use(async (ctx, next) => {
  console.log('command:', ctx.command, 'args:', ctx.args)
  await next()
})

client.command('ping', async (ctx) => {
  await ctx.reply('pong 🏓')
})

client.command('echo', async (ctx) => {
  await ctx.reply(ctx.args.join(' '))
})
```

### Broadcast & schedule

```typescript
await client.broadcast(
  ['6281111111111@s.whatsapp.net', '6282222222222@s.whatsapp.net'],
  (b) => b.text('Announcement to everyone'),
  { rateLimitPerSec: 5 },
)

const job = await client.scheduleAt(new Date(Date.now() + 60_000), (b) =>
  b.text('This sends one minute from now'),
)
```

## 🗂️ Storage Adapters

Auth state and message history use two independent interfaces, so you can mix and match — for example auth in Redis and messages in Postgres.

```typescript
import { Client, SqliteAuthStore, RedisMessageStore } from 'zaileys'

const client = new Client({
  auth: new SqliteAuthStore({ database: './auth.db' }),
  store: new RedisMessageStore({ url: 'redis://localhost:6379' }),
})
```

| Adapter    | Auth store                | Message store          | Peer dependency  |
| ---------- | ------------------------- | ---------------------- | ---------------- |
| `file`     | `FileAuthStore` (default) | —                      | none             |
| `memory`   | `MemoryAuthStore`         | `MemoryMessageStore`   | none             |
| `sqlite`   | `SqliteAuthStore`         | `SqliteMessageStore`   | `better-sqlite3` |
| `redis`    | `RedisAuthStore`          | `RedisMessageStore`    | `redis`          |
| `postgres` | `PostgresAuthStore`       | `PostgresMessageStore` | `pg`             |

## 📚 Docs & Links

- 📖 [**MIGRATION.md**](./MIGRATION.md) — upgrading from v3.x to v4.0.0 (breaking changes, side-by-side snippets)
- 🧪 [**examples/**](./examples) — runnable examples (auto-connect, builder, command bot, broadcast, storage adapters)
- 🔧 [**API Reference**](./docs/api) — generated TypeDoc for the full public surface
- 🤝 [**CONTRIBUTING.md**](./CONTRIBUTING.md) — dev setup, tests, commit convention, release flow
- 🔒 [**SECURITY.md**](./SECURITY.md) — vulnerability disclosure and supported versions
- 📝 [**CHANGELOG.md**](./CHANGELOG.md) — release history

## 🎯 Issues & Feedback

If you hit a problem or have a feature request, open an [issue](https://github.com/zeative/zaileys/issues).

- [Buy me a coffee ☕](https://saweria.co/zaadevofc)
- [Ko-Fi](https://ko-fi.com/zaadevofc)
- [Trakteer](https://trakteer.id/zaadevofc)
- ⭐ Star the repo on GitHub

## 📜 License

Distributed under the **MIT License**. See [`LICENSE`](https://github.com/zeative/zaileys/blob/main/LICENSE) for details.

<div align="left">
  <p>
    <img alt="Zaileys" src="https://github.com/zeative/zeative/blob/main/libraries/zaileys/zaileys-clean.png?raw=true" width="28" align="center">
    Copyright © 2026 zaadevofc. All rights reserved.
  </p>
</div>
