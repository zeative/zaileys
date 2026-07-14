# zaileys

## 4.8.2

### Patch Changes

- Rewrite the Agent Skill suite to be provider-aware — the bundled AI skills now teach the official Meta Cloud API provider (`provider: 'cloud'`, `wa.webhook()`, `sendTemplate`, `wa.cloud.*`, cloud events, the 24-hour window, and cloud error codes) alongside the unofficial WhatsApp Web provider, including a new cloud reference, cloud recipes, anti-patterns, and troubleshooting.

## 4.8.1

### Patch Changes

- Document the official Meta WhatsApp Cloud API provider in the README — Zaileys now runs on two providers (unofficial WhatsApp Web + official Cloud API) behind one API.

## 4.8.0

### Minor Changes

- 9541add: Official Meta WhatsApp Cloud API provider. `new Client({ provider: 'cloud', cloud: { accessToken, phoneNumberId, verifyToken, appSecret } })` keeps the full zaileys DX on the sanctioned API: `send().text/media/buttons/list/location/contact`, `reply`, `react`, `forward`, plus cloud-only `sendTemplate()`, `markRead(id, { typing })`, and a `message-status` event. Inbound arrives through `wa.webhook()` — a framework-agnostic `(Request) => Response` handler with GET verification and HMAC signature checks — and flows through the same event pipeline (`text`, `image`, `reaction`, `button-click`, `list-select`, ...). Web-only surfaces (`group`, `newsletter`, `community`, `privacy`, `presence`, `edit`, `delete`, `pin`) throw a typed `ZaileysProviderError('UNSUPPORTED_ON_CLOUD')`. The baileys provider stays the default and is completely unchanged. Batch 2 adds the cloud-only management namespace `wa.cloud.*`: template CRUD with a `template-status` event, business profile get/update, WhatsApp Flows (send + `flow-response` event + list), catalog commerce (product/product-list sends + inbound `order` event), address requests, blocklist, QR code links, conversation/messaging analytics, and phone-number registration management.

## 4.7.2

### Patch Changes

