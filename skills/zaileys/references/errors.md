# Errors, logs, and disconnects

## Contents

- Branching on errors
- ZaileysBuilderError
- ZaileysCloudError
- ZaileysProviderError
- ZaileysCommandError
- ZaileysDomainError
- ZaileysAutomationError
- ZaileysStoreError
- Plain errors
- Message text to meaning
- Disconnect reasons
- Status lines and debug logs
- Cloud API webhook and Graph errors
- Meta error codes

## Branching on errors

Every class extends `Error`, is exported from `'zaileys'`, and has a literal `code`. All but
`ZaileysProviderError` carry `cause` (typed `unknown`). Narrow with `instanceof` first; the same text
`client not connected` belongs to three classes, and `NOT_CONNECTED` to three code unions.

```ts
import { ZaileysBuilderError, ZaileysCloudError, ZaileysProviderError } from 'zaileys'

const metaCode = (error: unknown): number | undefined => {
  const cloud = error instanceof ZaileysBuilderError ? error.cause : error
  if (!(cloud instanceof ZaileysCloudError)) return undefined
  const match = /\(code (\d+)/.exec(cloud.message)
  return match ? Number(match[1]) : undefined
}

try {
  await client.send(jid).text('Order #1042 has shipped')
} catch (error) {
  if (metaCode(error) === 131047) {
    await client.sendTemplate(jid, 'order_shipped', 'en_US')
  } else if (error instanceof ZaileysBuilderError && error.code === 'SEND_FAILED') {
    console.error('refused:', error.cause)
  } else if (error instanceof ZaileysProviderError) {
    console.error(`${error.feature} needs WhatsApp Web`)
  } else {
    throw error
  }
}
```

Cause chains:

| You catch | `cause` holds |
| --- | --- |
| Builder `SEND_FAILED` on the Cloud API | `ZaileysCloudError` (`NOT_IMPLEMENTED`, `AUTH`, `RATE_LIMITED`, `REQUEST_FAILED`); Meta's code is in its message as `(code N)` or `(code N/subcode)` |
| Builder `SEND_FAILED` on WhatsApp Web | Baileys' error (often a Boom with `output.statusCode`) |
| Builder `MEDIA_LOAD_FAILED` | The fs/network error, or the HTTP status as a `number` for `failed with status` |
| Command `HANDLER_ERROR`, `MIDDLEWARE_ERROR` | Whatever your handler or middleware threw |
| Automation `SCHEDULE_INVALID` (`scheduled builder evaluation failed`), `PRESENCE_FAILED` | The builder or socket error |
| Store errors | The driver error (`pg`, `redis`, `better-sqlite3`, `convex`, fs) |
| Cloud `REQUEST_FAILED` `graph request failed (network)` | The `fetch` error |

`client.sendTemplate()`, `client.markRead()`, and `client.cloud.*` throw `ZaileysCloudError` directly, unwrapped.

## ZaileysBuilderError

Thrown by `client.send()`, `msg.reply()`, `ctx.reply()`, `client.edit()`, `delete()`, `forward()`, `pin()`, `loadMedia()`.

| Code | Meaning and typical message | Fix |
| --- | --- | --- |
| `INVALID_OPTIONS` | Not connected: `client not connected`. Also validation: `poll() requires a minimum of <n> options`, `buttons() accepts at most 10 buttons`, `invalid jid: <v>`, `reply() requires a quoted message or key`, `disappearing() requires a positive integer duration`, `message key is missing remoteJid`, `a status sent to status@broadcast needs audience([...]); …` | Send after `connect` or from a handler; the validation message names the method and rule. On the Cloud API `broadcast()` and `forward()` always hit `client not connected` — they need WhatsApp Web. |
| `EMPTY_CONTENT` | `no content set`, `text() requires a non-empty string`, `edit() requires a content method before await` | Guard empty strings (an empty `msg.text` is `''`); call a content method before `await`. |
| `INVALID_RECIPIENT` | `audience() only applies to status@broadcast, not <jid>`; `<content> can only be sent to a group jid ending in @g.us` | Send to the right kind of JID. |
| `USERNAME_NOT_FOUND` | `username "<x>" not found` — a recipient without `@` is treated as a username | Usually `msg.chatId` (a message ID) was passed; use `msg.roomId ?? msg.senderId` or a full JID. |
| `MEDIA_LOAD_FAILED` | `fetch <url> failed with status <s>`, `fetch <url> failed: This operation was aborted` (timeout), `read <path> failed: ENOENT…`, `<src> exceeds <n> bytes`, `refusing to fetch a private address: <host>`, `refusing to read <path>: it resolves inside the protected directory <dir>`, `local filesystem paths are disabled; …`, `unsupported url scheme: <p>`, `audio() transcode failed: <r>`, `sticker() conversion failed: <r>` | Paths resolve from the process working directory. Size cap is `media.maxBytes` (64 MB); LAN/loopback URLs need `media.allowPrivateNetwork: true`; the auth directory is never readable — that block stops a bot echoing user input from mailing its own `creds.json`. |
| `SEND_FAILED` | `socket sendMessage rejected`, `socket relayMessage rejected`, `album parent send rejected`, `album child send rejected`, `interactive media upload failed`, `socket returned no message key`, `socket does not support relayMessage (interactive content)` | Read `error.cause`. On the Cloud API an `album()` or poll ends here with a `NOT_IMPLEMENTED` cause. |
| `MESSAGE_NOT_FOUND` | `message not found in store for forward` | `forward()` re-sends from the message store; the default memory store forgets on restart. Use a database store. |

