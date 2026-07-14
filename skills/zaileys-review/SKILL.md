---
name: zaileys-review
description: >-
  Use to REVIEW / AUDIT / CHECK existing zaileys (Node.js/TypeScript WhatsApp framework
  WhatsApp framework) code against best practices, anti-patterns, and ban-safety — triggers on
  "review my bot", "cek kode", "is this correct", "best practice?", or before
  shipping/deploying a zaileys bot. Covers BOTH providers: unofficial WhatsApp Web and the
  official Meta Cloud API (webhook signatures, template-gating, 24h window, idempotency).
---

# zaileys — code review & audit

You audit existing **zaileys** code for anti-patterns, correctness, and ban-safety, then
hand back actionable fixes. Import is always `import { Client } from 'zaileys'`. zaileys is
a typed wrapper over Baileys; runs on Node 20+, Bun, Deno. Do NOT invent methods — verify
every claim against the checklist below and the hub references in the `assist` skill
(`references/pitfalls.md`, `references/api.md`, `references/recipes.md`) or the live full
docs at <https://zeative.github.io/zaileys/llms-full.txt>.

## Workflow

1. **Read the target.** Read every file the user points at (and any local imports it
   pulls in). If they didn't name files, ask or scan the project's bot entrypoints
   (`*.ts` using `new Client(`). Note the entry, handlers, and any send loops.
2. **Scan** against the REVIEW CHECKLIST below — anti-patterns, correctness, ban-safety.
   For each hit, capture severity, the exact location (file:line), and the concrete fix.
   Confirm method/option/event names against `references/api.md` before flagging.
3. **Report.** Emit a findings table — `severity | issue | location | fix` — sorted
   high → low. Severity rubric:
   - **high** = ban-safety, data loss, or crashes (unthrottled mass send, leaked
     secrets, lost scheduled jobs, reply loops, calling a non-existent method).
   - **medium** = wrong-but-recoverable (wrong JID, ms-vs-seconds, unawaited key,
     missing `qr` handler, Node-floor regressions).
   - **low** = style / robustness nits.
4. **Corrected snippets.** After the table, give a `❌ before → ✅ after` TypeScript
   block for each high/medium finding, in house style (env-driven config, `digitsOf`
   normalization, `msg.reply`/`msg.react` inside handlers, terse, zaileys branding only).
5. If the code is clean, say so explicitly and list what you verified.

## Review checklist (highest-impact first)

Each item: ❌ bad → ✅ good + one-line WHY. Source of truth: `references/pitfalls.md`.

### Ban-safety / data-loss / crashes — HIGH

**Tight for-loop of sends → `broadcast()` + rate limit.** *(BAN RISK)*
❌ `for (const jid of jids) await client.send(jid).text('Promo!')`
✅ `await client.broadcast(jids, (b) => b.text('Promo!'), { rateLimitPerSec: 5 })`
WHY: `broadcast` applies a token-bucket `RateLimiter` (default 5/s) and returns
`{ sent, failed }`; a raw loop fires unthrottled → spam flag → ban.

**Hardcoded number/secrets → env, validated.**
❌ `const OWNER = '628123456789'` / `new Client({ phoneNumber: '628123456789' })`
✅ `const OWNER = digitsOf(process.env['OWNER'] ?? ''); if (!OWNER) process.exit(1)`
WHY: hardcoding leaks identity into VCS and breaks multi-deploy; house style reads from
`process.env` and validates before use.

**Custom reconnect loop → built-in strategy.**
❌ `client.on('disconnect', () => client.connect())`
✅ `new Client({ reconnect: { maxAttempts: 10, initialDelayMs: 1000, maxDelayMs: 30000 } })`
WHY: the client owns reconnection (exponential backoff + jitter, skips fatal/logged-out
reasons, clears auth when needed); calling `connect()` yourself races the internal timer.
Read `willReconnect` on the `disconnect` event instead.

**Assuming all stores persist scheduled jobs → only Convex does.**
❌ `new Client()` then `scheduleAt(...)` — job LOST on restart (default `MemoryMessageStore`)
✅ `new Client({ store: new ConvexMessageStore({ url }) })` then `scheduleAt(...)`
WHY: `scheduleAt` survives restart only if the store implements
`saveScheduledJob`/`listScheduledJobs`/`deleteScheduledJob`. Only the **Convex** adapter
does; Memory/SQLite/Postgres/Redis keep jobs in-process only.

