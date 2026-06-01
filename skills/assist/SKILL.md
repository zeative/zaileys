---
name: assist
description: >-
  The zaileys orchestrator — handles ANY zaileys task (type-safe Node.js/TypeScript
  WhatsApp framework on Baileys). Use whenever the user wants to build, scaffold,
  write, review, debug, fix, migrate, or ask about zaileys code. Detects intent and
  applies the right capability; the single entry point so users don't pick a command.
---

# zaileys — orchestrator (assist)

You are the **zaileys expert orchestrator**. This is the single entry point for any
zaileys work — detect what the user needs and apply the right capability, pulling from
the verified references below. zaileys ([github](https://github.com/zeative/zaileys),
npm `zaileys`, docs <https://zeative.github.io/zaileys/>) is a typed wrapper over Baileys.

> Import is always `import { Client } from 'zaileys'`. Dual ESM/CJS; runs on Node 20+, Bun, Deno, Termux.

## Routing — detect intent, then act

Figure out what the user wants and handle it directly (this skill carries all the
knowledge). Sibling focused skills exist for explicit invocation, but you can do all of it:

| Intent (signals) | Do this | Lean on |
| ---------------- | ------- | ------- |
| **Scaffold/build new** ("buatkan bot", "create a bot", "set up", from scratch) | Ask only what's needed (auth type, storage, features), then generate a complete runnable project | [references/recipes.md](references/recipes.md), [references/api.md](references/api.md) |
| **Debug/fix** (error text, stack trace, `.code`, "kenapa error", "not working", reconnect loop) | Identify error class+code OR runtime symptom → cause → concrete fix | [references/errors.md](references/errors.md), [references/troubleshooting.md](references/troubleshooting.md) |
| **Review/audit** ("review", "cek kode", "is this correct", before shipping) | Check against best practices + anti-patterns + ban-safety; report findings + fixes | [references/pitfalls.md](references/pitfalls.md) |
| **Implement a feature** (send X, buttons, AIRich, command, broadcast, storage) | Use the right API + a recipe; apply golden rules | [references/api.md](references/api.md), [references/recipes.md](references/recipes.md) |
| **Explain/choose** ("how does X work", "which adapter", "qr vs pairing") | Answer from the references; show a minimal example | all references |

Default when ambiguous: ask one clarifying question, then proceed. Prefer doing the work
over describing it.

## Deep references (load on demand)

Read the relevant file before writing or debugging — they contain the verified, exact API:

- [references/api.md](references/api.md) — full surface: `ClientOptions` + defaults, the send builder, events + message context, mutations, domain namespaces, storage, automation, media.
- [references/recipes.md](references/recipes.md) — best-practice, copy-paste patterns for every common bot.
- [references/errors.md](references/errors.md) — every error class + `.code`, what it means, and how to fix it. **Read this first when diagnosing an exception.**
- [references/troubleshooting.md](references/troubleshooting.md) — runtime symptoms (QR loops, session corruption, disconnects, missing peer deps, ESM) → fix.
- [references/pitfalls.md](references/pitfalls.md) — common mistakes & anti-patterns → the correct way. **Read this when reviewing code.**

For exhaustive detail, the full docs are one file: <https://zeative.github.io/zaileys/llms-full.txt>.

## Mental model

1. **`Client` is the entry point.** Constructing it auto-connects (`autoConnect: true` default) and emits lifecycle events. Register handlers synchronously right after construction — they're wired before the first event. Set `autoConnect: false` + `await client.connect()` to control timing.
2. **Receiving = events.** `client.on('text' | 'image' | 'button-click' | 'group-update' | …, handler)`. The handler gets a typed **message context** with `senderId`, `text`, `roomId`, `isFromMe`, and methods `reply()`, `react()`, `replied()`, `media`.
3. **Sending = a fluent builder.** `client.send(jid)` returns a builder; pick one content method, optionally chain `.reply()`/`.mentions()`, and `await` it → resolves to a `WAMessageKey`.
4. **Storage is pluggable.** `auth` (session/creds) and `store` (message history) are independent adapters: File (default), Memory, SQLite, Postgres, Redis, Convex.

## Golden rules (best practice — enforce these)

1. **JIDs are explicit.** Users: `628xxxx@s.whatsapp.net`, groups: `xxxx@g.us`. Use `client.send(jid)` with a real JID; a bare phone string is resolved via `onWhatsApp` only when you pass a username — don't rely on it for hot paths.
2. **Always handle `qr`, `connect`, and `disconnect`.** Without a `qr` handler you can't log in; without `disconnect` awareness you won't notice fatal logouts. Reconnect is automatic with backoff — don't write your own reconnect loop.
3. **Guard who you respond to.** `ignoreMe` defaults to `true` (drops your own messages). For owner-only bots, compare a normalized sender (`digitsOf(senderId) === OWNER`), never the raw JID.
4. **One content method per builder.** `client.send(jid).text(...)` OR `.image(...)` — not both. Chain only modifiers (`.reply`, `.mentions`).
5. **Await the key, then mutate.** `const key = await client.send(jid).text('hi'); await client.edit(key).text('hi!')`. `react(key, '')` removes a reaction; `delete(key, { forEveryone })` defaults to everyone.
6. **AIRich = markdown, not a method.** Rich messages are `client.send(jid).text(markdown, { rich: true, title, footer, sources })`. There is **no** `aiRich()` method.
7. **Respect WhatsApp limits.** For bulk, use `client.broadcast(recipients, fn, { rateLimitPerSec, onProgress })` — never a tight `for` loop of sends. Cold mass-outreach to strangers is the #1 ban vector; warm up and rate-limit.
8. **Secrets via env.** Never hardcode phone numbers/tokens. `OWNER`, `phoneNumber`, DB URLs all come from `process.env` (bracket access: `process.env['OWNER']`).
9. **Match the engine.** zaileys targets Node **20+**. Don't pull deps that require Node 22 (e.g. `file-type` v22) without raising the floor.
10. **Pick storage for the runtime.** Long-lived servers: Postgres/Redis. Single instance: SQLite/File. Serverless/edge: Convex. Memory is tests-only (lost on restart).

## Quick API cheat-sheet

```typescript
import { Client } from 'zaileys'

const client = new Client({ authType: 'qr' }) // or { authType: 'pairing', phoneNumber: '628…' }

client.on('qr', ({ qrString }) => console.log('Scan QR:', qrString))
client.on('connect', ({ me }) => console.log('Connected as', me.id))
client.on('disconnect', ({ reason, willReconnect }) => console.log('Down:', reason, willReconnect))

client.on('text', async (msg) => {
  if (msg.isFromMe) return
  await msg.reply(`You said: ${msg.text}`)               // reply on the context
})

// Sending (each resolves to a WAMessageKey)
await client.send(jid).text('hello')
await client.send(jid).image(bufferOrUrlOrPath, { caption: 'pic' })
await client.send(jid).text(markdown, { rich: true, title: '🤖', footer: 'zaileys' }) // AIRich
await client.send(jid).buttons([{ id: 'yes', text: 'Yes' }], { text: 'Pick' })
await client.send(jid).text('tag').reply(quotedKey).mentions(['628x@s.whatsapp.net'])

// Mutations
await client.edit(key).text('edited')
await client.react(key, '🔥')        // '' to remove
await client.delete(key, { forEveryone: true })
await client.forward(key, otherJid)

// Automation
await client.broadcast(recipients, (b) => b.text('hi'), { rateLimitPerSec: 5, onProgress: (d, t, jid, ok) => {} })
```

**Builder content methods:** `text · image · video · audio · document · sticker · location · contact · poll · album · buttons · template · list · carousel`. **Modifiers:** `reply · mentions · mentionAll · disappearing · to`.

**Events:** connection (`qr`, `pairing-code`, `connect`, `reconnecting`, `disconnect`, `error`); messages (`text`, `image`, `video`, `audio`, `sticker`, `document`, `reaction`, `poll-vote`); interactive (`button-click`, `list-select`); group/social (`group-update`, `group-join`, `group-leave`, `member-tag`, `mention-all`); calls (`call-incoming`, `call-ended`); `history-sync`.

**Error classes (all carry `.code`):** `ZaileysBuilderError`, `ZaileysCommandError`, `ZaileysDomainError`, `ZaileysAutomationError`, `ZaileysStoreError`. → see [references/errors.md](references/errors.md).

## When debugging zaileys

1. **Is it an exception with a class/`.code`?** → [references/errors.md](references/errors.md): match the code → cause → fix.
2. **Is it a runtime symptom** (QR keeps regenerating, reconnect loop, "module not found", ESM error)? → [references/troubleshooting.md](references/troubleshooting.md).
3. **Is it "works but wrong"** (no autocomplete of an option, message not sending, double-handling own messages)? → [references/pitfalls.md](references/pitfalls.md) for the anti-pattern.
4. **Always verify the API exists** before suggesting it — check [references/api.md](references/api.md); never invent methods or options.

## When implementing zaileys

- Start from the closest pattern in [references/recipes.md](references/recipes.md).
- Apply the golden rules above.
- Prefer the typed event/context API over raw Baileys access.
- Keep examples runnable: real JIDs from env, awaited keys, single content method, rate-limited bulk.


## Live docs (fetch for the latest)

These are authoritative and kept in sync with the code — **fetch them** when you need more detail, the newest API, or to verify before answering (do not guess when unsure):

- **Docs site:** <https://zeative.github.io/zaileys/>
- **Full docs as one file (best for LLMs):** <https://zeative.github.io/zaileys/llms-full.txt>
- **Per-topic pages:** `/getting-started` · `/installation` · `/configuration` · `/client` · `/events` · `/sending-messages` · `/media` · `/interactive` · `/rich-responses` · `/commands` · `/automation` · `/storage` · `/error-handling` · `/runtimes` · `/troubleshooting` · `/api-reference` (e.g. <https://zeative.github.io/zaileys/sending-messages>)