## ZaileysCloudError

| Code | Meaning and typical message | Fix |
| --- | --- | --- |
| `CONFIG` | Missing option: `provider 'cloud' requires cloud.accessToken` / `cloud.phoneNumberId` (thrown by the constructor), `this operation needs cloud.wabaId (WhatsApp Business Account id)`, `flows.send needs flowId or flowName`. Wrong provider: `webhook() is only available on the cloud provider`, `sendTemplate() is only available on the cloud provider`, `markRead(messageId) is only available on the cloud provider`, `client.cloud` (its message ends `.cloud requires provider: 'cloud'`) | An unset env var is the usual cause (`process.env.X!` compiles but is `undefined`). |
| `AUTH` | HTTP 401/403, never retried: `cloud auth rejected (401) — check accessToken/phoneNumberId` from `connect()`, `graph auth rejected: <Meta message> (code 190)` from any call | Temporary tokens expire in about 24 hours; use a system-user token with `whatsapp_business_messaging` and `whatsapp_business_management`. |
| `RATE_LIMITED` | HTTP 429 on all 3 attempts (retries after 0.5 s and 1 s): `graph request failed: <msg> (code 130429)` | Pace sends yourself; zaileys doesn't queue Cloud sends. |
| `REQUEST_FAILED` | Other HTTP errors (5xx tried 3 times like 429): `graph request failed: <msg> (code N)`, `graph request failed (network)`, `cloud health-check failed (<status>)`, `graph send returned no message id`, `media download failed (<status>)`, `media exceeds 134217728 bytes`, `refusing a non-https media url: <p>`, `refusing to send credentials to <host>` | Look up Meta's code in the table at the end. The media-host refusals keep the access token away from non-Meta hosts. |
| `NOT_IMPLEMENTED` | No Cloud API equivalent: `this content type is not supported on the cloud provider yet`, `this interactive layout is not supported on the cloud provider yet`, `interactive media headers are not supported on the cloud provider yet`, `cloud interactive buttons allow at most 3 reply buttons (got <n>)`, `AIRich content (rich: true and htmlApp()) is WhatsApp-Web-only …`, `this relay content is not supported on the cloud provider` | Fall back to text, a list, or at most 3 reply buttons. |

## ZaileysProviderError

`code` is always `UNSUPPORTED_ON_CLOUD`; `feature` names what was touched: `group`, `privacy`, `newsletter`,
`community`, `profile`, `chat`, `contact`, `business`, `presence`, `edit`, `delete`, `rejectCall`, `pin`, `unpin`,
`setDisappearing`. Message: `<feature> is not supported by the official WhatsApp Cloud API — it only exists on the web (baileys) provider`.
Thrown before any request — on property access for modules (`client.group`), as a rejection for methods (`pin()`) — so guard with `client.provider === 'baileys'`.

## ZaileysCommandError