- 61bb53c: Remove `pg`/`redis` type imports from published typings — consumers without the optional peer deps no longer fail typecheck (TS2307). Declarations are now emitted by TypeScript 7 directly instead of bundled, and the packaging guard fails the build if any optional peer ever leaks into `dist` typings again.
- 2285bd7: Stop wiping a valid session on a spurious 401 (issue #54). WhatsApp sometimes emits a `logged-out` close right after a successful connect; the client now reconnects to confirm before clearing credentials. A genuine logout (the retry never re-opens) is still cleared, so no orphaned sessions are left behind.

## 4.7.1

### Patch Changes

- markRead Long timestamp NaN and empty lastMessages guard

## 4.7.0

### Minor Changes

- add downloadMedia(key) for store-backed media downloads
- re-export baileys message types from zaileys

## 4.6.2

### Patch Changes

- remove Lottie/WAS sticker conversion

## 4.6.1

### Patch Changes

- lossless single-pass webp for lottie stickers (crisper + faster)

## 4.6.0

### Minor Changes

- convert Lottie/WAS premium stickers to animated WebP

## 4.5.1

### Patch Changes

- detect premium/lottie stickers wrapped in lottieStickerMessage

## 4.5.0

### Minor Changes

- enable autoDelete by default with 1-month retention
- wire plugin loader into lifecycle
- recursive loader with fs.watch hot-reload
- registry with disposer-tracked load and unload
- add unuse to remove command middleware
- plugin types and definePlugin helper
- wire autoDelete sweeper into lifecycle
- add unregister to command registry
- autodelete sweeper + generic prune fallback
- convex adapter deleteMessage + pruneMessages
- redis adapter deleteMessage + pruneMessages
- postgres adapter deleteMessage + pruneMessages
- sqlite adapter deleteMessage + pruneMessages
- memory adapter deleteMessage + pruneMessages
- add pruneMessages/deleteMessage contract + types

### Patch Changes

- convert autoDelete cutoff to epoch seconds to match stored timestamps
- keep plugin loader alive across reconnects
- serialize hot-reload flush and tidy disposer rollback
- exclude msg-data keys from pruneMessages scan, drop redundant non-null assertion
- guard redundant DISTINCT fetch + wrap pruneMessages in ZaileysStoreError
- push the version tag explicitly (lightweight tags skip --follow-tags)

## 4.4.0

### Minor Changes

- re-export baileys jid helpers + client.lidToPn/pnToLid (LID<->PN resolve)
- expose public helpers — jid (normalize/isLid/isPn/jidToPhone/phoneToJid), id hashers, extractLinks, loadMedia, senderDeviceOf, epochSecondsToMs
- business module — profile/catalog/collections/orderDetails/product CRUD
- newsletter (react/subscribers/messages/adminCount/changeOwner/demote) + community (metadata/list/settings/approval) gaps
- group join-requests/list/inviteInfo/approval + contact module (check/save/remove)
- chat module — archive/pin/mute/markRead/star/delete/clear via chatModify
- profile module — setName/setStatus/setPicture/removePicture/getPicture/getStatus
- send product, requestPhoneNumber, sharePhoneNumber, limitSharing; client.setDisappearing
- videoNote (ptv) send + client.pin/unpin message
- groupInvite default expiry (~3d, unix seconds) and optional jpeg thumbnail
- send event and groupInvite messages
- decode group-invite, product, order, payment, and link-preview as media

### Patch Changes

- relay groupInvite as raw proto to skip pfp fetch (avoids item-not-found)
- floor event start/end to whole seconds (avoid fractional int64 timestamp)
- resolve LID-only sender/room/receiver to PN, not just mentions
- album counts are null when absent instead of a fabricated 0
- decode album messages as chatType album instead of empty text

## 4.3.0

### Minor Changes

- Add umbrella `message` event that fires for any inbound message type.
- Add `staticId` (stable hash of roomId+senderId) and make `uniqueId` a 16-char uppercase hex.
- Resolve `@lid` mentions to PN via the lid mapping, normalize device suffixes, and rewrite inline @numbers in text to match.
- Derive message flags from content: `isEdited`, `isDeleted`, `isPinned`, `isUnPinned`, `isBot`, `isStatusMention`, `isGroupStatusMention`, `isStory`, `isHideTags`.

### Patch Changes

- Fix quoted/`replied()` context: carry media, resolve sender LID→PN, inherit the parent chat room, and parse timestamps from number/string/Long.
- Fix `senderDevice` always reporting `android` (the device suffix was stripped before decoding).
- Bound LID mention resolution with a 3s timeout so a hung resolver never drops the message.

## 4.0.0

### Major Changes

**Zaileys v4.0.0 is a complete, breaking rewrite.** The public API was redesigned from the
ground up; v3.x code will not run unchanged. See [MIGRATION.md](./MIGRATION.md) for a
side-by-side upgrade guide.

#### Breaking

- Clean break from the v3.x API — no compatibility shim. `session` → `sessionId`,
  `prefix` → `commandPrefix`, raw `wa.on('messages', ...)` → typed per-event handlers,
  object-spread `send()` → chainable builder, file-based plugins → command framework.
- `phoneNumber` is now a `string` (was a number).
- Removed `showLogs` / `fancyLogs` / `showSpinner` (use the structural `logger` option),
  the bundled-FFmpeg `disableFFmpeg` flag, `definePlugins` / `pluginsDir` / `pluginsHmr`,
  `wa.inject` context injection, and the `citation` authorization helper.

#### Added

- **Baileys `7.0.0-rc13`** (from `7.0.0-rc.9`) — patches **CVE-2026-48063 /
  GHSA-qvv5-jq5g-4cgg** message-spoofing via `protocolMessage.type`. See
  [SECURITY.md](./SECURITY.md).
- **Typed event handlers** — `client.on('text' | 'image' | 'video' | 'audio' | 'document'
| 'sticker' | 'reaction' | 'edit' | 'delete' | 'poll-vote' | 'button-click' |
'list-select' | 'mention' | 'mention-all' | 'group-update' | 'group-join' |
'group-leave' | 'member-tag' | 'call-incoming' | 'call-ended' | 'history-sync' |
'limited' | 'presence' | 'newsletter', ...)` plus connection events (`connect`,
  `disconnect`, `qr`, `pairing-code`, `reconnecting`, `error`), each with a fully typed
  payload.
- **Chainable builder** — `client.send(jid).text().reply().mentions().mentionAll()
.image().video().audio().document().sticker().album().buttons().list().poll()
.location().contact()`; awaiting returns the sent `WAMessageKey`. Mutations:
  `client.edit(key)`, `client.delete(key, { forEveryone })`, `client.react(key, emoji)`,
  `client.forward(key, to)`.
- **Auto-connect lifecycle** — `new Client()` connects automatically (no `await
connect()`); auto-reconnect with backoff; QR or pairing-code selection from config.
- **Interactive messages** — native `buttons()` (`reply` / `url` / `copy` / `call` /
  `reminder` / `cancel-reminder` / `location` / `address`), `carousel()`, and `list()`
  (rendered via the modern nativeFlow `single_select` so they show on personal accounts),
  with optional `bottomSheet` / `limitedTimeOffer` params. Taps round-trip through the
  `button-click` / `list-select` events.
- **Rich (AIRich) responses** — `client.send(jid).text(markdown, { rich: true })` renders a
  Meta-AI-style rich card from plain markdown: syntax-highlighted code, tables, images,
  inline hyperlinks/citations/LaTeX, and `:::` directives (`product`, `suggest`, `reels`,
  `post`, `tip`, `video`). EXPERIMENTAL — reverse-engineered format.
- **Pluggable storage** — independent `AuthStore` and `MessageStore` interfaces with
  `file` (default), `memory`, `sqlite`, `redis`, `postgres`, and `convex` adapters. Auth and
  message backends can differ.
- **Message-context actions everywhere** — every inbound context exposes `msg.reply(content,
{ rich? })` (quotes the message) and `msg.react(emoji)`, not just command contexts.
- **Command framework** — `client.command(name, handler)`, `client.use(middleware)`,
  configurable `commandPrefix`, argument parsing, and a typed context (`ctx.args`,
  `ctx.reply`, `ctx.react`, `ctx.edit`).
- **Automation utilities** — `client.broadcast(jids, builder, { rateLimitPerSec })` with
  built-in rate limiting and `client.scheduleAt(date, builder)` with store-persisted jobs.
- **Domain modules** — `client.group.*`, `client.privacy.*`, `client.newsletter.*`,
  `client.community.*`, `client.presence.*`.
- New Baileys rc10–rc13 surface: album messages, `mentionAll`, member tags,
  `history-sync` status, 463 reach-out timelock (`on('limited')`), v2 newsletter
  endpoints, username-addressed messages, companion-registration QR format.
- **Dual ESM/CJS** packaging — both `import` and `require` entry points plus `.d.ts` and
  `.d.cts` types. Verified to load on **Node `>=20`, Bun, Deno, and Termux**; all node
  builtins use the `node:` protocol for strict-runtime compatibility.
- Built and type-checked with **TypeScript 7 native** (`tsgo`).

## 3.3.0

### Minor Changes

- af105e0: update sharp and ffmpeg

### Patch Changes

- Updated dependencies [af105e0]
  - @zaileys/media-process@2.5.0

## 3.2.0

### Minor Changes

- chore: fix npm install footprint and git ignores

### Patch Changes

- Updated dependencies
  - @zaileys/media-process@2.4.0

## 3.1.2

### Patch Changes

- chore: fix npm install footprint and git ignores
- Updated dependencies
  - @zaileys/media-process@2.3.1

## 3.1.1

### Patch Changes

- remove unused file for npm

## 3.1.0

### Minor Changes

- 62a34dc: optimize for linux & android

### Patch Changes

- Updated dependencies [62a34dc]
  - @zaileys/media-process@2.3.0