**Ignoring `isFromMe`/`ignoreMe` → reply loop.**
❌ `new Client({ ignoreMe: false })` + an echo handler with no guard → infinite loop
✅ `new Client()` (ignoreMe defaults `true`); inside handler `if (msg.isFromMe) return`
WHY: `ignoreMe` defaults `true` so the pipeline drops the bot's own messages; disabling it
without guarding `msg.isFromMe` makes the bot answer its own echoes forever.

**`aiRich()` does not exist → `.text(md, { rich: true })`.** *(crash)*
❌ `await client.send(jid).aiRich(markdown)` — no such method
✅ `await client.send(jid).text(markdown, { rich: true, title: '🤖 zaileys' })`
WHY: there is no `aiRich()` content method; rich rendering (markdown/LaTeX/directives) is
the `rich: true` flag on `text()`. `TextOptions = { rich?, title?, footer?, sources? }`.

### v4.4 API usage — MEDIUM (HIGH if it crashes)

**Many per-type handlers doing the same thing → `message` umbrella event.**
❌ `client.on('text', h); client.on('image', h); client.on('video', h)` — same body, three handlers
✅ `client.on('message', h)` — one handler fires for every inbound message type
WHY: `message` is the umbrella inbound event; collapse identical per-type handlers into it. Keep the
per-type events (`text`, `image`, …) only when behavior genuinely differs by type.

**Ad-hoc conversation key → `ctx.staticId`.**
❌ `const key = msg.roomId ?? msg.senderId` to key memory/state — collides across room/sender combos
✅ `const key = msg.staticId` — stable `hash(roomId|senderId)`, the canonical per-conversation key
WHY: `staticId` uniquely identifies a sender within a room/group; use it for memory/state. Still use the
real `roomId`/`senderId` JIDs as **send targets** — `staticId` is a hash, not a JID.

**`groupInvite().expiresAt` in ms instead of SECONDS.**
❌ `.groupInvite({ ..., expiresAt: Date.now() + 86_400_000 })`
✅ `.groupInvite({ ..., expiresAt: Math.floor(Date.now() / 1000) + 86400 })`
WHY: `expiresAt` maps straight to WhatsApp's `inviteExpiration` (Unix **seconds**); passing ms yields a
wildly future expiry. (Defaults to ~3 days if omitted.)

**`event()` sent to a 1:1 DM → won't render.**
❌ `await client.send(userJid).event({ name: 'Meetup', ... })` — silently doesn't display in a DM
✅ send `event()` to a group/community JID (`xxx@g.us`); use a plain message for 1:1
WHY: event messages only render in groups/communities, not 1:1 chats.

**`product()` without a Business account.**
❌ `.product({ ... })` from a personal account / missing `businessOwnerId`
✅ use a WhatsApp **Business** account and pass the required `businessOwnerId`
WHY: `product()` requires `businessOwnerId` (non-optional) and a Business catalog; personal accounts can't.

**Comparing mentions against `@lid`.**
❌ `if (msg.mentions.includes('123@lid'))` — mentions are never `@lid`
✅ `if (msg.mentions.some((j) => digitsOf(j) === OWNER))` — mentions are PN-resolved `@s.whatsapp.net`
WHY: the decoder maps mention JIDs through `lidMap` to phone-number JIDs; comparing against a `@lid` JID
never matches. Normalize to digits.

**Poking the raw socket for profile/chat/contact/business ops → typed modules.**
❌ `client.socket.chatModify(...)` / `client.socket.updateProfileName(...)` — untyped, version-fragile
✅ `client.chat.archive(jid)`, `client.profile.setName(name)`, `client.contact.exists(num)`,
   `client.business.catalog()` — typed wrappers
WHY: v4.4 exposes typed modules `client.profile / chat / contact / business` (plus `client.pin/unpin`,
`client.setDisappearing`); prefer them over reaching into the raw Baileys socket.

### Correctness — MEDIUM (HIGH if it crashes)

**Two content methods on one builder.**
❌ `client.send(jid).text('hi').image('./a.jpg')` — type error / intent lost
✅ `client.send(jid).image('./a.jpg', { caption: 'hi' })` — one content method (use its own
option to combine), or two separate `send()` calls, or `.album([...])` for one bubble.
WHY: each content method transitions `'init' → 'content-set'` and is typed
`this: MessageBuilder<'init'>` — only ONE is callable per builder.

