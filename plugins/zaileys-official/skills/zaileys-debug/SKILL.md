---
name: zaileys-debug
description: >-
  Use when a zaileys app throws an ERROR/exception/stack trace (or a `.code` like
  EMPTY_CONTENT, INVALID_OPTIONS, SEND_FAILED, STORE_NOT_AVAILABLE, UNSUPPORTED_ON_CLOUD,
  or a Graph code like 131047/132000) or hits a runtime PROBLEM ("kenapa error", "not
  working", "failed to", reconnect loop, QR keeps regenerating, "Cannot find module",
  session invalid/corrupted, webhook 401/403, template rejected) and wants it diagnosed
  and fixed. Covers BOTH providers — unofficial WhatsApp Web and the official Meta Cloud
  API. The zaileys (Node/TS WhatsApp framework) error doctor.
---

# zaileys — debug (diagnose & fix)

Diagnose a zaileys failure to root cause, then give the concrete fix with runnable TS.
Import is always `import { Client } from 'zaileys'`. NEVER invent error codes — only the
codes below have real throw sites. Some union codes are reserved (no throw site today) —
respect that and do not present them as live.

## Workflow

1. **Classify the failure.** Is it a *thrown exception* (has an error class and/or a
   `.code`) or a *runtime symptom* (no exception — a loop, a log line, a missing module, a
   silent misbehavior)?
   - Thrown exception → step 2.
   - Runtime symptom → step 4.
   - A dropped connection is NOT an exception — it's the `disconnect` event; map its
     `reason` (step 5).
   - A background/auto-connect failure surfaces via the `error` event, not a throw (step 5).

2. **Identify the class** by the operation that failed, then `instanceof` + switch on `.code`:
   - building/sending/editing/forwarding a message, or `client.send()` failing → `ZaileysBuilderError`
   - command registry / middleware / handler / `ctx.edit` → `ZaileysCommandError`
   - `client.group` / `.privacy` / `.newsletter` / `.community` / `.profile` / `.chat` / `.contact` / `.business` → `ZaileysDomainError`
   - `client.scheduleAt` / presence / rate limiter → `ZaileysAutomationError`
   - any auth-store or message-store backend (file/sqlite/postgres/redis/convex) → `ZaileysStoreError`

3. **Match `.code` → cause → fix** (tables below). Read `err.message` for the exact
   constraint (counts, ranges, JID, fileName). If `err.cause` is set (`SEND_FAILED`,
   `HANDLER_ERROR`, `MIDDLEWARE_ERROR`, `PRESENCE_FAILED`, most `STORE_*`, some
   `SCHEDULE_INVALID`), narrow it (`err.cause instanceof Error`) and read the real root error.

4. **Match the runtime symptom** → cause → fix (Runtime symptoms below).

5. **Connection-level failures:** map `disconnect` `reason` (fatal vs transient) and ensure
   an `error` listener exists.

Then apply the fix and, if useful, capture a debug log (last section).

## Narrowing snippet (instanceof + .code)

```typescript
import {
  ZaileysBuilderError, ZaileysCommandError, ZaileysDomainError,
  ZaileysAutomationError, ZaileysStoreError,
} from 'zaileys'

try {
  await op()
} catch (err) {
  if (err instanceof ZaileysBuilderError) {
    switch (err.code) {
      case 'EMPTY_CONTENT':     /* set content before await */ break
      case 'INVALID_OPTIONS':   console.error(err.message); break // exact constraint is in .message
      case 'SEND_FAILED':       console.error('baileys rejected:', err.cause); break // transient → retry
      case 'MEDIA_LOAD_FAILED': console.error(err.cause); break
      default:                  console.error(err.code, err.message)
    }
  } else if (err instanceof ZaileysStoreError) {
    if (err.code === 'STORE_NOT_AVAILABLE') {/* install the peer dep named in err.message */}
    if (err.code === 'STORE_CORRUPTED')     {/* wipe session, re-auth */}
  } else throw err
}
```

**☁️ Cloud provider adds two classes** — `ZaileysCloudError` (codes `CONFIG`/`AUTH`/`REQUEST_FAILED`/
`RATE_LIMITED`/`NOT_IMPLEMENTED`; Graph code embedded in `.message` like `(#131047)`) and
`ZaileysProviderError` (`UNSUPPORTED_ON_CLOUD`, `.feature` = the offending surface). Full taxonomy +
Graph-code table → [references/errors.md](../zaileys-assist/references/errors.md) and
[references/cloud.md](../zaileys-assist/references/cloud.md).

