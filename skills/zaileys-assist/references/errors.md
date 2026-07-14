# zaileys Error Reference

Definitive error-diagnosis reference. Read this FIRST when diagnosing a zaileys exception: identify the class, match the `.code`, apply the fix.

## Error model

zaileys throws exactly **five** error classes. All extend `Error`, all are exported from the package root, all share an identical shape:

```typescript
class ZaileysXxxError extends Error {
  readonly code: <ErrorCode>   // stable string literal — switch on this
  readonly name: 'ZaileysXxxError'
  readonly cause?: unknown     // underlying error when wrapped, else undefined
}
```

```typescript
import {
  ZaileysBuilderError,
  ZaileysCommandError,
  ZaileysDomainError,
  ZaileysAutomationError,
  ZaileysStoreError,
} from 'zaileys'
```

| Class | `name` | Thrown by | source |
| --- | --- | --- | --- |
| `ZaileysBuilderError` | `'ZaileysBuilderError'` | message builder, content methods, send/edit/forward, album, media loader, `client.send()` connect guard | `src/builder/*`, `src/client/client.ts` |
| `ZaileysCommandError` | `'ZaileysCommandError'` | command registry, middleware, dispatcher, `ctx.edit` | `src/command/*`, `src/client/client.ts` |
| `ZaileysDomainError` | `'ZaileysDomainError'` | `client.group`, `client.privacy`, `client.newsletter`, `client.community`, `client.profile`, `client.chat`, `client.contact`, `client.business` | `src/domain/*` |
| `ZaileysAutomationError` | `'ZaileysAutomationError'` | `client.scheduleAt`, presence, rate limiter | `src/automation/*` |
| `ZaileysStoreError` | `'ZaileysStoreError'` | auth stores + message stores (file/sqlite/postgres/redis/convex) | `src/auth/adapters/*`, `src/store/adapters/*`, `src/types/convex.ts` |

> `code` is a string-literal union per class — TS autocompletes valid values and flags typos. `cause` is typed `unknown`; narrow with `err.cause instanceof Error` before reading `.message`.

Canonical narrowing pattern:

```typescript
try {
  await op()
} catch (err) {
  if (err instanceof ZaileysBuilderError) {
    switch (err.code) {
      case 'EMPTY_CONTENT': /* ... */ break
      case 'SEND_FAILED':   console.error(err.cause); break
      default:              console.error(err.code, err.message)
    }
  } else throw err
}
```

---

## ZaileysBuilderError

Codes (union): `MEDIA_LOAD_FAILED` `INVALID_RECIPIENT` `USERNAME_NOT_FOUND` `EMPTY_CONTENT` `INVALID_OPTIONS` `SEND_FAILED` `MESSAGE_NOT_FOUND`

| code | meaning | how to fix |
| --- | --- | --- |
| `MEDIA_LOAD_FAILED` | A media source could not be fetched/read or converted. Triggers: `fetch <url> failed with status <n>` (non-2xx), `fetch <url> failed: ...` (network), `read <path> failed: ...` (local file), `audio() transcode failed: ...`, `sticker() conversion failed: ...`. | Verify URL returns 2xx / file path exists & readable. For audio/sticker, ensure ffmpeg/sharp deps present and the source is valid media. Inspect `.cause` for the underlying fetch/fs/transcode error. |
| `INVALID_RECIPIENT` | Target JID is not a valid WhatsApp recipient. *(Defined in the union; no current throw site in src — reserved.)* | Use a valid JID: user `628xxx@s.whatsapp.net`, group `xxx@g.us`. |
| `USERNAME_NOT_FOUND` | `username "<x>" not found` — a `@username` could not be resolved to a JID (`src/builder/username-resolve.ts`). | Confirm the username exists/is reachable; pass a raw JID instead. |
| `EMPTY_CONTENT` | A content method got empty input, or builder awaited with no content set. Triggers: `text() requires a non-empty string`, `poll() requires a non-empty question`, `edit() requires a content method before await`, `no content set`. | Set non-empty content before `await`. Always call a content method (`.text()`, `.image()`, …) before awaiting `client.send(...)` / `client.edit(...)`. |
| `INVALID_OPTIONS` | Options failed validation. **This is the catch-all validation code** — also used for the connect guard. See full trigger list below. | Read `err.message` — it states the exact constraint. Fix the option. |
| `SEND_FAILED` | Socket accepted but rejected or returned no key. Triggers: `socket sendMessage rejected` (cause set), `socket returned no message key`, `socket does not support relayMessage (interactive content)`, `interactive media upload failed` (cause), `failed to generate relay message key`, `socket relayMessage rejected` (cause), `album parent/child send rejected` (cause), `album parent returned no message key`. | Transient — retry with backoff. Check `.cause` for the Baileys rejection. For interactive content (buttons/list/carousel/template), ensure the socket supports `relayMessage`. |
| `MESSAGE_NOT_FOUND` | `message not found in store for forward` — the message referenced for `forward` is absent from the store (`src/builder/mutations.ts`). | Ensure a `store` is configured and the source message was captured before forwarding. |

