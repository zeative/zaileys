# Simplified WhatsApp API for Node.js & TypeScript

> Source: https://zeative.github.io/zaileys

# Zaileys

**Zaileys** is a type-safe, batteries-included WhatsApp framework built on top of
[Baileys](https://github.com/WhiskeySockets/Baileys). Create a `Client`, listen for fully-typed
events, and send anything — from plain text to interactive buttons, carousels, and Meta-AI-style
rich responses — through a single chainable builder. Authentication, reconnection, media
processing, and storage are handled for you so you can focus on what your bot actually does.

## Hello world

This is a complete, working bot. It connects, prints a QR for you to scan, and echoes every
incoming text message back to the sender.

```typescript

const client = new Client()

client.on('qr', ({ qrString }) => console.log('Scan this QR:', qrString))
client.on('connect', ({ me }) => console.log('Connected as', me.id))

client.on('text', async (msg) => {
  const quoted = await msg.replied()
  if (quoted) console.log('In reply to:', quoted.senderId, '|', quoted.text)

  await msg.reply(`Hello ${msg.senderName ?? ''}! You said: ${msg.text}`)
})
```

Scan the printed QR from **WhatsApp → Linked Devices**, and every text message gets a reply.
That is the whole bot — no boilerplate, no manual decoding, no `any`.

By default the `Client` connects on construction (`autoConnect: true`), so handlers registered
synchronously after `new Client()` are wired up before the first event arrives. You can opt out
with `new Client({ autoConnect: false })` and call `await client.connect()` yourself. See
[Configuration](/configuration) and the [Client](/client) reference.

Prefer a pairing code over scanning a QR? Provide your number:

```typescript
const client = new Client({ authType: 'pairing', phoneNumber: '6281234567890' })

client.on('pairing-code', ({ code }) => console.log('Enter this code on your phone:', code))
```

## Why Zaileys

- **Typed events** — `client.on('text' | 'image' | 'reaction' | 'button-click' | 'group-update' | …)`,
  each with a fully-typed payload and IntelliSense. No raw Baileys decoding, no `any`. See [Events](/events).
- **One chainable builder** — `client.send(jid).text(…).reply(quoted).mentions([…])` resolves to the
  sent message key when awaited. See [Sending Messages](/sending-messages).
- **Auto lifecycle** — QR or pairing-code login, auto-reconnect with backoff, clean logout, and an
  optional `ignoreMe` filter so the bot never replies to itself. See [Configuration](/configuration).
- **Rich & interactive out of the box** — native buttons, lists, and carousels, plus Meta-AI-style
  rich responses written as plain markdown. See [Interactive Messages](/interactive) and
  [Rich Responses](/rich-responses).
- **Command framework** — register `client.command('ping', …)` routers with alias support and
  composable middleware. See [Commands](/commands).
- **Automation** — rate-limited `broadcast()` to many recipients and `scheduleAt()` for timed sends.
  See [Automation](/automation).
- **Pluggable storage** — independent auth and message stores with `file`, `memory`, `sqlite`,
  `redis`, `postgres`, and `convex` adapters. See [Storage Adapters](/storage).
- **Media processing** — lazy image / video / audio / sticker handling, with an optional `sharp`
  accelerator that falls back to a pure-JS path automatically. See [Media](/media).
- **Runs everywhere** — dual ESM/CJS build with `.d.ts` + `.d.cts` types; verified on Node, Bun,
  Deno, and Termux. See [Runtimes](/runtimes).
- **Modern foundation** — Baileys `7.0.0-rc13` (includes the CVE-2026-48063 spoofing patch), built
  and type-checked with the native TypeScript 7 compiler.

## Install

  
```bash
npm i zaileys
```

  
```bash
pnpm add zaileys
```

  
```bash
yarn add zaileys
```

  
```bash
bun add zaileys
```

Requires **Node.js v20+**. The `file` auth store is the zero-config default — nothing else to
install to get started. Other storage backends and the `sharp` media accelerator are optional peer
dependencies; install only the ones you use. Full details on the [Installation](/installation) page.

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

A JID is a WhatsApp address: `628xxxxxxxxxx@s.whatsapp.net` for a person, `xxxxxxxxxx@g.us` for a
group. Inside an event handler you usually just call `msg.reply(…)` or `client.send(msg.senderId)`.

### Interactive messages

Reply, URL, copy, and call buttons — plus lists and carousels — render natively on personal
accounts. Taps come back as typed `button-click` / `list-select` events.

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

See [Interactive Messages](/interactive) for lists, carousels, and every button variant.

### Rich responses, written as markdown

Send ordinary markdown — headings, fenced code, tables, and images — and Zaileys renders it as a
clean Meta-AI-style response.

```typescript
await client.send(jid).text(
  ['*Daily brief* ☕', '', '```ts', "console.log('shipped')", '```'].join('\n'),
  { rich: true },
)
```

See [Rich Responses](/rich-responses) for the full directive set.

### A command router with middleware

```typescript

const client = new Client({ commandPrefix: ['/', '!'] })

const logging: Middleware = async (ctx, next) => {
  console.log(`[command] ${ctx.command} from ${ctx.senderId}`)
  await next()
}

client.use(logging)

client.command('ping', async (ctx) => ctx.reply('pong'))
client.command('weather', async (ctx) => {
  const city = ctx.args[0]
  await ctx.reply(city ? `Weather in ${city}: sunny, 28°` : 'Usage: /weather <city>')
})
```

See [Commands](/commands) for aliases, prefixes, and middleware composition.

### Broadcast and schedule

```typescript
await client.broadcast(
  ['6281111111111@s.whatsapp.net', '6282222222222@s.whatsapp.net'],
  (b) => b.text('Maintenance tonight at 22:00.'),
  { rateLimitPerSec: 5, onProgress: (done, total) => console.log(`${done}/${total}`) },
)

await client.scheduleAt(new Date('2026-12-31T23:59:00'), (b) =>
  b.text('Happy New Year! 🎉'),
)
```

See [Automation](/automation) for rate limiting, progress reporting, and persistent schedules.

## Build your first bot

### Install zaileys

Add the package with your favourite manager (see [Install](#install) above) on Node.js v20+.

### Create a client and register handlers

`new Client()` connects automatically. Register your `qr`, `connect`, and message handlers
immediately after construction.

### Authenticate

Run the script and scan the printed QR from **WhatsApp → Linked Devices**, or pass
`{ authType: 'pairing', phoneNumber }` and enter the `pairing-code`.

### Send and receive

Use `msg.reply(…)` or `client.send(jid)` to respond. Add commands, buttons, and storage as you grow.

The [Getting Started](/getting-started) guide walks through each step in detail.

## Feature matrix

| Capability               | What you get                                                                 | Guide                                  |
| ------------------------ | ---------------------------------------------------------------------------- | -------------------------------------- |
| Connection lifecycle     | Auto-connect, QR + pairing-code login, reconnect with backoff, clean logout  | [Client](/client) · [Config](/configuration) |
| Typed events             | `text`, `image`, `reaction`, `button-click`, `group-update`, and more        | [Events](/events)                      |
| Send builder             | Chainable `text` / `image` / `video` / `audio` / `document` / `poll` / `album` · `reply` · `mentions` | [Sending Messages](/sending-messages)  |
| Media                    | Lazy image/video/audio/sticker processing, optional `sharp` accelerator      | [Media](/media)                        |
| Interactive UI           | Buttons (reply/url/copy/call), lists, carousels                              | [Interactive](/interactive)            |
| Rich responses           | Markdown → Meta-AI-style messages (code, tables, images, directives)         | [Rich Responses](/rich-responses)      |
| Command framework        | `client.command()` routers, aliases, configurable prefixes, middleware       | [Commands](/commands)                  |
| Automation               | Rate-limited `broadcast()`, `scheduleAt()`, presence control                 | [Automation](/automation)              |
| Storage adapters         | `file`, `memory`, `sqlite`, `redis`, `postgres`, `convex` for auth & messages | [Storage](/storage)                    |
| Cross-runtime            | Dual ESM/CJS, full types; Node, Bun, Deno, Termux                            | [Runtimes](/runtimes)                  |

## Next steps

- [Installation](/installation) — requirements, package managers, and optional peer dependencies.
- [Getting Started](/getting-started) — install, authenticate, and run your first bot end-to-end.
- [Configuration](/configuration) — every `ClientOptions` field and its default.
- [Events](/events) — the full event catalogue and payload shapes.
- [Sending Messages](/sending-messages) — the chainable send builder.
- [Interactive Messages](/interactive) and [Rich Responses](/rich-responses).
- [Storage Adapters](/storage) — persist sessions and history.

Looking for runnable code? Every feature has a matching script in the
[`examples/`](https://github.com/zeative/zaileys/tree/main/examples) folder.