```typescript
import { ZaileysCloudError, ZaileysProviderError } from 'zaileys'
if (err instanceof ZaileysProviderError) {/* web-only surface on cloud → use unofficial or wa.cloud.* */}
if (err instanceof ZaileysCloudError) {
  if (err.message.includes('131047')) {/* cold/out-of-window → wa.sendTemplate() */}
  if (err.message.includes('132000')) {/* template param count ≠ {{n}} */}
  if (err.code === 'AUTH')            {/* token expired → permanent System User token */}
  if (err.code === 'CONFIG')          {/* missing cloud.* field (e.g. wabaId) */}
}
```

All five classes share the shape `{ readonly code: string; readonly name: string; readonly cause?: unknown }`
and extend `Error`. `code` is a per-class string-literal union (TS autocompletes it).

## Most-common thrown errors (condensed)

`ZaileysBuilderError` — codes `MEDIA_LOAD_FAILED · INVALID_RECIPIENT(reserved) · USERNAME_NOT_FOUND · EMPTY_CONTENT · INVALID_OPTIONS · SEND_FAILED · MESSAGE_NOT_FOUND`

| code | cause | fix |
| --- | --- | --- |
| `INVALID_OPTIONS` + msg `client not connected` | `client.send()` called before `state === 'connected'`. This is the **connect guard** — there is NO `NOT_CONNECTED` code on the builder. | Guard: `if (client.state !== 'connected') return` before sending; or send from inside `connect`/message handlers. |
| `INVALID_OPTIONS` (other) | Catch-all validation failure (poll counts, button ids, location range, list rows, vcard, video mime, etc.). | Read `err.message` — it states the exact constraint; fix that option. |
| `INVALID_OPTIONS` from `event()` | `event() requires a non-empty name`, or `event() <startAt\|endAt> must be a valid Date or epoch ms` (invalid/NaN date). | Pass a non-empty `name` + a valid `startAt` (`Date` or epoch **ms**). |
| `INVALID_OPTIONS` from `groupInvite()` | `groupInvite() requires a group jid ending in @g.us`, or `... requires an invite code` (empty `code`). | Pass `jid` ending `@g.us` + non-empty `code`. `expiresAt` must be unix **seconds** (see runtime symptoms). |
| `INVALID_OPTIONS` from `product()` | `product() requires a non-empty title`, or `product() requires businessOwnerId`. | Pass non-empty `title` + `businessOwnerId` (the business-account jid). `image` is loaded via media-loader → may throw `MEDIA_LOAD_FAILED`. |
| `EMPTY_CONTENT` | A content method got empty input, or builder awaited with no content set (`text() requires a non-empty string`, `no content set`). | Call a content method with non-empty input before `await`: `await client.send(jid).text('hi')`. |
| `MEDIA_LOAD_FAILED` | Media source couldn't be fetched/read/converted: non-2xx fetch, network error, missing local file, audio transcode or sticker conversion failure. | Verify URL returns 2xx / file exists & readable; ensure ffmpeg/sharp present for audio/sticker; inspect `.cause`. |
| `USERNAME_NOT_FOUND` | `username "<x>" not found` — a `@username` couldn't resolve to a JID. | Pass a raw JID instead (`628xxx@s.whatsapp.net`), or confirm the username is reachable. |
| `SEND_FAILED` | Socket accepted but rejected / returned no key (incl. interactive content needing `relayMessage`). `.cause` = Baileys rejection. | Transient — retry with backoff. Inspect `.cause`. For buttons/list/carousel/template ensure the socket supports `relayMessage`. |
| `MESSAGE_NOT_FOUND` | `message not found in store for forward` — forwarded message absent from store. | Configure a `store` and ensure the source message was captured before forwarding. |

New v4.4 send methods route through the same codes: `videoNote()` → `MEDIA_LOAD_FAILED` (loads media, `ptv:true`); `product()` → `INVALID_OPTIONS`/`MEDIA_LOAD_FAILED`; `event()`/`groupInvite()` → `INVALID_OPTIONS`; all relay-built (`groupInvite`, buttons/list/carousel/template) can hit `SEND_FAILED` if the socket lacks `relayMessage`. `requestPhoneNumber()`/`sharePhoneNumber()`/`limitSharing()` set static content and do not validate (no throw at build).

