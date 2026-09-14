---
name: zaileys
description: >-
  Builds, extends, debugs, reviews, upgrades, and deploys WhatsApp bots written with zaileys, the TypeScript
  WhatsApp library for WhatsApp Web (QR or pairing-code login) and the official Meta Cloud API (webhooks,
  templates). Use when code imports zaileys or package.json lists it, or when someone wants a WhatsApp bot,
  auto-reply, command bot, broadcast, or WhatsApp webhook in Node.js — including Indonesian requests such as
  "bikin bot WA", "bot WhatsApp pakai zaileys", "kenapa bot nggak bales", or "deploy bot WA ke VPS". Covers
  sending and receiving messages and media, buttons, groups and channels, commands and plugins, sessions and
  storage, Cloud API webhooks, templates and the 24-hour window, error codes, server sizing, and upgrades
  within v4. Not for whatsapp-web.js, raw Baileys, Twilio, or non-WhatsApp bots unless moving them to zaileys.
license: MIT
compatibility: Node.js 20 or newer; zaileys v4
---

# zaileys

zaileys (npm `zaileys`, docs https://zaileys.kejaa.id) wraps two ways of talking to WhatsApp behind one
`Client`: **WhatsApp Web** (`provider: 'baileys'`, the default — a linked device of a normal account) and the
**Cloud API** (`provider: 'cloud'` — Meta's official API for business numbers). Handlers and sends look the
same on both; login, delivery, and the available features do not.

Your training data likely predates the current v4 API, and v3 code (a `wa` instance with a `messages` event,
`prefix`, `session`) or raw-Baileys habits (`messages.upsert`, `useMultiFileAuthState`, `authDir`) will not compile.
Treat the installed package as the source of truth:

- Version: `node_modules/zaileys/package.json`
- Every exported type, option, and event: `node_modules/zaileys/dist/index.d.ts` (search it before guessing)
- Any docs page as Markdown: add `.md` to its URL, e.g. https://zaileys.kejaa.id/cloud/webhook.md

## Pick the job

| The user wants to… | Read first |
| --- | --- |
| Start a new bot or add zaileys to a project | [workflows/new-bot.md](workflows/new-bot.md), then [references/storage-and-sessions.md](references/storage-and-sessions.md) |
| Add a feature to an existing bot | [workflows/add-feature.md](workflows/add-feature.md), then the topic reference below |
| Fix an error, a bot that doesn't reply, or a login loop | [workflows/debug.md](workflows/debug.md) and [references/errors.md](references/errors.md) |
| Review a bot before production | [workflows/review.md](workflows/review.md) |
| Upgrade zaileys or deploy to a server | [workflows/upgrade-and-deploy.md](workflows/upgrade-and-deploy.md), [references/migration.md](references/migration.md), [references/production.md](references/production.md) |

Topic references — open the one the task touches:

| Topic | File |
| --- | --- |
| WhatsApp Web vs Cloud API, what runs where, moving between them | [references/providers.md](references/providers.md) |
| Sending: builder, media, buttons and lists, edits, reactions, JIDs | [references/messaging.md](references/messaging.md) |
| Receiving: events, message context, downloading media | [references/receiving.md](references/receiving.md) |
| Commands, middleware, plugins, broadcast, scheduling, auto-delete | [references/bots.md](references/bots.md) |
| Groups, communities, channels | [references/groups-and-channels.md](references/groups-and-channels.md) |
| Cloud API setup, webhook, templates, 24-hour window, Meta limits | [references/cloud-api.md](references/cloud-api.md) |
| Auth and message stores, sessions, multiple accounts | [references/storage-and-sessions.md](references/storage-and-sessions.md) |
| Every error code, message, disconnect reason, and Meta code | [references/errors.md](references/errors.md) |
| Server sizing, media limits, ffmpeg, Docker, process managers | [references/production.md](references/production.md) |
| Version history: v3 → v4 and changes within v4 | [references/migration.md](references/migration.md) |

Templates for new projects are in `assets/templates/web/` and `assets/templates/cloud/`. The read-only project
check is `scripts/doctor.mjs` (`node scripts/doctor.mjs <project> [--json] [--online]` from this skill's
directory). Read only the files the job needs.

## Facts that prevent most failures

### Answer in the chat the message came from

`msg.chatId` is the **message ID**, not a chat. Sending to it fails with `username "…" not found`.

```ts
client.on('text', async (msg) => {
  await msg.reply('pong') // quotes the message
  await client.send(msg.roomId ?? msg.senderId).text('pong') // plain message to the same chat
})
```

`roomId` is typed `string | null`, which is why the fallback is required under `strict`.

### Events are typed names, not Baileys events

Listen with `client.on('message' | 'text' | 'image' | 'video' | 'audio' | 'document' | 'sticker' | …)`.
`text` ignores captions: a captioned photo fires `message` and `image`, with the caption in `msg.text`.
`client.on()` returns an unsubscribe function; there is no `once`.

zaileys doesn't await handler promises. An `async` handler that throws becomes an unhandled rejection, which
exits Node.js by default — wrap the work in `try`/`catch`:

```ts
client.on('image', async (msg) => {
  if (msg.media?.type !== 'image') return
  try {
    const photo = await msg.media.buffer()
    await client.send(msg.roomId ?? msg.senderId).image(photo, { caption: 'Got it' })
  } catch (error) {
    console.error('image handler failed:', error)
  }
})
```

### The client connects and reconnects by itself

`new Client()` starts connecting on the next tick (`autoConnect: true`), so register handlers right after
constructing it. Reconnects with backoff are built in. Calling `client.connect()` from a `disconnect` handler
stacks a second retry loop on top, and every extra login attempt counts against the number — log instead:

```ts
client.on('disconnect', ({ reason, willReconnect }) => {
  if (!willReconnect) console.error(`stopped: ${reason}`)
})
client.on('error', ({ error }) => console.error('zaileys:', error.message))
```

Without an `error` listener a failed automatic connect (bad token, invalid pairing number) prints nothing.

### Options have v4 names

| Use | Not |
| --- | --- |
| `sessionId: 'shop'` — 1–64 chars of `A-Z a-z 0-9 _ -`, otherwise the constructor throws | `session`, ids with `.` `/` `:` `@` |
| `authType: 'qr' \| 'pairing'` with `phoneNumber: '6281234567890'` (string, country code, no `+`) | numeric `phoneNumber` |
| `commandPrefix: '!'` | `prefix` |
| `auth: new FileAuthStore({ basePath })` or a database store | `authDir`, `useMultiFileAuthState` |

The default session lives in `./.zaileys/auth/<sessionId>`, relative to the directory the process starts in.
Changing `sessionId` points at a new, empty folder — the bot asks for a new QR unless the old folder is
renamed to match.

### Sessions survive everything except a logout

Only a `logged-out` disconnect erases stored credentials.
`connection-replaced` (another process uses the same session) and `forbidden` stop the client but keep the
session; network reasons and `bad-session` reconnect. `session.clearAuthOn` changes which reasons erase.
Run one process per session: two processes on one session kick each other off.

### Keep the ban guards on (WhatsApp Web)

`authGuard` stops after 5 QR codes or 3 pairing codes, and `operationGuard` spaces out group, community, and
channel operations. Both are on by default; `{ enabled: false }` is how login loops get numbers restricted.
Send to many chats with `client.broadcast(jids, (b) => b.text('…'))`, which paces sends (5/s by default),
instead of a `for` loop over `client.send()`.

### The Cloud API is a different runtime

- Incoming messages arrive only through `client.webhook()` — a `(req: Request) => Promise<Response>`
  handler you mount on a public HTTPS route. It requires `cloud.appSecret` and verifies the signature over the
  **raw** body; unsigned or re-serialized bodies get `401`. In Express, mount it with
  `express.raw({ type: '*/*' })` and never `express.json()` on that route.
- Free-form messages reach a customer only within 24 hours of their last message. Later sends fail with Meta
  code `131047`; use `client.sendTemplate(to, name, language, components)` with an approved template. The
  send builder's `.template()` is a normal button message, not a Meta template.
- No QR, session, or reconnect. `client.group`, `privacy`, `newsletter`, `community`, `profile`, `chat`,
  `contact`, `business`, `presence`, `edit()`, `delete()`, `pin()` throw `UNSUPPORTED_ON_CLOUD`. Commands,
  middleware, plugins, `broadcast()`, `scheduleAt()`, `forward()`, and auto-delete need the WhatsApp Web
  connection and don't run on the Cloud API — handle `text` events instead.

### Errors carry a code

Every zaileys error class (`ZaileysBuilderError`, `ZaileysCloudError`, `ZaileysProviderError`,
`ZaileysCommandError`, `ZaileysDomainError`, `ZaileysAutomationError`, `ZaileysStoreError`) has a `code`, and
wrapped failures keep the original in `error.cause`. Branch on `instanceof` and `code`, not on message text.
Set `ZAILEYS_DEBUG=1` to see logs that are silent by default (failed handlers, failed commands).

### Media needs no system ffmpeg

zaileys installs a matching ffmpeg for the platform and uses the one on `PATH` only when no bundled binary
exists (override with `FFMPEG_PATH`). `sharp` is optional and speeds up images. Don't add
`apt-get install ffmpeg` to Dockerfiles by reflex. The exception: animated stickers need ffmpeg's `libwebp`
encoder, which some bundled builds lack (darwin-arm64 does) — the doctor script checks it, and the fix is an
ffmpeg with libwebp plus `FFMPEG_PATH`.

## Verify before you finish

1. Type-check what you wrote against the installed package: `npx tsc --noEmit`. A type error on a zaileys call
   means the API is different from what you assumed — look it up in `dist/index.d.ts`, don't cast it away.
2. For WhatsApp Web, the first run prints a QR code (or pairing code) and then `[zaileys] Connected as …`.
   For the Cloud API, `connect` fires once Meta accepts the token; the webhook must answer Meta's GET
   verification with the challenge.
3. Tell the user what they must provide or do themselves: scanning the QR, Meta credentials and the webhook
   URL, or an approved template name.