**Not awaiting the key before edit/react/delete/forward.**
❌ `const b = client.send(jid).text('hi'); await client.edit(b).text('bye')` — `b` is a builder
✅ `const key = await client.send(jid).text('hi'); await client.edit(key).text('edited')`
WHY: the builder is a thenable; `await` runs `send()` and resolves to the `WAMessageKey`.
`edit/react/delete/forward` all take a `WAMessageKey`. Inside handlers prefer
`msg.reply()` / `msg.react()`.

**Raw-JID owner/sender check → normalized digits.**
❌ `if (msg.senderId === '628123456789@s.whatsapp.net')` — device suffix `:12` / `@lid` breaks it
✅ `const digitsOf = (jid) => (jid.split(/[:@]/)[0] ?? '').replace(/\D/g, ''); if (digitsOf(msg.senderId) !== OWNER) return`
WHY: a JID may carry a device part or be a `@lid`; raw `===` fails. Normalize to bare digits.

**Wrong JID format.**
❌ `client.send('628123456789')` as a JID / `.mentions(['628123456789'])`
✅ `client.send('628123456789@s.whatsapp.net')`, group `xxx@g.us`, `.mentions(['628...@s.whatsapp.net'])`
WHY: user JID = `<digits>@s.whatsapp.net`, group JID = `<id>@g.us`. `send()` tolerates a raw
string only via username resolution; `mentions()` throws `INVALID_OPTIONS` if an entry lacks `@`.

**`replied()` used as a property → it's an async method.**
❌ `const q = msg.replied; if (q.text)` — `replied` is a function, not a value
✅ `const q = await msg.replied(); if (q) console.log(q.text)` — returns `MessageContext | null`
WHY: `replied()` is async and may be `null`; always `await` and null-check.

**Using `client.send(msg.senderId)` instead of `msg.reply()` in a handler.**
❌ `await client.send(msg.senderId).text('hi')` — loses the quote; in groups goes to the sender's DM
✅ `await msg.reply('hi')` — quotes the source and targets the correct room
WHY: `ctx.reply` targets `remoteJid ?? roomId ?? senderId`; in a group that's the group, not a DM.

**Missing `qr` handler.**
❌ `new Client()` with only message handlers — headless = stuck, no way to scan
✅ `client.on('qr', ({ qrString, expiresAt }) => console.log('Scan:', qrString))`
WHY: with `authType: 'qr'` (default) you must surface the QR (or `pairing-code` for pairing).
The `qr` event's `expiresAt` is epoch **milliseconds** (~60s).

**`limitedTimeOffer.expiresAt` in ms instead of SECONDS.**
❌ `limitedTimeOffer: { text: 'Sale', expiresAt: Date.now() + 3600_000 }`
✅ `limitedTimeOffer: { text: 'Sale', expiresAt: Math.floor(Date.now() / 1000) + 3600 }`
WHY: this `expiresAt` maps straight to WhatsApp's `expiration_time` (Unix **seconds**), no
conversion — passing ms yields a wildly future expiry. (Note the inconsistency: `qr`/
`pairing-code` `expiresAt` and message `timestamp` are **ms**; only this field is seconds.)

**`audio()` voice-note surprise (`ptt` defaults true).**
❌ `await client.send(jid).audio('./song.mp3')` — sent as a push-to-talk voice note + waveform
✅ `await client.send(jid).audio('./song.mp3', { ptt: false })` — shareable audio file
WHY: `AudioOptions.ptt` defaults `true`; pass `ptt: false` for a real file, leave default only
when a voice note is intended.

**Deps requiring Node 22 while zaileys targets Node 20+.**
❌ adding a dep with `engines: { node: ">=22" }` (e.g. `file-type` v22)
✅ keep deps Node-20 compatible (zaileys pins `file-type@^21` for this reason)
WHY: `package.json` declares `engines.node >=20.0.0` and tests Node 20/22/24; raising the floor
breaks supported users.

### ☁️ Cloud provider (`provider: 'cloud'`) — HIGH

Only audit these when the code sets `provider: 'cloud'`. Reference: [cloud.md](../zaileys-assist/references/cloud.md).

**Cold / out-of-window send must be a template.**
❌ `await wa.send(newLead).text('Hi!')` → Graph `131047`.
✅ `await wa.sendTemplate(newLead, 'welcome', 'en_US', components)`.
WHY: the Cloud API only allows free-form messages inside the 24-hour window; cold outreach must be an approved template.