`INVALID_OPTIONS` full trigger map (message → cause):

| message (verbatim, `${}` = runtime value) | source |
| --- | --- |
| `client not connected` | `src/client/client.ts:502` — **the connect guard**. `client.send()` called before `state === 'connected'`. NOT a separate NOT_CONNECTED code. |
| `message key is missing remoteJid` | edit-builder, mutations |
| `reply() requires a quoted message or key` | builder.ts |
| `mentions() requires at least one jid` / `invalid jid: ${jid}` | builder.ts |
| `disappearing() requires a positive integer duration` | builder.ts |
| `contact() requires a vcard string starting with BEGIN:VCARD` | content/contact |
| `video() expects a video source, got mime ${mime}` (also covers `videoNote()`, which calls `video()` with `ptv: true`) | content/video |
| `event() requires a non-empty name` / `event() ${field} must be a valid Date or epoch ms` (`field` = `startAt`/`endAt`) | content/event |
| `groupInvite() requires a group jid ending in @g.us` / `groupInvite() requires an invite code` | content/group-invite |
| `product() requires a non-empty title` / `product() requires businessOwnerId` | content/product |
| `poll() requires a minimum of ${MIN} options` / `accepts a maximum of ${MAX}` / `poll options must be non-empty strings` / `duplicate poll options: ${o}` | content/poll |
| `template() requires a non-empty body` / `requires at least one button` / `accepts at most ${MAX} buttons` | content/template |
| `document() requires a non-empty fileName` | content/document |
| `button text must be a non-empty string` / `reply button requires a non-empty id` / `duplicate button id: ${id}` / `url button requires a non-empty url` / `copy button requires a non-empty code` / `call button requires a non-empty phone` / `unknown button type: ${t}` / `buttons() requires at least one button` / `accepts at most ${MAX}` | content/buttons |
| `carousel() requires at least one card` / `accepts at most ${MAX} cards` | content/carousel |
| `location() latitude must be within -90..90` / `longitude must be within -180..180` | content/location |
| `list() requires a non-empty buttonText` / `requires at least one section` / `each list section requires at least one row` / `list row id must be a non-empty string` / `list row title must be a non-empty string` / `duplicate list row id: ${id}` / `accepts at most ${MAX} rows total` | content/list |
| `album() item type must be 'image' or 'video'` / `requires a minimum of ${MIN}` / `accepts a maximum of ${MAX}` | builder/album |
| airich: `table must be a non-empty array of string rows`, `text({ rich: true }) requires non-empty markdown content`, `image/video requires at least one url`, `product/reels/post requires at least one item`, `suggest requires at least one prompt` | content/airich |

> The newer no-arg/flag content methods `requestPhoneNumber()`, `sharePhoneNumber()`, and `limitSharing(enabled?)` set content directly and perform **no** option validation — they do not throw `INVALID_OPTIONS`. A bad value surfaces later as `SEND_FAILED` if the socket rejects it.

```typescript
// Connect guard — preempt the INVALID_OPTIONS "client not connected"
if (client.state !== 'connected') return
await client.send('628xxx@s.whatsapp.net').text('hi')
```

---

## ZaileysCommandError

Codes: `DUPLICATE_COMMAND` `INVALID_COMMAND_NAME` `HANDLER_ERROR` `MIDDLEWARE_ERROR` `NO_SENT_MESSAGE` `NOT_CONNECTED`

