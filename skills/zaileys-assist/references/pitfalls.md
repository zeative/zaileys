# zaileys Pitfalls & Anti-patterns

Common mistakes in zaileys code and the correct fix. Read this when REVIEWING zaileys code to catch bad practice. Each entry: **❌ Anti-pattern → ✅ Correct** + one-line WHY. All claims verified against `src/`.

Import surface: `import { Client } from 'zaileys'`. Builder content methods: `text, image, video, videoNote, audio, document, sticker, location, contact, poll, album, buttons, template, list, carousel, event, groupInvite, product, requestPhoneNumber, sharePhoneNumber, limitSharing`. Modifiers (chainable, return same state): `reply, mentions, mentionAll, disappearing, to`. Client: `connect, disconnect, logout, send, edit, delete, react, forward, broadcast, scheduleAt, command, use, on, off`. Domain modules: `client.group, .privacy, .newsletter, .community, .profile, .chat, .contact, .business`.

---

## 1. Tight for-loop of sends instead of broadcast (ban risk)

❌
```typescript
for (const jid of jids) {
  await client.send(jid).text('Promo!')   // no throttle → spam flag / ban
}
```
✅
```typescript
await client.broadcast(jids, (b) => b.text('Promo!'), {
  rateLimitPerSec: 5,                       // token-bucket throttle (default 5/s)
  onProgress: (done, total, jid, ok) => console.log(`${done}/${total} ${jid} ${ok}`),
})
```
WHY: `broadcast` applies a `RateLimiter` (default `rateLimitPerSec: 5`) and collects `{ sent, failed }`; a raw loop fires unthrottled and risks a WhatsApp ban. (`src/automation/broadcast.ts`)

---

## 2. Hardcoding phone numbers / secrets instead of env

❌
```typescript
const OWNER = '628123456789'
const client = new Client({ phoneNumber: '628123456789' })
```
✅
```typescript
const digitsOf = (jid: string) => (jid.split(/[:@]/)[0] ?? '').replace(/\D/g, '')
const OWNER = digitsOf(process.env['OWNER'] ?? '')
if (!OWNER) { console.error('Set OWNER'); process.exit(1) }
```
WHY: house style reads identity/secrets from `process.env` and validates before use; hardcoding leaks numbers into VCS and breaks multi-deploy. (`examples/simple-bot.ts`)

---

## 3. Two content methods on one builder

❌
```typescript
await client.send(jid).text('hi').image('./a.jpg')   // type error / last wins, intent lost
```
✅
```typescript
await client.send(jid).image('./a.jpg', { caption: 'hi' })   // one content method
// or two separate sends:
await client.send(jid).text('hi')
await client.send(jid).image('./a.jpg')
```
WHY: each content method transitions `'init' → 'content-set'` and they are typed `this: MessageBuilder<'init'>` — only ONE is callable per builder. Use the content method's own option (e.g. `caption`) to combine. For multiple media in one bubble use `.album([...])`. (`src/builder/builder.ts`)

---

## 4. Not awaiting the key before edit/react/delete