| Code | Meaning and message | Fix |
| --- | --- | --- |
| `DUPLICATE_COMMAND` | `command "<name>" is already registered` (name or alias) | Rename, or `client.unregisterCommand()` the old one first. |
| `INVALID_COMMAND_NAME` | `command spec must not be empty`, `empty command segment in spec` | Non-empty names; no `\|\|` in the spec. |
| `HANDLER_ERROR` | `command handler failed`, original on `cause` | Delivered to `command-error`; with no listener only logged as `command dispatch failed` (silent without `ZAILEYS_DEBUG`). |
| `MIDDLEWARE_ERROR` | `middleware threw during execution`, `next() called multiple times` | Call `next()` exactly once per middleware. |
| `NO_SENT_MESSAGE` | `ctx.edit requires a prior ctx.reply` | Reply first, then edit. |
| `NOT_CONNECTED` | Declared in the union, never thrown by the current source | Nothing to handle; exhaustive `switch` needs the case. |

## ZaileysDomainError

| Code | Meaning and message | Fix |
| --- | --- | --- |
| `NOT_CONNECTED` | `client not connected` from `client.group`, `privacy`, `newsletter`, `community`, `profile`, `chat`, `contact`, `business` | Call after `connect` or inside a handler. |
| `NEWSLETTER_NOT_FOUND` | `newsletter <jid> not found` | Check the `@newsletter` JID. |
| `OPERATION_FAILED` | `invite code unavailable` (bot isn't admin), `invite acceptance failed`, `message key is missing remoteJid` | Make the bot a group admin; check the invite is still valid. |
| `GROUP_NOT_FOUND` | Declared, never thrown | A missing group surfaces as Baileys' error (`item-not-found`, `forbidden`) passed through unwrapped. |
| `INVALID_PARTICIPANT` | Declared, never thrown | Participant failures come back per member in the Baileys result or as Baileys' error. |

## ZaileysAutomationError

| Code | Meaning and message | Fix |
| --- | --- | --- |
| `NOT_CONNECTED` | `client not connected` (presence), `cannot reject a call: client not connected`, and — despite the code — `rejectCall(callId, from) requires the caller jid` | Pass the whole `call-incoming` payload to `rejectCall()`. |
| `SCHEDULE_INVALID` | `scheduleAt requires a valid Date`, `scheduled builder produced no content`, `scheduled builder evaluation failed`, `scheduling multi-part messages (e.g. album) is not supported; …`, `scheduling interactive/relayed content is not supported; …` | Schedule one text or media message with a real `Date`. |
| `RATE_LIMIT_INVALID` | `perSec must be greater than zero`, `perJidPerSec …`, `burst …` | Positive numbers. |
| `PRESENCE_FAILED` | `presence update '<type>' failed` | Usually transient; don't let it abort the reply. |
| `QUEUE_FULL` | `task queue is full (<n> pending)` (`TaskQueue`, `broadcast()` with `retry`) | Enqueue slower or raise `maxPending`. |
| `QUEUE_TIMEOUT` | `task exceeded <ms>ms` | A send stuck on a dead connection; raise `taskTimeoutMs` only for genuinely slow tasks. |
| `TASK_FAILED` | Declared, never thrown | `broadcast()` never throws per recipient: failures land in `result.failed[].error`. |
| `STORE_UNAVAILABLE` | Declared, never thrown | Store problems are `ZaileysStoreError`. |

## ZaileysStoreError

Surfaces mostly while connecting: `await client.connect()` rejects, or the automatic connect emits it on `error`.

| Code | Meaning and message | Fix |
| --- | --- | --- |
| `STORE_NOT_AVAILABLE` | Optional driver missing: `pg is not installed. Run: pnpm add pg`, `redis peer dependency missing. Run: pnpm add redis`, `convex peer dependency missing. Run: pnpm add convex`, `better-sqlite3 belum terpasang. Run: pnpm add better-sqlite3` (that one is Indonesian in the source), `pg.Pool constructor not found` | Install the driver with the project's own package manager, not necessarily pnpm. |
| `STORE_CONNECTION_FAILED` | Bad options or unreachable DB: `pass either client OR url, not both`, `RedisAuthStore requires either client or url`, `PostgresAuthStore: pool or connectionString is required`, `failed to open sqlite database at <path>`, `failed to connect to redis at <url>`, `provided redis client is not open (call await client.connect() first)`, `failed to migrate auth schema`, `invalid tablePrefix "<x>": start with a letter, then letters, digits or _ (max 41)`, `invalid namespace "<x>": …` | Driver error on `cause`. Constructor-time ones throw from `new …Store()`. |
| `STORE_READ_FAILED` | `failed to read creds`, `failed to read creds.json`, `creds.json is corrupt` (only after no `creds.revoked-*.json` snapshot could be read), `redis read failed` | A read failure aborts `connect()` on purpose, so a slow or broken store can't make the client register a new device over a valid session. |
| `STORE_WRITE_FAILED` | `failed to write <file>`, `failed to write signal rows`, `redis write failed`, `failed to back up creds.json`, `refusing to touch <path>: outside <basePath>` | Disk full, permissions, read-only container FS. Unsaved key updates later show up as Bad MAC. |
| `STORE_CORRUPTED` | `failed to parse sqlite blob` | Restore the database from backup or relink. |
| `STORE_CLOSED` | `<StoreName> is closed`, e.g. `SqliteAuthStore is closed` | Store used after `client.disconnect()` closed it (bundled stores reopen on `connect()`), or one instance shared by two clients; give each `Client` its own stores. |

## Plain errors

Not zaileys classes — match on `message`.

| Message | Where | Fix |
| --- | --- | --- |
| `invalid sessionId "<id>": use 1-64 characters from A-Z a-z 0-9 _ -` | `new Client()` | Rename the id and the `./.zaileys/auth/<old>` folder to match, or the session is lost. |
| `phoneNumber is required when authType is "pairing"` | `connect()`; with auto-connect, the `error` event | Add `phoneNumber` as a string. |
| `phoneNumber must be E.164 with country code`, `phoneNumber is required` | Pairing flow; only logged as `pairing-code request failed`, no event | 8–15 digits with country code; `+`, spaces, `-`, `()` are stripped. |
| `failed to request pairing code: <msg>` | Pairing flow; logged the same way | Check the number is on WhatsApp; don't loop — `authGuard` caps pairing at 3. |
| `WhatsApp asked to pair again while a registered session is stored; aborting to protect it` | `error` event, then disconnect | If the device really was unlinked, `await client.logout()` or delete the session, then restart. |
| `connection closed (<reason>)`, `disconnected before connect resolved` | `await client.connect()` rejection | See Disconnect reasons. |
| `this auth or message store adapter cannot be reopened after disconnect(); implement reopen() or create a new Client` | `connect()` after `disconnect()` with a custom store | Implement `reopen()` or build a new client. |
| `zaileys: ctx.reply() requires a connected client`, `zaileys: ctx.react() requires a connected client` | Context actions on a context with no live client | Reply from within the event handler. |
| `ffmpeg queue is full (<n> jobs waiting)`, `ffmpeg job waited more than <ms>ms for a slot` | Media conversion under load | Tune `media.maxConcurrentFfmpeg` / `maxQueuedFfmpeg` / `ffmpegQueueTimeoutMs`, or shed work. |
| `FFmpeg timed out after 120000ms`, `FFmpeg exited with code <n>` | Media conversion | Corrupt input or unsupported codec. |
| `Image too large to decode safely: <w>x<h>` | Image processing | Decompression-bomb guard; raise `media.maxImagePixels` only for trusted input. |
| `Invalid file type: expected <kind>/*, got <mime>`, `Invalid media type: expected image or video` | `Media` helpers | Check `msg.media.type` first. |
| `failed to import plugin: <file>` | `plugins.onError`; logged as `plugin: import failed; skipped` | Run the file alone to see the import error. |

## Message text to meaning

| Text seen | Meaning |
| --- | --- |
| `username "…" not found` | Sent to `msg.chatId` or a bare string without `@` |
| `client not connected` | Before `connect`, Cloud token check still running, or a WhatsApp Web–only helper on the Cloud API |
| `… (code 131047)` | Cloud 24-hour window closed |
| `invalid signature` (401 body) | Wrong `appSecret` or body re-serialized before the webhook |
| `webhook requires appSecret (or allowUnsigned for local dev)` | `appSecret` not configured |
| `is not supported by the official WhatsApp Cloud API` | `UNSUPPORTED_ON_CLOUD` |
| `refusing to read … protected directory` | Media path points into the auth folder |
| `refusing to fetch a private address` | Media URL is localhost/LAN |
| `logged-out right after connect; treating as spurious…` | Benign WhatsApp 401 right after open, being retried |
| `Bad MAC`, `failed to decrypt message` | Signal session out of sync for one sender; the message has no content and no handler fires |

## Disconnect reasons

`disconnect` fires with `{ reason, willReconnect }`; `reconnecting` with `{ attempt, delayMs, reason }`.

| `reason` | Code | Reconnects | Stored session |
| --- | --- | --- | --- |
| `logged-out` | 401 | No. If the connection had opened, retried first (3 s, up to 2 in a row) because WhatsApp sends spurious 401s | Backed up, then erased — not during those retries. A real logout fails the retry before opening and erases then |
| `connection-replaced` | 440 | No (fatal) | Kept — the creds are valid and in use by another process |
| `forbidden` | 403 | No (fatal) | Kept |
| `bad-session` | 500 | Yes | Kept — Baileys uses 500 as a catch-all for unknown stream errors |
| `restart-required` | 515 | Yes; expected once right after linking | Kept |
| `rate-limited` | 429 | Yes, after `reconnect.rateLimitedDelayMs` (300000, no backoff or jitter) | Kept |
| `connection-closed`, `connection-lost`, `multi-device-mismatch`, `unavailable-service` | 428, 408, 411, 503 | Yes: 3 s doubling to 60 s, ±20% jitter, unlimited | Kept |
| `unknown` | anything else | Yes; `willReconnect: false` when you called `disconnect()` | Kept |

- Nothing reconnects when `reconnect.enabled` is `false`, `reconnect.maxAttempts` is used up, or `authGuard` already stopped the client.
- Erasing is `quarantineCreds()` (the file store copies `creds.json` to `creds.revoked-<timestamp>.json`) followed by clearing signal keys and credentials. The backup is best effort: signal keys are gone, so restoring it rarely revives a session.
- `session: { clearAuthOn: [...] }` replaces the erase set (default `['logged-out']`). It doesn't change reconnecting: `clearAuthOn: ['bad-session']` erases and then reconnects into a new QR.
- `client.logout()` always backs up and erases; `client.disconnect()` never erases.

## Status lines and debug logs

`[zaileys]` lines print unless `statusLog: false` (which also stops hiding libsignal's console noise):

```text
[zaileys] Connecting to WhatsApp (session: <sessionId>)...
[zaileys] Scan the QR code above with WhatsApp > Linked devices to authenticate.
[zaileys] Pairing code: <code> — enter it in WhatsApp > Linked devices > Link with phone number.
[zaileys] Connected as <jid>.
[zaileys] Connection lost (<reason>). Reconnecting in <s>s (attempt <n>)...
[zaileys] Disconnected (<reason>).
[zaileys] The saved session looks invalid or corrupted (connection keeps closing before it authenticates). Delete the auth folder (default: ./.zaileys) and run again to scan a fresh QR / request a new pairing code.
```

`Disconnected` prints only when not reconnecting. The corruption hint prints once, when stored creds existed and the second attempt also closed before authenticating — a network outage or a second process produces it too, so rule those out before deleting a session.

The logger is silent by default. `ZAILEYS_DEBUG=1` means `info`; it also accepts `fatal`, `error`, `warn`, `info`, `debug`, `trace`; anything else stays silent. A custom `logger` option ignores `ZAILEYS_DEBUG`. Credentials, tokens, and secrets are redacted even at `trace`.

| Log message | Meaning | Action |
| --- | --- | --- |
| `listener threw` | A synchronous `client.on()` handler threw; other handlers still ran | Fix the handler. Async rejections are not caught at all |
| `inbound pipeline: handler for <event> threw`, `inbound pipeline: decoder threw` | One inbound message failed to decode | Report with the payload if repeatable |
| `command dispatch failed` | Command failed and no `command-error` listener | Add `client.on('command-error', …)` |
| `auto-connect failed` | Automatic connect rejected (also `error` event when listened) | Read the error; see Plain errors |
| `auth attempts exhausted (<n>/<max> <kind>); stopping to avoid WhatsApp spam restriction — call connect() to retry` | Nobody scanned 5 QRs / used 3 pairing codes; `auth-exhausted` event fired and the client disconnected | Retry later with `client.connect()`, never with `authGuard` disabled |
| `pairing-code request failed` | Pairing flow threw; `cause` holds the E.164 or request error | Fix `phoneNumber` |
| `WhatsApp returned rate-limited (429); backing off before reconnect to avoid restriction` | 5-minute wait started | Don't restart to skip the wait — a restart is another login attempt while throttled |
| `auth.creds.writeCreds failed` | Credential update not persisted (`STORE_WRITE_FAILED` on `cause`) | Fix disk or DB before the next restart, or the session breaks |
| `failed to read stored credentials; aborting connect to protect the session` | Auth store read failed | Fix the store; don't delete the session |
| `refusing a creds update that would de-register the stored session` | Protective refusal | Informational |
| `auth.creds.backupCreds failed; continuing with the erase` | Backup before erase failed | Check write permissions |
| `recordSent failed` | Sent message not saved to the message store; the send succeeded | Check the message store |
| `media download failed`, `media stream download failed` | `msg.media.buffer()`/`stream()` failed, usually expired media | Download as soon as the message arrives |
| `scheduled send failed; re-arming for retry`, `scheduled send failed repeatedly; dropping the job` | `scheduleAt()` send failing | Check connection and content |
| `plugin: import failed; skipped`, `plugin: invalid shape (needs a name); skipped`, `plugin: duplicate name; skipped`, `plugin: setup failed; skipped` | Plugin not loaded | Default-export `definePlugin({ name, … })` |
| `inbound pipeline: overloaded, shed messages waiting on LID resolution` | Inbound messages dropped under load | Reduce load or scale out sessions |
| `autoDelete: store implements neither pruneMessages nor deleteMessage; sweeper disabled` | Custom store lacks pruning | Implement one, or `autoDelete: false` |

Bad MAC (libsignal) and `failed to decrypt message` (Baileys) show only in debug logs. Occasional ones are harmless.
Constant ones mean two processes on one session, a restored old copy of the auth data, or key writes failing
(`STORE_WRITE_FAILED`, `auth.creds.writeCreds failed`) — fix that, and relink only as a last resort:
https://zaileys.kejaa.id/reference/troubleshooting#bad-mac-or-failed-to-decrypt-message

## Cloud API webhook and Graph errors

`client.webhook()` responses:

| Request | Status | Body | Cause and fix |
| --- | --- | --- | --- |
| `GET` with `hub.mode=subscribe` and matching `hub.verify_token` | 200 | the challenge | — |
| Any other `GET`, including no `cloud.verifyToken` configured | 403 | `forbidden` | Set `verifyToken` to exactly the dashboard value |
| `POST`, `appSecret` set, signature missing or wrong | 401 | `invalid signature` | Wrong app secret, or a JSON parser/proxy changed the raw body: https://zaileys.kejaa.id/reference/troubleshooting#the-webhook-answers-invalid-signature |
| `POST`, no `appSecret`, `allowUnsigned` not `true` | 401 | `webhook requires appSecret (or allowUnsigned for local dev)` | Configure `cloud.appSecret`; `allowUnsigned: true` only for local tunnels |
| `POST`, verified but not JSON | 400 | `malformed body` | Pass the raw body through unchanged |
| `POST`, verified JSON | 200 | `OK` | Sent before handlers finish; handler errors never change it |
| Other methods (`HEAD`, `PUT`) | 405 | `method not allowed` | Route only `GET` and `POST` to it |

Graph requests retry only 429 and 5xx, up to 3 attempts. Message formats: `graph auth rejected: <Meta message> (code N)`
(`AUTH`), `graph request failed: <Meta message> (code N[/subcode])` (`RATE_LIMITED` for 429, else `REQUEST_FAILED`),
`graph request failed (network)`. `connect()` itself fails with `cloud auth rejected (<status>) — check accessToken/phoneNumberId`.

## Meta error codes

Appear in the thrown message as `(code N)`, or on a `message-status` update with `status: 'failed'` in `error.code`
when Meta accepted the send but couldn't deliver. Details: https://zaileys.kejaa.id/cloud/limits

| Code | Meaning | Fix |
| --- | --- | --- |
| 131047 | More than 24 hours since the customer's last message | `client.sendTemplate()` with an approved template |
| 131026 | Undeliverable: not on WhatsApp, outdated app, or unable to receive | Verify the number; never retry in a loop |
| 131056 | Too many messages to the same recipient (pair rate limit) | Merge into one message; about one per 6 s per person |
| 130429 | Throughput limit (80 messages/s by default) | Pace sends; arrives as `RATE_LIMITED` |
| 132000 | Template parameter count doesn't match its placeholders | One parameter per `{{n}}`; inspect with `client.cloud.templates.get()` |
| 132001 | Template missing in that language or not approved | Use the exact approved name and language code |
| 131048 | Spam rate limit from a low quality rating | Check `quality_rating` via `client.cloud.info()`; message only opted-in users |
| 131049 | Meta held back a marketing template for engagement | Don't resend soon; use utility templates for transactional messages |
| 131009 | A parameter value is invalid | Read the field named in Meta's message |
| 131030 | Recipient not on the test number's allowed list | Add the phone under WhatsApp → API Setup |
| 190 | Access token expired or revoked (`AUTH`) | New system-user token |