| code | meaning | how to fix |
| --- | --- | --- |
| `DUPLICATE_COMMAND` | `command "<key>" is already registered` (`src/command/registry.ts`). | Rename one command or remove the duplicate registration. |
| `INVALID_COMMAND_NAME` | `command spec must not be empty` or `empty command segment in spec`. | Provide a non-empty command name with no empty segments. |
| `HANDLER_ERROR` | `command handler failed` — your handler threw; original on `.cause` (`src/command/dispatcher.ts`). | Inspect `.cause`; fix the handler. |
| `MIDDLEWARE_ERROR` | `middleware threw during execution` (cause set) or `next() called multiple times` (`src/command/middleware.ts`). | Fix the throwing middleware; call `next()` exactly once. |
| `NO_SENT_MESSAGE` | `ctx.edit requires a prior ctx.reply` (`src/client/client.ts:456`). | Call `ctx.reply(...)` before `ctx.edit(...)`. |
| `NOT_CONNECTED` | Command op needed a live socket but client not connected. *(Defined in union; no current throw site in src — reserved.)* | Wait for `connect` before dispatching. |

```typescript
if (err instanceof ZaileysCommandError && err.code === 'HANDLER_ERROR') {
  console.error('handler crashed:', err.cause)
}
```

---

## ZaileysDomainError

Codes: `NOT_CONNECTED` `GROUP_NOT_FOUND` `NEWSLETTER_NOT_FOUND` `INVALID_PARTICIPANT` `OPERATION_FAILED`

