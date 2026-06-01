<div align="center">

<img alt="Zaileys - Simplified WhatsApp Node.js TypeScript/JavaScript API" src="https://github.com/zeative/zeative/blob/main/libraries/zaileys/zaileys-clean.png?raw=true" width="140">

<h1 align="center">Zaileys — Simplified WhatsApp Node.js <br /> TypeScript/JavaScript API</h1>

<br>

<div align="center">
  <a href="https://www.npmjs.com/package/zaileys"><img src="https://img.shields.io/npm/v/zaileys.svg" alt="NPM Version"></a>
  <a href="https://www.npmjs.com/package/zaileys"><img src="https://img.shields.io/npm/dw/zaileys?label=npm&color=%23CB3837" alt="NPM Downloads"></a>
  <a href="https://github.com/zeative/zaileys/releases"><img src="https://img.shields.io/npm/dt/zaileys" alt="NPM Downloads"></a>
  <a href="https://github.com/zeative/zaileys"><img src="https://img.shields.io/badge/TypeScript-7%20native-blue?style=flat-square&logo=typescript" alt="TypeScript 7"></a>
</div>

<div align="center">
  <a href="https://github.com/zeative/zaileys/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue" alt="License: MIT"></a>
  <a href="https://discord.gg/KBHhTTVUc5"><img alt="Discord" src="https://img.shields.io/discord/1105833273415962654?logo=discord&label=discord&link=https%3A%2F%2Fgithub.com%2Fzeative%2Fzaileys"></a>
  <a href="https://chat.whatsapp.com/GlQfvc83mSH3F6ov06vuCt"><img alt="WhatsApp" src="https://img.shields.io/badge/WhatsApp-Group-25D366?logo=whatsapp&logoColor=white"></a>
  <a href="https://github.com/zeative/zaileys"><img src="https://img.shields.io/github/stars/zeative/zaileys" alt="GitHub Stars"></a>
  <a href="https://github.com/zeative/zaileys"><img src="https://img.shields.io/github/forks/zeative/zaileys" alt="GitHub Forks"></a>
  <a href="https://deepwiki.com/zeative/zaileys"><img src="https://deepwiki.com/badge.svg" alt="Ask DeepWiki"></a>
</div>

<br>

<div align="center">
  <p>
    <b>Zaileys</b> is a type-safe wrapper around <a href="https://github.com/WhiskeySockets/Baileys">Baileys</a> that makes building WhatsApp bots feel effortless. Create a <code>Client</code>, listen for typed events, and send anything from plain text to interactive buttons and rich AI-style responses with a single chainable builder — authentication, reconnection, and storage are handled for you.
  </p>
</div>

<div align="center">

