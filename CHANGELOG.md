# zaileys

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