`ZaileysStoreError` — codes `STORE_NOT_AVAILABLE · STORE_CONNECTION_FAILED · STORE_WRITE_FAILED · STORE_READ_FAILED · STORE_CORRUPTED · STORE_CLOSED` (auth + message stores, all backends)

| code | cause | fix |
| --- | --- | --- |
| `STORE_NOT_AVAILABLE` | Missing optional peer dep. Exact msgs: `pg is not installed. Run: pnpm add pg`, `redis peer dependency missing. Run: pnpm add redis`, `better-sqlite3 belum terpasang. Run: pnpm add better-sqlite3`, `convex peer dependency missing. Run: pnpm add convex`. | Install the peer dep named in `err.message` (`pg` / `redis` / `better-sqlite3` / `convex`). File/Memory adapters need none. |
| `STORE_CONNECTION_FAILED` | Bad config or connect failure: `provide either pool or connectionString, not both`, `pass either client OR url, not both`, redis client not open, `failed to connect to redis at <url>`, `failed to migrate ... schema`. | Pass exactly one of pool/connectionString (or client/url). `await redisClient.connect()` first. Inspect `.cause`. |
| `STORE_CORRUPTED` | `failed to parse sqlite blob` — stored data unparseable. | Wipe the session/store and re-authenticate. |
| `STORE_CLOSED` | Op after `close()` (`<X>Store is closed`). | Recreate the store; don't use after `close()`. |
| `STORE_WRITE_FAILED` / `STORE_READ_FAILED` | A write/read op failed. | Inspect `.cause` (driver, disk, permissions, connectivity, schema). |

`ZaileysCommandError` — `DUPLICATE_COMMAND · INVALID_COMMAND_NAME · HANDLER_ERROR · MIDDLEWARE_ERROR · NO_SENT_MESSAGE · NOT_CONNECTED(reserved)`
- `HANDLER_ERROR` → your handler threw; root error on `.cause`. `MIDDLEWARE_ERROR` → middleware threw or `next()` called multiple times. `NO_SENT_MESSAGE` → `ctx.edit` requires a prior `ctx.reply`. `DUPLICATE_COMMAND` → rename/remove the duplicate. `INVALID_COMMAND_NAME` → non-empty command spec, no empty segments.

`ZaileysDomainError` — `NOT_CONNECTED · GROUP_NOT_FOUND(reserved) · NEWSLETTER_NOT_FOUND · INVALID_PARTICIPANT(reserved) · OPERATION_FAILED`
- `NOT_CONNECTED` → wait for the `connect` event before calling `group`/`privacy`/`newsletter`/`community`/`profile`/`chat`/`contact`/`business` (all throw it pre-connect, msg `client not connected`). `NEWSLETTER_NOT_FOUND` → verify the channel JID. `OPERATION_FAILED` → invite code/permission issue, **or** `chat.star`/`unstar` got a message key with no `remoteJid` (`message key is missing remoteJid`); read `.message`.

`ZaileysAutomationError` — `NOT_CONNECTED · RATE_LIMIT_INVALID · SCHEDULE_INVALID · PRESENCE_FAILED · TASK_FAILED(reserved) · STORE_UNAVAILABLE(reserved)`
- `SCHEDULE_INVALID` → pass a real `Date`; builder must return content and not throw. `RATE_LIMIT_INVALID` → every rate value `> 0`. `PRESENCE_FAILED` → inspect `.cause`, retry. `NOT_CONNECTED` → wait for `connect`.

> Reserved codes (in the union, NO throw site today — you will not see them at runtime):
> builder `INVALID_RECIPIENT`; command `NOT_CONNECTED`; domain `GROUP_NOT_FOUND`, `INVALID_PARTICIPANT`;
> automation `TASK_FAILED`, `STORE_UNAVAILABLE`. Note: `client.broadcast()` does NOT throw per bad
> recipient — it resolves `{ sent, failed: { jid, error }[] }`; inspect `failed`.

Full per-code throw-site tables: `references/errors.md` (in the sibling `zaileys-assist` skill).

## Most-common runtime symptoms (condensed)