**Webhook must verify signatures on a raw body.**
❌ `app.use(express.json()); app.post('/webhook', wa.webhook())` — parsed body breaks `X-Hub-Signature-256` (401).
✅ `express.raw({ type: '*/*' })` before the handler; set `cloud.appSecret`; subscribe the `messages` field.
WHY: inbound is push + HMAC-verified; a body-parser corrupts the signature.

**Inbound handlers must be idempotent.**
❌ Charging/creating on every webhook POST. ✅ Dedupe by message id — Meta retries when you don't ack in ~10s (zaileys acks immediately).

**No web-only surfaces on cloud.**
❌ `wa.group.*`, `wa.newsletter.*`, `wa.send().poll()`, `rich: true`, `wa.edit/delete/pin` on cloud → `UNSUPPORTED_ON_CLOUD`. ✅ Use the unofficial provider, or `wa.cloud.*` for account/business ops.

**Template params match `{{n}}`; secrets from env.**
❌ Wrong param count (`132000`); hardcoded `accessToken`/`appSecret`. ✅ `wa.cloud.templates.get()` to verify; all `cloud.*` from `process.env`, permanent System User token (not the 24h quick-start token).

## Quick verification cues

- Providers: `provider: 'baileys'` (default) or `'cloud'`. Cloud-only: `wa.webhook()`, `wa.sendTemplate()`, `wa.markRead(id, {typing})`, `wa.cloud.*` (templates/profile/info/phoneNumbers/flows/commerce/blocklist/qr/analytics/phone). Cloud events: `message-status`, `template-status`, `flow-response`, `order`. Web-only on cloud throws `ZaileysProviderError('UNSUPPORTED_ON_CLOUD')`.
- Error classes (all from `zaileys`): `ZaileysBuilderError`, `ZaileysCommandError`,
  `ZaileysDomainError`, `ZaileysAutomationError`, `ZaileysStoreError`, `ZaileysCloudError`, `ZaileysProviderError`.
- Builder content methods: `text, image, video, videoNote, audio, document, sticker,
  location, contact, poll, album, buttons, template, list, carousel, event, groupInvite,
  product, requestPhoneNumber, sharePhoneNumber, limitSharing`. Modifiers: `reply, mentions,
  mentionAll, disappearing, to`.
- Inbound events: `message` (umbrella — all types), `text, image, video, audio, document,
  sticker, reaction, edit, delete, poll-vote, button-click, list-select, mention, mention-all,
  group-update, group-join, group-leave, member-tag, call-incoming, call-ended, history-sync,
  presence, newsletter`. Connection: `connect, disconnect, qr, pairing-code, reconnecting,
  auth-exhausted, error`.
- Client methods: `connect, disconnect, logout, send, edit, delete, react, forward,
  broadcast, scheduleAt, pin, unpin, setDisappearing, command, use, on, off`. `autoConnect`
  defaults `true`.
- Typed modules: `client.profile` (setName/setStatus/setPicture/removePicture/getPicture/
  getStatus), `client.chat` (archive/unarchive/pin/unpin/mute/unmute/markRead/markUnread/star/
  unstar/delete/clear), `client.contact` (check/exists/save/remove), `client.business`
  (profile/catalog/collections/orderDetails/createProduct/updateProduct/deleteProduct).
- If the code references anything NOT in these lists, treat it as suspect and verify
  against `references/api.md` before approving.

For the exhaustive anti-pattern list (15 entries with source citations) read
`references/pitfalls.md` in the `assist` skill, and the full docs at
<https://zeative.github.io/zaileys/llms-full.txt>.


## Live docs (fetch for the latest)

These are authoritative and kept in sync with the code — **fetch them** when you need more detail, the newest API, or to verify before answering (do not guess when unsure):

- **Docs site:** <https://zeative.github.io/zaileys/>
- **Full docs as one file (best for LLMs):** <https://zeative.github.io/zaileys/llms-full.txt>
- **Per-topic pages:** `/getting-started` · `/installation` · `/configuration` · `/client` · `/events` · `/sending-messages` · `/media` · `/interactive` · `/rich-responses` · `/commands` · `/automation` · `/storage` · `/error-handling` · `/runtimes` · `/troubleshooting` · `/api-reference` (e.g. <https://zeative.github.io/zaileys/sending-messages>)
