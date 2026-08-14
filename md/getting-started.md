# Getting Started

> Source: https://zeative.github.io/zaileys/getting-started

# Getting Started

This guide walks you from an empty folder to a running WhatsApp bot that authenticates, listens for messages, and replies. By the end you will understand QR vs pairing-code login, where the session is stored, and how the connection lifecycle works.

Zaileys requires **Node.js v20+** (it also runs on Bun and Deno — see [Runtime Support](/runtimes)). The default `file` auth store is zero-config and needs no extra dependencies.

## Build your first bot

### Install zaileys

  
```bash
npm install zaileys
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

Storage backends other than `file` are **optional peer dependencies** — install only what you use. `sharp` is an optional accelerator for media/sticker processing; without it Zaileys falls back to a pure-JS path automatically. See [Storage Adapters](/storage) for details.

### Create the client

Create a file (for example `bot.ts`) and construct a `Client`. With the default options, the client begins connecting **immediately on construction** (see [`autoConnect`](#autoconnect-vs-manual-connect) below).

```typescript

const client = new Client()
```

### Register your handlers

Register event listeners **synchronously, right after construction**. Because connection is kicked off in a microtask, any listener you attach in the same tick is wired up before the first event fires.

```typescript

const client = new Client()

client.on('qr', ({ qrString }) => console.log('Scan QR:', qrString))
client.on('connect', ({ me }) => console.log('Connected as', me.id))

client.on('text', async (msg) => {
  await msg.reply(`Echo: ${msg.text}`)
})
```

<StackBlitz
  title="Zaileys — Echo Bot"
  description="Minimal Zaileys echo bot: connect, scan QR, reply to text."
  code={`import { Client } from 'zaileys'

const client = new Client()

client.on('qr', ({ qrString }) => console.log('Scan QR:', qrString))
client.on('connect', ({ me }) => console.log('Connected as', me.id))