| code | meaning | how to fix |
| --- | --- | --- |
| `NOT_CONNECTED` | `client not connected` — thrown by `privacy`, `group`, `newsletter`, `community`, **`profile`, `chat`, `contact`, `business`** modules when socket is absent (each module's `requireSocket()`). | Wait for the `connect` event before calling domain methods. |
| `GROUP_NOT_FOUND` | Referenced group does not exist / not accessible. *(Defined in union; no current throw site in src — reserved.)* | Verify the group JID (`xxx@g.us`) and that the account is a member. |
| `NEWSLETTER_NOT_FOUND` | `newsletter ${jid} not found` (`src/domain/newsletter.ts`). | Verify the newsletter/channel JID is correct and reachable. |
| `INVALID_PARTICIPANT` | A participant JID was invalid. *(Defined in union; no current throw site in src — reserved.)* | Pass valid user JIDs (`628xxx@s.whatsapp.net`). |
| `OPERATION_FAILED` | A domain operation failed. Triggers: `invite code unavailable` / `invite acceptance failed` (`src/domain/group.ts`); `message key is missing remoteJid` — `client.chat` star/unstar got a `WAMessageKey` without a `remoteJid` (`src/domain/chat.ts`). | Check permissions/invite code validity; for `chat` ops pass a key with a real `remoteJid`. Inspect `.message`. |

```typescript
if (err instanceof ZaileysDomainError && err.code === 'NOT_CONNECTED') {
  /* wait for connect first */
}
```

---

## ZaileysAutomationError

Codes: `NOT_CONNECTED` `RATE_LIMIT_INVALID` `TASK_FAILED` `SCHEDULE_INVALID` `STORE_UNAVAILABLE` `PRESENCE_FAILED`

| code | meaning | how to fix |
| --- | --- | --- |
| `NOT_CONNECTED` | `client not connected` — presence update with no live socket (`src/automation/presence.ts`). | Wait for `connect` before presence/automation calls. |
| `RATE_LIMIT_INVALID` | One of: `perSec must be greater than zero`, `perJidPerSec must be greater than zero`, `burst must be greater than zero` (`src/automation/rate-limiter.ts`). | Set each rate-limiter value `> 0`. |
| `TASK_FAILED` | A scheduled/automation task failed. *(Defined in union; no current throw site in src — reserved.)* | Inspect `.cause`. |
| `SCHEDULE_INVALID` | `scheduleAt requires a valid Date`, `scheduled builder evaluation failed` (cause), or `scheduled builder produced no content` (`src/automation/schedule.ts`). | Pass a real `Date`; ensure the builder fn returns content and does not throw. |
| `STORE_UNAVAILABLE` | A store required by automation was unavailable. *(Defined in union; no current throw site in src — reserved.)* | Configure a `store`. |
| `PRESENCE_FAILED` | `presence update '<type>' failed` (cause set) (`src/automation/presence.ts`). | Inspect `.cause`; retry. Valid presence types only. |

```typescript
await client.scheduleAt(new Date(Date.now() + 60_000), (b) => b.text('reminder'))
// non-Date / empty content / throwing builder → SCHEDULE_INVALID
```

---

## ZaileysStoreError

Codes: `STORE_NOT_AVAILABLE` `STORE_CONNECTION_FAILED` `STORE_WRITE_FAILED` `STORE_READ_FAILED` `STORE_CORRUPTED` `STORE_CLOSED`

Applies to BOTH auth stores (session creds) and message stores, across file / sqlite / postgres / redis / convex backends.

| code | meaning | how to fix |
| --- | --- | --- |
| `STORE_NOT_AVAILABLE` | Missing peer dependency or backend ctor. Triggers: `pg is not installed. Run: pnpm add pg`, `pg.Pool constructor not found`, `redis peer dependency missing. Run: pnpm add redis`, `better-sqlite3 belum terpasang. Run: pnpm add better-sqlite3`, `convex peer dependency missing. Run: pnpm add convex`. | Install the named peer dependency for that adapter. |
| `STORE_CONNECTION_FAILED` | Could not connect/init the backend. Triggers: `provide either pool or connectionString, not both` / `pool or connectionString is required` (postgres), `pass either client OR url, not both` / `requires either client or url` (redis/convex), `ConvexKv requires either client or url`, `provided redis client is not open (call await client.connect() first)`, `failed to load redis/convex module`, `failed to connect to redis at <url>`, `failed to migrate auth/message/sqlite schema`. | Fix config (exactly one of pool/conn or client/url). Open redis client first. Inspect `.cause` for driver/migration error. |
| `STORE_WRITE_FAILED` | A write/delete/serialize op failed (`failed to save/write/delete/clear ...`, `failed to serialize sqlite blob`, `failed to close sqlite database`, `redis/convex write failed`). | Inspect `.cause` (driver error, disk full, permissions). |
| `STORE_READ_FAILED` | A read op failed (`failed to read ...`, `redis/convex read failed`, `failed to read creds.json`, `failed to read signal rows`). | Inspect `.cause`. Check backend connectivity & schema. |
| `STORE_CORRUPTED` | `failed to parse sqlite blob` — stored data could not be parsed (`src/auth/adapters/sqlite.ts`, `src/store/adapters/sqlite.ts`). | Clear the corrupted session/store and re-authenticate. |
| `STORE_CLOSED` | Op attempted after close: `<X>AuthStore is closed` / `<X>MessageStore is closed` / `Convex store is closed` (all adapters). | Do not use the store after `close()`; recreate it. |

```typescript
if (err instanceof ZaileysStoreError) {
  switch (err.code) {
    case 'STORE_NOT_AVAILABLE': /* install peer dep from err.message */ break
    case 'STORE_CORRUPTED':     /* wipe session, re-auth */ break
    case 'STORE_CONNECTION_FAILED': console.error(err.cause); break
  }
}
```

---

## ☁️ ZaileysCloudError (cloud provider)

Thrown by the official Cloud API provider (`provider:'cloud'`). Codes: `CONFIG` `AUTH`
`REQUEST_FAILED` `RATE_LIMITED` `NOT_IMPLEMENTED`. Graph API rejections are wrapped as
`REQUEST_FAILED`/`RATE_LIMITED`/`AUTH` with the Meta code embedded in `.message` (e.g. `(#131047) …`).

| code | meaning | how to fix |
| --- | --- | --- |
| `CONFIG` | Missing/invalid cloud config. `provider 'cloud' requires cloud.accessToken` / `…phoneNumberId`; `this operation needs cloud.wabaId`; `webhook() is only available on the cloud provider`; `sendTemplate()/markRead()/wa.cloud requires provider:'cloud'`. | Provide the missing field. WABA-scoped ops (`wa.cloud.*` templates/flows/analytics/phoneNumbers) need `cloud.wabaId`. |
| `AUTH` | Token rejected (Graph 401/403, code `190`). | Use a **permanent System User** token with `whatsapp_business_messaging`+`whatsapp_business_management`; the dashboard quick-start token expires in 24h. |
| `RATE_LIMITED` | Graph 429 / pair rate limit (`131056`) after bounded retries. | Slow down; use `broadcast({ rateLimitPerSec })`; respect your messaging tier. |
| `NOT_IMPLEMENTED` | Content type not supported on cloud — e.g. AIRich (`rich:true`), an unsupported interactive layout. | Send plain text / a supported layout. AIRich is WhatsApp-Web-only. |
| `REQUEST_FAILED` | Any other Graph error — code is in `.message`. See the Graph-code table below. | Read the `(#code)` and act. |

### Common Graph error codes (inside `REQUEST_FAILED.message`)

| Graph code | meaning | fix |
| --- | --- | --- |
| `131047` | Re-engagement — outside the 24-hour window / user never texted you | Send an approved template: `wa.sendTemplate(to, name, lang, components)` |
| `132000` | Template parameter count ≠ `{{n}}` placeholders | `wa.cloud.templates.get(name)` to see components; match `parameters` exactly |
| `131009` | Contact `name` missing first/last | Include an `N:` line in the vCard (zaileys derives it; only fails on hand-built vCards) |
| `131026` | Message undeliverable | Recipient has no WhatsApp / blocked you |
| `190` | Access token invalid/expired | Regenerate a permanent token |

## ☁️ ZaileysProviderError (`UNSUPPORTED_ON_CLOUD`)

Thrown immediately when a **WhatsApp-Web-only** surface is used on `provider:'cloud'`:
`group`/`community`/`newsletter`/`privacy`/`presence`/`chat`/`contact`/`business`/`profile` modules,
and `edit`/`delete`/`pin`/`unpin`/`setDisappearing`. `.feature` names the offending surface. Fix: use
the unofficial provider for those, or the `wa.cloud.*` equivalent for account/business ops.

```typescript
import { ZaileysCloudError, ZaileysProviderError } from 'zaileys'
try { await wa.send(to).text('hi') }
catch (err) {
  if (err instanceof ZaileysCloudError && err.message.includes('131047')) {
    await wa.sendTemplate(to, 'welcome', 'en_US') // cold contact → template
  }
}
```

---

## The `error` event

Background failures that occur outside an `await` you control — chiefly **auto-connect** failures — surface via the client `error` event, not a throw.

```typescript
// payload type (src/client/types.ts:60)
error: { sessionId: string; error: Error }

client.on('error', ({ sessionId, error }) => {
  console.error(`[${sessionId}]`, error.message)
})
```

Critical: the auto-connect path emits `error` **only if a listener is already attached** (`this.listenerCount('error') > 0`, `src/client/client.ts:184`). With `autoConnect` (default `true`), register an `error` listener BEFORE the connection starts, or background failures are silently swallowed. (Node also throws on an unobserved `error` emit — this guard prevents that.)

---

## Disconnect reasons

On a dropped connection the client emits `disconnect`:

```typescript
// payload type (src/client/types.ts:56)
disconnect: { sessionId: string; reason: DisconnectReasonDomain; willReconnect: boolean }
```

`reason` is normalized from raw Baileys codes (`src/connection/disconnect-reason.ts`).

| `reason` | fatal? | clears auth? | auto-reconnect? | what to do |
| --- | --- | --- | --- | --- |
| `logged-out` | Yes | Yes | No | Session logged out from phone. Re-authenticate (new QR / pairing). |
| `connection-replaced` | Yes | Yes | No | Same account opened elsewhere. Re-authenticate. |
| `forbidden` | Yes | Yes | No | Account blocked/forbidden by WhatsApp. Manual intervention. |
| `bad-session` | No | Yes | Yes | Bad session data; auth cleared but reconnect attempted. |
| `restart-required` | No | No | Yes | WhatsApp asked for restart; reconnects automatically. |
| `connection-closed` | No | No | Yes | Connection closed; reconnects automatically. |
| `connection-lost` | No | No | Yes | Network drop; reconnects automatically. |
| `multi-device-mismatch` | No | No | Yes | MD mismatch; reconnects automatically. |
| `unavailable-service` | No | No | Yes | Service temporarily unavailable; reconnects automatically. |
| `unknown` | No | No | Yes | Unrecognized code; reconnects automatically. |

Predicates (`src/connection/disconnect-reason.ts`):
- **fatal** = `logged-out` ∨ `connection-replaced` ∨ `forbidden` → stops reconnect loop (`willReconnect: false`).
- **clears auth** = fatal ∨ `bad-session`.
- **reconnect** = `!fatal`.

Reconnect uses exponential backoff with jitter (`src/connection/reconnect.ts`): defaults `enabled: true`, `maxAttempts: Infinity`, `initialDelayMs: 1000`, `maxDelayMs: 60000`, `jitterFactor: 0.2`. The `reconnecting` event fires per attempt: `{ sessionId, attempt, delayMs, reason }`.

```typescript
client.on('disconnect', ({ reason, willReconnect }) => {
  if (!willReconnect) {
    // fatal: logged-out / connection-replaced / forbidden — re-auth required
    return
  }
  // transient — zaileys reconnects automatically
})
client.on('reconnecting', ({ attempt, delayMs, reason }) => {
  console.log(`attempt ${attempt} in ${delayMs}ms (${reason})`)
})
```

---

## Diagnosis workflow

Given an exception `err`:

1. **Is it a thrown exception or a background failure?**
   - Background (no `await` you control, esp. auto-connect): handle via `client.on('error', …)`. Read `error.message`.
   - A dropped connection is not an exception — it's the `disconnect` event. Map `reason` in the table above.

2. **Identify the class** via `instanceof` — pick by the operation:
   - building/sending/editing/forwarding a message, or `client.send()` failing → `ZaileysBuilderError`
   - command registration/middleware/handler/`ctx.edit` → `ZaileysCommandError`
   - `client.group` / `.privacy` / `.newsletter` / `.community` / `.profile` / `.chat` / `.contact` / `.business` → `ZaileysDomainError`
   - `client.scheduleAt` / presence / rate limiter → `ZaileysAutomationError`
   - any auth-store or message-store backend → `ZaileysStoreError`

3. **Match `err.code`** against the class table; read `err.message` for the exact constraint (counts, ranges, JID, fileName, etc.).

4. **If `err.cause` is set** (`SEND_FAILED`, `HANDLER_ERROR`, `MIDDLEWARE_ERROR`, `PRESENCE_FAILED`, most `STORE_*`, some `SCHEDULE_INVALID`), narrow it (`err.cause instanceof Error`) and read the real root error.

5. **Apply the fix** from the table.

Common gotchas, verbatim:
- `client.send()` before connect → `ZaileysBuilderError` code **`INVALID_OPTIONS`**, message `"client not connected"`. There is no `NOT_CONNECTED` code on the builder. Guard with `client.state === 'connected'`.
- Builder awaited with no content method → `ZaileysBuilderError` `EMPTY_CONTENT` (`no content set`).
- `STORE_NOT_AVAILABLE` always means: install the peer dep named in the message (`pg` / `redis` / `better-sqlite3` / `convex`).
- `STORE_CORRUPTED` → wipe the session/store, re-authenticate.
- `client.broadcast(...)` does NOT throw per bad recipient — it resolves to `{ sent, failed }`; inspect `failed: { jid, error }[]`.

Codes defined in the type unions but with **no current throw site** in `src/` (reserved; you will not see them at runtime today): builder `INVALID_RECIPIENT`; command `NOT_CONNECTED`; domain `GROUP_NOT_FOUND`, `INVALID_PARTICIPANT`; automation `TASK_FAILED`, `STORE_UNAVAILABLE`.

## Quick reference

| Class | Codes |
| --- | --- |
| `ZaileysBuilderError` | `MEDIA_LOAD_FAILED`, `INVALID_RECIPIENT`, `USERNAME_NOT_FOUND`, `EMPTY_CONTENT`, `INVALID_OPTIONS`, `SEND_FAILED`, `MESSAGE_NOT_FOUND` |
| `ZaileysCommandError` | `DUPLICATE_COMMAND`, `INVALID_COMMAND_NAME`, `HANDLER_ERROR`, `MIDDLEWARE_ERROR`, `NO_SENT_MESSAGE`, `NOT_CONNECTED` |
| `ZaileysDomainError` | `NOT_CONNECTED`, `GROUP_NOT_FOUND`, `NEWSLETTER_NOT_FOUND`, `INVALID_PARTICIPANT`, `OPERATION_FAILED` |
| `ZaileysAutomationError` | `NOT_CONNECTED`, `RATE_LIMIT_INVALID`, `TASK_FAILED`, `SCHEDULE_INVALID`, `STORE_UNAVAILABLE`, `PRESENCE_FAILED` |
| `ZaileysStoreError` | `STORE_NOT_AVAILABLE`, `STORE_CONNECTION_FAILED`, `STORE_WRITE_FAILED`, `STORE_READ_FAILED`, `STORE_CORRUPTED`, `STORE_CLOSED` |