❌
```typescript
const b = client.send(jid).text('hi')
await client.edit(b).text('bye')            // b is a builder, not a WAMessageKey
```
✅
```typescript
const key = await client.send(jid).text('hi')   // resolves to WAMessageKey
await client.edit(key).text('edited')
await client.react(key, '👍')
await client.delete(key)
```
WHY: the builder is a thenable; `await` (or `.then`) runs `send()` and resolves to the `WAMessageKey`. `edit/react/delete/forward` all take a `WAMessageKey`. Inside handlers prefer `ctx.reply()` / `ctx.react()` (see #13). (`src/builder/builder.ts` `then()`, `src/client/client.ts`)

---

## 5. Building your own reconnect loop

❌
```typescript
client.on('disconnect', () => client.connect())   // fights the built-in strategy
```
✅
```typescript
const client = new Client({ reconnect: { maxAttempts: 10, initialDelayMs: 1000, maxDelayMs: 30000 } })
client.on('disconnect', ({ reason, willReconnect }) => {
  console.log('down:', reason, willReconnect ? '(auto-reconnecting)' : '(final)')
})
```
WHY: the client owns reconnection — exponential backoff + jitter, skips fatal/logged-out reasons, clears auth when needed, and emits `reconnecting`. Calling `connect()` yourself races the internal timer. Tune via `reconnect` options; `willReconnect` tells you if it's already handled. (`src/client/client.ts` `handleClose`, `src/connection/reconnect.ts`)

---

## 6. Comparing raw JID instead of normalized digits for owner check

❌
```typescript
if (msg.senderId === '628123456789@s.whatsapp.net') { /* ... */ }   // device suffix / lid breaks this
```
✅
```typescript
const digitsOf = (jid: string) => (jid.split(/[:@]/)[0] ?? '').replace(/\D/g, '')
if (digitsOf(msg.senderId) !== OWNER) return
```
WHY: a JID may carry a device part (`:12`) or be a `@lid`; raw `===` fails. Normalize to bare digits before comparing. (`examples/simple-bot.ts`; `senderId` is the phone JID in `src/events/context.ts`)

---

## 7. Forgetting the qr handler

❌
```typescript
const client = new Client()
client.on('text', handle)                  // QR only printed to terminal; headless = stuck
```
✅
```typescript
const client = new Client()
client.on('qr', ({ qrString, expiresAt }) => {
  console.log('Scan:', qrString, 'expires', new Date(expiresAt))   // expiresAt is epoch MS
})
client.on('connect', ({ me }) => console.log('Connected as', me.id))
```
WHY: with `authType: 'qr'` (default) you must surface the QR or pairing flow; the `qr` event carries the string + `expiresAt` (~60s, epoch **milliseconds**). For pairing use `authType: 'pairing'` + `phoneNumber` and listen for `pairing-code`. (`src/client/client.ts` `handleQrUpdate`)

---

## 8. Assuming `aiRich()` exists

❌
```typescript
await client.send(jid).aiRich(markdown)     // no such method
```
✅
```typescript
await client.send(jid).text(markdown, { rich: true, title: '🤖 zaileys' })
```
WHY: there is no `aiRich()` content method. Rich rendering is a flag on `text()`: `opts.rich === true` routes through the AIRich renderer (markdown/LaTeX/directives). (`src/builder/builder.ts` `text()`, `docs/content/rich-responses.mdx`)

---

## 9. limitedTimeOffer `expiresAt` in ms instead of seconds

❌
```typescript
.buttons(btns, { limitedTimeOffer: { text: 'Sale', expiresAt: Date.now() + 3600_000 } })
```
✅
```typescript
.buttons(btns, { limitedTimeOffer: { text: 'Sale', expiresAt: Math.floor(Date.now() / 1000) + 3600 } })
```
WHY: `expiresAt` maps straight to WhatsApp's `expiration_time` (Unix **seconds**) with no conversion. Passing `Date.now()` (ms) yields a wildly future expiry. NOTE the inconsistency: the `qr`/`pairing-code` event `expiresAt` is epoch **milliseconds**; `timestamp` on a message is **milliseconds**. Only `limitedTimeOffer.expiresAt` is seconds. (`src/builder/content/buttons.ts`, `docs/content/interactive.mdx`)

---

## 10. `audio()` sending a voice note when you meant a file

❌
```typescript
await client.send(jid).audio('./song.mp3')              // ptt defaults TRUE → voice note + waveform
```
✅
```typescript
await client.send(jid).audio('./song.mp3', { ptt: false })   // shareable audio file
// voice note (intentional):
await client.send(jid).audio('./vn.ogg')                     // ptt:true, waveform auto-computed
```
WHY: `AudioOptions.ptt` defaults to `true` — `audio()` is a push-to-talk voice note (with waveform/duration) unless you pass `ptt: false`. (`src/builder/content/audio.ts` `ptt = opts?.ptt ?? true`)

---

## 11. Assuming all stores persist scheduled jobs

❌
```typescript
const client = new Client()                 // default MemoryMessageStore
await client.scheduleAt(date, (b) => b.to(jid).text('3am reminder'))
// process restarts before 3am → job is LOST
```
✅
```typescript
import { ConvexStore } from 'zaileys'        // only Convex implements persistence today
const client = new Client({ store: new ConvexStore(/* ... */) })
await client.scheduleAt(date, (b) => b.to(jid).text('3am reminder'))   // survives restart
```
WHY: `scheduleAt` persists only if the store implements `saveScheduledJob`/`listScheduledJobs`/`deleteScheduledJob`. Only the **Convex** adapter does. Memory (default), SQLite, Postgres, and Redis keep jobs in-process only — lost on restart. (`src/automation/schedule.ts` `persist`, `src/store/adapters/convex.ts`, `docs/content/automation.mdx`)

---

## 12. Pulling deps that require Node 22 while zaileys targets Node 20+

❌
```jsonc
// adding a dep with "engines": { "node": ">=22" } (e.g. file-type v22)
// breaks installs on the supported floor
```
✅
```jsonc
// keep deps Node-20-compatible; zaileys pins "file-type": "^21.x" for this reason
"engines": { "node": ">=20.0.0" }
```
WHY: `package.json` declares `engines.node >=20.0.0` and verifies Node 20/22/24. Adding a dependency that raises the floor (file-type v22 requires Node 22) breaks Node 20 users. zaileys deliberately pins `file-type@^21`. (`package.json`, `docs/content/runtimes.mdx`)

---

## 13. Using `ctx.reply()` / context wrong

❌
```typescript
client.on('text', async (msg) => {
  await client.send(msg.senderId).text('hi')          // loses quote, recomputes target, in groups goes to DM
})
```
✅
```typescript
client.on('text', async (msg) => {
  await msg.reply('hi')                                // quotes the message, correct room
  await msg.react('👍')
  const quoted = await msg.replied()                   // returns MessageContext | null (await it)
  if (quoted) console.log(quoted.text)
})
```
WHY: `ctx.reply` targets `remoteJid ?? roomId ?? senderId` and quotes the source — in a group that means the group, not the sender's DM. `replied()` is an async method returning `MessageContext | null` (not a property). Inside command handlers, `ctx.edit()` edits the last `ctx.reply()` and throws `NO_SENT_MESSAGE` if you never replied. (`src/events/context.ts`, `src/client/client.ts` `buildCommandContext`)

---

## 14. Ignoring `isFromMe` / `ignoreMe` → reply loops

❌
```typescript
const client = new Client({ ignoreMe: false })
client.on('text', async (msg) => {
  await msg.reply('echo: ' + msg.text)                 // bot's own replies re-trigger → infinite loop
})
```
✅
```typescript
const client = new Client()                            // ignoreMe defaults TRUE
client.on('text', async (msg) => {
  if (msg.isFromMe) return                             // belt-and-suspenders for own messages
  await msg.reply('echo: ' + msg.text)
})
```
WHY: `ignoreMe` defaults to `true` so the inbound pipeline drops messages the bot itself sent. Setting `ignoreMe: false` (or trusting it blindly) without guarding `msg.isFromMe` causes the bot to answer its own echoes forever. (`src/client/client.ts` `ignoreMe = options.ignoreMe ?? true`, pipeline `ignoreMe`)

---

## 15. Wrong JID format

❌
```typescript
await client.send('628123456789').text('hi')           // bare number — only OK as username-resolve, not a JID
await client.send('120363000@g.us').mentions(['628123456789'])   // mention needs full JID
```
✅
```typescript
await client.send('628123456789@s.whatsapp.net').text('hi')      // user JID
await client.send('120363000123456789@g.us').text('hi')          // group JID
await client.send(groupJid).text('hi').mentions(['628123456789@s.whatsapp.net'])
```
WHY: user JID = `<digits>@s.whatsapp.net`, group JID = `<id>@g.us`. `send()` accepts a raw string only because it falls back to username resolution; `mentions()` validates each entry contains `@` and throws `INVALID_OPTIONS` otherwise. Always pass full JIDs for explicit targets and mentions. (`src/client/client.ts` `send`/`isJid`, `src/builder/builder.ts` `mentions`)

---

## 16. One handler per message type instead of the `message` umbrella

❌
```typescript
client.on('text', logIt)
client.on('image', logIt)
client.on('video', logIt)
client.on('audio', logIt)
client.on('sticker', logIt)        // five registrations to catch every inbound message
```
✅
```typescript
client.on('message', (msg) => logIt(msg))   // fires once per inbound message, any chatType
// keep type-specific handlers ONLY when you branch on type:
client.on('text', handleCommands)
```
WHY: `message` is an umbrella event carrying the same `MessageContext` as the per-type events; it fires for every inbound message regardless of `chatType`. Use it for logging/middleware/analytics instead of registering (and maintaining) one handler per type. Branch on `msg.chatType` inside if you need type logic. (`src/events/types.ts` `InboundEventMap.message`, `src/events/pipeline.ts` `client.emit('message', …)`)

---

## 17. Building your own conversation key instead of `ctx.staticId`

❌
```typescript
const convoKey = `${msg.roomId}:${msg.senderId}`   // breaks on device suffix / @lid drift, null roomId
sessions.get(convoKey)
```
✅
```typescript
sessions.get(msg.staticId)            // stable per room+sender, already hashed
```
WHY: `staticId` is `hashHex(roomId ?? '' | senderId)` — a stable identifier for "this sender in this room" computed once per context. Hand-building `roomId:senderId` re-introduces the JID-normalization bugs (#6) and mishandles a `null` roomId (DMs). Use `staticId` as your map/cache key; use `uniqueId` to dedupe a single message. (`src/events/context.ts` `computeStaticId`, `MessageContext.staticId`)

---

## 18. `event()` in a 1:1 chat

❌
```typescript
await client.send(userJid).event({ name: 'Standup', startAt: Date.now() + 3600_000 })   // no card renders in DM
```
✅
```typescript
await client.send(groupJid).event({ name: 'Standup', startAt: Date.now() + 3600_000 })   // events are a group feature
```
WHY: WhatsApp event messages render only in **groups** — sending one to a DM produces no visible event card. Also note `event()` requires a non-empty `name` and a valid `startAt` (Date or epoch ms); a missing/invalid one throws `INVALID_OPTIONS`. (`src/builder/content/event.ts`; see `troubleshooting.md` "event message not visible in 1:1 chats")

---

## 19. `groupInvite()` `expiresAt` in ms + assuming the card always resolves

❌
```typescript
.groupInvite({ jid: groupJid, code, expiresAt: Date.now() + 86_400_000 })   // ms → absurd expiry
```
✅
```typescript
.groupInvite({ jid: groupJid, code, expiresAt: Math.floor(Date.now() / 1000) + 86_400 })   // unix SECONDS
```
WHY: `inviteExpiration` is unix **seconds** (default `now + 3 days`), same seconds convention as `limitedTimeOffer` (#9). Separately, the invite **card** may fail to resolve ("failed to get group info") when tapped on a companion/linked-device or LID-addressed group — the card is still valid, but resolution flakes. The raw invite **link** (`https://chat.whatsapp.com/<code>`) always works; share it as a fallback. `groupInvite()` requires a `@g.us` jid and a non-empty `code` or it throws `INVALID_OPTIONS`. (`src/builder/content/group-invite.ts`; see `troubleshooting.md`)

---

## 20. `videoNote()` vs `video()` / `audio()`

❌
```typescript
await client.send(jid).video('./clip.mp4')   // regular inline video, not a round PTV bubble
```
✅
```typescript
await client.send(jid).videoNote('./round.mp4')   // round push-to-video (PTV) note
```
WHY: `videoNote()` is the round PTV (push-to-video) bubble — it calls `video()` with `ptv: true`. It is the video analogue of `audio()`'s push-to-talk default (#10). Use plain `video()` for a normal inline clip. (`src/builder/builder.ts` `videoNote`, `src/builder/content/video.ts` `ptv`)

---

## 21. `product()` without a Business account / hand-rolling business ops via raw socket

❌
```typescript
await client.send(jid).product({ title: 'Tee', image: './t.jpg' })   // missing businessOwnerId → throws
client.socket.getCatalog(...)                                        // reaching past the public API
```
✅
```typescript
await client.send(jid).product({ title: 'Tee', image: './t.jpg', businessOwnerId: OWNER_JID })
const catalog = await client.business.catalog({ jid: OWNER_JID })    // typed module, connect-guarded
```
WHY: `product()` requires a non-empty `title` **and** a `businessOwnerId` (the WhatsApp **Business** account that owns the catalog) or it throws `INVALID_OPTIONS`; product send only works for Business accounts. Likewise the new `client.profile / .chat / .contact / .business` modules wrap the socket with connect guards (throw `NOT_CONNECTED` before connect) and typed signatures — use them instead of reaching into the raw Baileys socket. (`src/builder/content/product.ts`, `src/domain/{profile,chat,contact,business}.ts`)

---

## 22. Comparing mentions against `@lid`

❌
```typescript
if (msg.mentions.includes(SELF_LID)) { /* ... */ }                  // mentions are PN-resolved, won't match @lid
```
✅
```typescript
const digitsOf = (jid: string) => (jid.split(/[:@]/)[0] ?? '').replace(/\D/g, '')
if (msg.mentions.some((m) => digitsOf(m) === OWNER)) { /* ... */ }   // compare normalized digits
```
WHY: `ctx.mentions` are now resolved from `@lid` back to the phone-number JID via the session's LID map (`mapMentions`). Comparing against a raw `@lid` value fails; compare normalized digits or the `@s.whatsapp.net` JID. (`src/events/decoders/messages.ts` `mapMentions`)

---

## 23. ☁️ Cold free-form send on the cloud provider

❌
```typescript
const wa = new Client({ provider: 'cloud', cloud })
await wa.send('628xxx').text('Hi, check our promo!')   // 131047 if user never texted you / window closed
```
✅
```typescript
await wa.sendTemplate('628xxx', 'welcome', 'en_US')     // business-initiated = approved template only
```
WHY: the Cloud API only allows free-form messages inside the 24-hour customer-service window. Cold outreach and post-window sends must be **approved templates**. ([cloud.md](cloud.md))

---

## 24. ☁️ Template `parameters` that don't match `{{n}}`

❌ `await wa.sendTemplate(to, 'promo', 'id')` when the body is `Halo {{1}}` → Graph `132000`.
✅ Introspect first, then pass exactly: `await wa.cloud.templates.get('promo')` → `[{ type:'body', parameters:[{type:'text',text:'Budi'}] }]`.
WHY: Meta rejects a template send whose parameter count differs from the placeholder count.

---

## 25. ☁️ `rich: true` / groups / polls on cloud

❌ `wa.send(to).text(md, { rich: true })`, `wa.group.create(...)`, `wa.send(to).poll(...)` on `provider:'cloud'` → throws `UNSUPPORTED_ON_CLOUD` / `NOT_IMPLEMENTED`.
✅ Plain text (`*bold*`/`_italic_`/`` ```mono``` `` render natively); use the **unofficial** provider for groups/polls/AIRich.
WHY: those are WhatsApp-Web-only. The cloud provider fails loud, never silently.

---

## 26. ☁️ Forgetting the webhook / eating the raw body

❌ Building a cloud bot and expecting `on('text')` to fire from a persistent socket — cloud has **no socket**; without `wa.webhook()` mounted, nothing arrives. ❌ `app.use(express.json())` before the handler — a body-parser mangles the raw body and breaks `X-Hub-Signature-256` verification (→ 401).
✅ Mount `wa.webhook()` on a public URL, subscribe the `messages` field, and pass the **raw** body (`express.raw({ type: '*/*' })`). Make handlers idempotent (Meta retries).
WHY: inbound is push-based and signature-verified. ([cloud.md](cloud.md))

---

## Quick checklist for reviewers

- Mass send? → must use `broadcast` / `scheduleAt`, never a bare `await` loop.
- Numbers/secrets? → from `process.env`, validated.
- Builder chain? → exactly one content method; `await` it to get the key.
- Reconnect/QR? → rely on built-in reconnect; always handle `qr` (or `pairing-code`).
- `aiRich()` / `expiresAt` ms / `audio()` without `ptt` → flag.
- `scheduleAt` without Convex store → warn it won't survive restart.
- Handlers → use `msg.reply`/`msg.react`/`await msg.replied()`; guard `msg.isFromMe`.
- Owner/mention checks → normalized digits / full JIDs; mentions are PN-resolved, never compare to `@lid`.
- Logging/middleware over all messages → use the `message` umbrella event, not one handler per type.
- Conversation/session key → `ctx.staticId`, not a hand-built `roomId:senderId`.
- `event()` → groups only; `groupInvite()`/`limitedTimeOffer` `expiresAt` → unix seconds; share the invite link as fallback.
- `product()` → needs `businessOwnerId` + a Business account; profile/chat/contact/business via the modules, not the raw socket.
- New deps → keep `engines.node >=20` compatible.
- ☁️ Cloud: cold/out-of-window send → must be `sendTemplate` (not `send().text`); template params match `{{n}}`; webhook mounted + raw body + idempotent; no `group`/`poll`/`rich:true` (they throw `UNSUPPORTED_ON_CLOUD`).