client.on('text', async (msg) => {
  await msg.reply(\`Echo: \${msg.text}\`)
})`}
/>

  The StackBlitz sandbox runs in a browser WebContainer — connection, events, and
  text replies work there. Media and sticker features need native `ffmpeg`, so run
  those locally.

### Run it and authenticate

Run the file with your runtime of choice, then link the device from your phone.

  
```bash
bun run bot.ts
```

  
```bash
npx tsx bot.ts
```

  
```bash
npx ts-node bot.ts
```

By default a QR code is rendered directly in your terminal. Open **WhatsApp → Settings → Linked Devices → Link a Device** and scan it. Once linked you will see `Connected as 628...@s.whatsapp.net` and the bot will start echoing text messages.

## A complete echo bot

Here is the full, runnable program. It handles the connection lifecycle and replies to every incoming text message.

```typescript

const client = new Client({
  sessionId: 'echo-bot', // names the auth folder + log line
})

client.on('qr', ({ qrString }) => console.log('Scan QR:', qrString))

client.on('connect', ({ me }) => {
  console.log('Connected as', me.id)
})

client.on('disconnect', ({ reason, willReconnect }) => {
  console.log('Disconnected:', reason, willReconnect ? '(reconnecting)' : '')
})

client.on('text', async (msg) => {
  console.log('Received from', msg.senderId, '|', msg.text)
  await msg.reply(`Hello ${msg.senderName ?? ''}! You said: ${msg.text}`)
})
```

`msg.reply(text)` answers in the same chat (and quotes the incoming message). The message context also exposes `msg.senderId`, `msg.senderName`, `msg.text`, `msg.roomId` (the group JID, or `null` for a 1:1 chat), `msg.react(emoji)`, and `await msg.replied()` to fetch the quoted message. See [Events](/events) for the full context shape.

## Authentication

The login method is selected with the `authType` option. The two valid values are `'qr'` (the default) and `'pairing'`.

### QR login (default)

No configuration is needed. By default Zaileys prints a scannable QR straight into your terminal via the `qrTerminal` option (default `true`), and also emits a `qr` event carrying the raw `qrString` (useful for rendering the code elsewhere, e.g. a web dashboard).

```typescript

const client = new Client() // authType defaults to 'qr'

client.on('qr', ({ qrString, expiresAt }) => {
  console.log('Scan this QR string:', qrString)
  console.log('Expires at:', new Date(expiresAt).toISOString())
})
```

To suppress the auto-printed terminal QR and render it yourself (e.g. as an image), disable `qrTerminal` and handle the `qr` event:

```typescript
const client = new Client({ qrTerminal: false })

client.on('qr', ({ qrString }) => {
  // render qrString into an <img> / image file yourself
})
```

### Pairing-code login

Instead of scanning a QR, you can request an 8-character pairing code and type it into WhatsApp. Set `authType: 'pairing'` and provide your own `phoneNumber` in E.164 format (country code, digits only — no `+`, spaces, or dashes).

```typescript

const client = new Client({
  authType: 'pairing',
  phoneNumber: '6281234567890', // your number, E.164 without '+'
})

client.on('pairing-code', ({ code, expiresAt }) => {
  console.log('Enter this code in WhatsApp:', code)
  console.log('Expires at:', new Date(expiresAt).toISOString())
})

client.on('connect', ({ me }) => console.log('Connected as', me.id))
```

On your phone, open **WhatsApp → Linked Devices → Link a Device → Link with phone number instead**, then enter the code.

When `authType` is `'pairing'`, `phoneNumber` is **required** — otherwise `connect()` rejects with `phoneNumber is required when authType is "pairing"`. The number must be E.164 with a country code, between 8 and 15 digits. Separators (`+`, spaces, `-`, parentheses) are stripped automatically, but the result must be all digits.

## Where the session is stored & re-scanning

After a successful login, Zaileys persists the credentials so you do not have to scan again on every restart. With the default `file` auth store, the session lives under:

```text
./.zaileys/auth/<sessionId>/
```

`sessionId` defaults to `'default'`, so the default path is `./.zaileys/auth/default/`. Setting a distinct `sessionId` lets you run multiple independent accounts side by side, each in its own folder.

```typescript
const client = new Client({ sessionId: 'support-desk' })
// → session stored in ./.zaileys/auth/support-desk/
```

Add `.zaileys` to your `.gitignore`. The folder contains live login credentials — anyone with it can act as your WhatsApp account.

To force a fresh login, delete the session folder and run again; you will be prompted to scan a new QR / request a new pairing code. Zaileys also clears the session automatically on a logged-out / fatal disconnect (e.g. you removed the linked device from the phone). For persisting sessions in SQLite, Redis, Postgres, or Convex instead of the filesystem, see [Storage Adapters](/storage).

## `autoConnect` vs manual connect

By default `autoConnect` is `true`: the client schedules `connect()` in a microtask during construction, so you do not call `connect()` yourself. This is why registering handlers synchronously after `new Client()` is enough.

If you set `autoConnect: false`, **nothing happens until you call `client.connect()`**. This is useful when you want to register listeners, wire up commands, or run async setup before the socket opens. `connect()` returns a `Promise<void>` that resolves once the connection is **open** (the first `connect` event) and rejects if the connection closes before opening.

```typescript

const client = new Client({ autoConnect: false })

client.on('qr', ({ qrString }) => console.log('Scan QR:', qrString))
client.on('text', async (msg) => {
  await msg.reply(`Echo: ${msg.text}`)
})

// connect when you're ready; await resolves on the first successful open
await client.connect()
console.log('Socket is open and listening')
```

You can inspect the lifecycle at any time via the read-only `client.state` getter. It cycles through `idle → connecting → qr-pending` / `pairing-pending → connected`, and on a drop `reconnecting` or `disconnecting → disconnected`. Calling `connect()` while already `connecting` or `connected` is a safe no-op.

## Handling connect / qr / disconnect

These connection events let you react to the full lifecycle. Reconnection is automatic by default (with exponential backoff) — the `disconnect` event's `willReconnect` flag tells you whether Zaileys will retry, and a `reconnecting` event fires for each attempt.

```typescript

const client = new Client()

client.on('qr', ({ qrString, expiresAt }) => {
  console.log('QR ready, expires', new Date(expiresAt).toLocaleTimeString())
})

client.on('connect', ({ sessionId, me }) => {
  console.log(`[${sessionId}] online as ${me.id} (${me.name ?? 'unknown'})`)
})

client.on('reconnecting', ({ attempt, delayMs, reason }) => {
  console.log(`Reconnecting (attempt ${attempt}) in ${delayMs}ms — ${reason}`)
})

client.on('disconnect', ({ reason, willReconnect }) => {
  if (willReconnect) console.log('Lost connection, retrying:', reason)
  else console.log('Disconnected for good:', reason)
})

client.on('error', ({ error }) => {
  console.error('Client error:', error.message)
})
```

The connection-related events are `qr`, `pairing-code`, `connect`, `reconnecting`, `disconnect`, and `error`. There is no `connecting` event — observe `client.state` for that intermediate phase. The full event catalogue (including message events like `text`, `image`, `reaction`, and more) is documented in [Events](/events).

Zaileys prints concise human-readable status lines to `stderr` by default (`[zaileys] Connecting...`, `Scan the QR code above...`, `Connected as ...`). Set `statusLog: false` to silence them and rely solely on the events above.

## First-run gotchas

**The QR expires quickly.** Each QR is valid for ~60 seconds, after which a new one is emitted. Scan promptly, or watch for the next `qr` event.

**"Connection keeps closing before it authenticates."** If the saved session is corrupted or invalid, the client reconnects in a loop without ever reaching `connected`. Zaileys detects this and hints you to delete the auth folder (default `./.zaileys`). Remove it and re-authenticate with a fresh QR / pairing code.

**`client not connected` when sending.** Methods like `client.send(...)` require an open socket. If you call them before the `connect` event fires (or after a disconnect), they throw. Send from inside a `connect` or message handler, or `await client.connect()` first when `autoConnect` is disabled.

**Pairing code with a wrong number format.** The `phoneNumber` must be E.164 digits with a country code (e.g. `6281234567890`, not `081234567890` and not `+62 812-3456-7890`). An invalid number throws `phoneNumber must be E.164 with country code`.

**Messages from the bot itself are ignored** by default (`ignoreMe: true`), so your handlers will not echo your own outgoing messages back into a loop. Set `ignoreMe: false` only if you specifically need to process your own messages.

## Next steps

- [Configuration](/configuration) — every `Client` option, defaults, and tuning.
- [Events](/events) — the complete event list and message context API.
- [Sending Messages](/sending-messages) — text, media, replies, reactions, and the fluent `send()` builder.
- [Troubleshooting](/troubleshooting) — connection problems, session resets, and common errors.