[Quick start](#quick-start) &nbsp;•&nbsp;
[Why Zaileys](#why-zaileys) &nbsp;•&nbsp;
[Install](#install) &nbsp;•&nbsp;
[What you can build](#what-you-can-build) &nbsp;•&nbsp;
[Storage](#storage) &nbsp;•&nbsp;
[Runtimes](#runtime-support) &nbsp;•&nbsp;
[Docs](https://zeative.github.io/zaileys/)

</div>

</div>

<br>

> [!NOTE]
> This README is a **high-level overview**. The complete API reference, guides, and recipes live in the documentation site at **<https://zeative.github.io/zaileys/>**. Runnable code lives in [`examples/`](./examples).

---

## Quick start

There is no `await connect()` — the client connects on construction, so every handler you register synchronously is wired up before the first event arrives.

```typescript
import { Client } from 'zaileys'

const client = new Client()

client.on('qr', ({ qrString }) => console.log('Scan this QR:', qrString))
client.on('connect', ({ me }) => console.log('Connected as', me.id))

client.on('text', async (msg) => {
  await msg.reply(`You said: ${msg.text}`)
})
```

That is the whole bot. Scan the printed QR via **WhatsApp → Linked Devices**, and every text message gets a reply.

Prefer a pairing code? Provide your number:

```typescript
const client = new Client({ authType: 'pairing', phoneNumber: '6281234567890' })
```

## Why Zaileys

- **Typed events** — `on('text' | 'image' | 'reaction' | 'button-click' | 'group-update' | …)` with fully-typed payloads and IntelliSense. No raw Baileys decoding, no `any`.
- **One chainable builder** — `client.send(jid).text(…).reply(quoted).mentions([…])` resolves to the sent message key when awaited.
- **Rich & interactive out of the box** — native buttons, lists, carousels, and Meta-AI-style rich responses written as plain markdown.
- **Auto lifecycle** — QR or pairing-code login, auto-reconnect with backoff, clean logout, optional `ignoreMe`.
- **Pluggable storage** — independent `AuthStore` and `MessageStore` interfaces with `file`, `memory`, `sqlite`, `redis`, `postgres`, and `convex` adapters.
- **Batteries included** — command framework, broadcast with rate limiting, scheduled sends, and lazy media processing (image/video/audio/sticker).
- **Runs everywhere** — dual ESM/CJS with `.d.ts` + `.d.cts` types; verified on Node, Bun, Deno, and Termux.
- **Modern foundation** — Baileys `7.0.0-rc13` (includes the CVE-2026-48063 spoofing patch), built and type-checked with the native (Go) TypeScript 7 compiler.

## Install

```bash
npm i zaileys      # or: pnpm add zaileys  •  yarn add zaileys  •  bun add zaileys
```

Requires **Node.js v20+**. The `file` auth store is the zero-config default and needs nothing else.

Other storage backends are **optional peer dependencies** — install only the one you use:

```bash
npm i better-sqlite3   # sqlite adapters
npm i redis            # redis adapters
npm i pg               # postgres adapters
npm i convex           # convex adapters
```

`sharp` is an optional accelerator for media/sticker processing; without it Zaileys falls back to a pure-JS path automatically.

## What you can build

### Send anything

```typescript
await client.send(jid).text('Hello there')
await client.send(jid).image('https://example.com/photo.jpg', { caption: 'Nice shot' })
await client.send(jid).poll('Pick one', ['Red', 'Green', 'Blue'])
await client.send(jid).album([
  { type: 'image', src: './a.jpg' },
  { type: 'image', src: './b.jpg' },
])
```

### Interactive messages

Reply, URL, copy, call, reminder, location, and address buttons — plus lists and carousels — rendered natively on personal accounts.

```typescript
await client.send(jid).buttons(
  [
    { id: 'yes', text: 'Yes' },
    { type: 'url', text: 'Open docs', url: 'https://github.com/zeative/zaileys' },
    { type: 'copy', text: 'Copy code', code: 'ZAILEYS-2026' },
  ],
  { title: 'Pick one', text: 'Tap a button below' },
)

client.on('button-click', (ctx) => console.log('tapped:', ctx.buttonId))
```

### Rich responses, written as markdown

Toggle `{ rich: true }` and write ordinary markdown — fenced code (syntax-highlighted), tables, images, and `:::` directives for products, suggestions, and more.

```typescript
await client.send(jid).text(
  [
    '*Daily brief* ☕',
    '',
    '```ts',
    "const client = new Client()",
    '```',
    '',
    ':::suggest',
    'See changelog | Upgrade guide',
    ':::',
  ].join('\n'),
  { rich: true, title: '📰 zaileys' },
)
```

### Commands, broadcast & schedule

```typescript
const client = new Client({ commandPrefix: ['/', '!'] })
client.command('ping', (ctx) => ctx.reply('pong 🏓'))

await client.broadcast(jids, (b) => b.text('Announcement'), { rateLimitPerSec: 5 })
await client.scheduleAt(new Date(Date.now() + 60_000), (b) => b.text('Sends in 1 minute'))
```

### Mutate messages

```typescript
const key = await client.send(jid).text('Original')
await client.edit(key).text('Edited')
await client.react(key, '👍')
await client.delete(key, { forEveryone: true })
await client.forward(key, otherJid)
```

## Storage

Auth state and message history use two independent interfaces, so you can mix and match — e.g. auth in SQLite, messages in Redis.

```typescript
import { Client, SqliteAuthStore, RedisMessageStore } from 'zaileys'

const client = new Client({
  auth: new SqliteAuthStore({ database: './auth.db' }),
  store: new RedisMessageStore({ url: 'redis://localhost:6379' }),
})
```

| Adapter    | Auth store          | Message store          | Peer dependency  |
| ---------- | ------------------- | ---------------------- | ---------------- |
| `file`     | `FileAuthStore` ⭐  | —                      | none             |
| `memory`   | `MemoryAuthStore`   | `MemoryMessageStore`   | none             |
| `sqlite`   | `SqliteAuthStore`   | `SqliteMessageStore`   | `better-sqlite3` |
| `redis`    | `RedisAuthStore`    | `RedisMessageStore`    | `redis`          |
| `postgres` | `PostgresAuthStore` | `PostgresMessageStore` | `pg`             |
| `convex`   | `ConvexAuthStore`   | `ConvexMessageStore`   | `convex`         |

> ⭐ default. Convex requires deploying the helper functions in [`examples/convex/`](./examples/convex) — see that folder's README.

## Runtime support

Zaileys ships dual ESM/CJS entry points with type declarations for both module systems, and is verified to load on:

| Runtime | ESM | CJS |
| ------- | --- | --- |
| Node.js `>=20` | ✅ | ✅ |
| Bun | ✅ | ✅ |
| Deno (`--node-modules-dir`) | ✅ | ✅ |
| Termux (Android) | ✅ | ✅ |

Package managers: **npm**, **pnpm**, **yarn**, and **bun** are all supported.

## Documentation

- 🌐 [**zeative.github.io/zaileys**](https://zeative.github.io/zaileys/) — full documentation site: guides, API reference, recipes
- 📦 [**examples/**](./examples) — runnable bots: quickstart, interactive buttons, AIRich, storage adapters, broadcast
- 🔀 [**MIGRATION.md**](./MIGRATION.md) — upgrading from v3.x to v4.0.0 (breaking changes, side-by-side snippets)
- 🤝 [**CONTRIBUTING.md**](./CONTRIBUTING.md) — dev setup, tests, commit convention, release flow
- 🔒 [**SECURITY.md**](./SECURITY.md) — vulnerability disclosure and supported versions
- 📝 [**CHANGELOG.md**](./CHANGELOG.md) — release history

## Issues & feedback

Hit a problem or have a feature request? Open an [issue](https://github.com/zeative/zaileys/issues).

- [Buy me a coffee ☕](https://saweria.co/zaadevofc) • [Ko-Fi](https://ko-fi.com/zaadevofc) • [Trakteer](https://trakteer.id/zaadevofc)
- ⭐ Star the repo on GitHub

## License

Distributed under the **MIT License**. See [`LICENSE`](https://github.com/zeative/zaileys/blob/main/LICENSE) for details.

<div align="left">
  <p>
    <img alt="Zaileys" src="https://github.com/zeative/zeative/blob/main/libraries/zaileys/zaileys-clean.png?raw=true" width="28" align="center">
    Copyright © 2026 zaadevofc. All rights reserved.
  </p>
</div>