Default auth path: `./.zaileys/auth/<sessionId>` (`sessionId` default `'default'`). Status
lines are prefixed `[zaileys]` on **stderr** (`statusLog`, default `true`).

| Symptom | Cause | Fix |
| --- | --- | --- |
| **QR keeps regenerating / "session looks invalid or corrupted"** (authenticates then drops; hint appended from attempt 2: `bad-session`) | Saved creds corrupt; socket never reaches `open`. | Delete the auth folder and re-auth: `rm -rf ./.zaileys` (all) or `rm -rf ./.zaileys/auth/default` (one session — replace `default` with your `sessionId`). |
| **Reconnect loop** (`[zaileys] Connection lost (<reason>). Reconnecting in <s>s (attempt <n>)...`) | Normal auto-reconnect (exp backoff + jitter). Helps only for transient reasons (see disconnect table). | Observe/tune via `reconnect` option (defaults: `enabled:true, maxAttempts:Infinity, initialDelayMs:1000, maxDelayMs:60000, jitterFactor:0.2`). Stuck on `bad-session` → wipe auth folder. `reconnect:{enabled:false}` to disable. |
| **Pairing fails before any code** (`phoneNumber is required when authType is "pairing"`, `phoneNumber must be E.164 with country code`, or `failed to request pairing code: <reason>`) | E.164 validation: digits only, 8–15 long. Last form = passed validation but WhatsApp refused (not on WA / rate-limited). | Pass E.164 with country code, drop leading local `0`, no `+`: `phoneNumber: '628123456789'`. Wait a few minutes if rate-limited. |
| **"Cannot find module" for a DB adapter** (`ZaileysStoreError` `STORE_NOT_AVAILABLE`) | Heavy drivers are optional peer deps, loaded lazily. | Install the one your adapter uses: `pg` / `redis` / `better-sqlite3` / `convex`. |
| **ESM vs require** (`ERR_REQUIRE_ESM`, `Cannot use import statement outside a module`, `require is not defined`) | File ext / `package.json` `"type"` disagrees with import style. Needs Node **>= 20**. | Stay consistent: ESM `import { Client } from 'zaileys'`; CJS `const { Client } = require('zaileys')`. For TS run `npx tsx index.ts`; set `"module": "NodeNext"`/`"Bundler"`. |
| **Bun `ws` / WebSocket warnings** | Noise from Bun's `ws` shim, not zaileys (libsignal `Closing session:` is suppressed). | Benign — ignore. Keep `ZAILEYS_DEBUG` unset for quiet startup. |
| **Bot never sees my own messages** | `ignoreMe` defaults to `true` (drops `fromMe` to avoid self-loops). | `new Client({ ignoreMe: false })`; then gate replies on sender/prefix to avoid an echo loop. |
| **`sharp` not installed but images/stickers still work (slower)** | `sharp` is optional, probed opportunistically; falls back to bundled `jimp`. Missing `sharp` never throws. | Nothing needed. `npm i sharp` only for the faster native pipeline. ffmpeg/ffprobe are bundled. |
| **`event()` sends OK but nothing appears in a 1:1 chat** | WhatsApp renders event messages **only in groups**, not DMs. The send succeeds; it's a client-side render rule, not a zaileys bug. | Send events to a group jid (`@g.us`). |
| **`groupInvite()` card shows but tapping it fails ("failed to get group info")** | Card is built correctly and the invite **code is valid** (`chat.whatsapp.com/<code>` resolves). WhatsApp's invite-card resolution fails on **linked-device (companion) sessions** and/or LID-addressed groups. | Share the invite **link as text**, or test from a primary-phone session. Also ensure `expiresAt` is unix **seconds** — a milliseconds value makes WhatsApp show "Invite expired". |

| **☁️ Cloud: `on('text')` never fires** | No `wa.webhook()` mounted or `messages` field not subscribed. Cloud has no socket — `connect()` alone won't deliver inbound. | Mount `wa.webhook()` on a public HTTPS URL; subscribe `messages`. Webhook works even without `connect()`. |
| **☁️ Cloud: webhook 403 (GET) / 401 (POST)** | 403 = verify token mismatch; 401 = bad signature (raw body was mutated by a parser). | Match `cloud.verifyToken` to the dashboard; on Express use `express.raw({ type:'*/*' })`; check `cloud.appSecret`. |
| **☁️ Cloud: every send `(#131047)`** | Outside the 24h window / recipient never texted you. | `wa.sendTemplate(to, name, lang, components)`. |

**LID/PN resolution:** `client.lidToPn(lid)` / `client.pnToLid(pn)` **return `null`** (never throw) when the mapping is unavailable. The `message` umbrella event and its `mentions` are **PN-resolved** — a handler keyed on raw `@lid` mentions will miss; match the resolved PN jid instead.

For Deno (`--node-modules-dir`), Termux native builds, and `file-type`/Node-version
mismatches, see `references/troubleshooting.md`.

## Connection-level diagnosis

**Disconnect reasons** — `client.on('disconnect', ({ reason, willReconnect }) => ...)`.

| `reason` | fatal? | clears auth? | reconnects? | action |
| --- | --- | --- | --- | --- |
| `logged-out` | Yes | Yes | No | Re-authenticate (new QR / pairing). |
| `connection-replaced` | Yes | Yes | No | Same account opened elsewhere; one socket only. |
| `forbidden` | Yes | Yes | No | Account blocked; manual intervention. |
| `bad-session` | No | Yes | Yes | Auth cleared, reconnects — but corrupt-on-disk loops; wipe auth folder. |
| `restart-required` / `connection-closed` / `connection-lost` / `multi-device-mismatch` / `unavailable-service` / `unknown` | No | No | Yes | Transient — zaileys reconnects automatically. |

Fatal = `logged-out ∨ connection-replaced ∨ forbidden` → `willReconnect: false`.

**Background failures** (chiefly auto-connect) surface via the `error` event, NOT a throw — and
only if a listener is **already attached** before connection starts. With `autoConnect` (default
`true`), register it synchronously right after construction or failures are swallowed.

```typescript
const client = new Client({ authType: 'qr' })
client.on('error', ({ sessionId, error }) => console.error(`[${sessionId}]`, error.message))
client.on('disconnect', ({ reason, willReconnect }) => {
  if (!willReconnect) console.error('fatal disconnect — re-auth required:', reason)
})
client.on('reconnecting', ({ attempt, delayMs, reason }) => console.log(`retry #${attempt} in ${delayMs}ms (${reason})`))
```

## Logout vs reset

- `await client.disconnect()` — closes socket, **keeps** creds (reconnect later, no re-scan).
- `await client.logout()` — unlinks the device on WhatsApp + wipes creds; next run needs a fresh QR/pairing. Emits final `disconnect` `reason: 'logged-out'`.
- Offline reset (can't start the app): delete the folder — `rm -rf ./.zaileys/auth/default`. With a DB auth adapter, `logout()` clears rows there instead of a folder.

## Capture a debug log

`[zaileys]` status lines (`statusLog`) are separate from `ZAILEYS_DEBUG` (pino, default `silent`).

```bash
ZAILEYS_DEBUG=1 node index.js            # info
ZAILEYS_DEBUG=debug npx tsx index.ts     # verbose
ZAILEYS_DEBUG=trace npx tsx index.ts 2>&1 | tee zaileys-debug.log   # full bug report
```

Levels: `fatal|error|warn|info|debug|trace`; anything else → `silent`. `statusLog: false`
silences the `[zaileys]` lines. Report at github.com/zeative/zaileys with the log + runtime version.

## Full references

- `references/errors.md` (sibling `zaileys-assist` skill) — every class + `.code` with exact throw sites.
- `references/troubleshooting.md` (sibling `zaileys-assist` skill) — all runtime symptoms.
- Live full docs (single file): <https://zeative.github.io/zaileys/llms-full.txt>.


## Live docs (fetch for the latest)

These are authoritative and kept in sync with the code — **fetch them** when you need more detail, the newest API, or to verify before answering (do not guess when unsure):

- **Docs site:** <https://zeative.github.io/zaileys/>
- **Full docs as one file (best for LLMs):** <https://zeative.github.io/zaileys/llms-full.txt>
- **Per-topic pages:** `/getting-started` · `/installation` · `/configuration` · `/client` · `/events` · `/sending-messages` · `/media` · `/interactive` · `/rich-responses` · `/commands` · `/automation` · `/storage` · `/error-handling` · `/runtimes` · `/troubleshooting` · `/api-reference` (e.g. <https://zeative.github.io/zaileys/sending-messages>)
