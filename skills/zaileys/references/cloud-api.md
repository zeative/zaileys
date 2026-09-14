# Cloud API (Official provider)

## Contents

- Meta setup checklist
- Client options
- Connecting
- The webhook contract
- Mounting the webhook
- The 24-hour window and templates
- Template management
- Cloud-only events
- Read receipts and media
- How errors surface
- Meta error codes
- What doesn't run on the Cloud API

## Meta setup checklist

| Value | Where | Pitfall |
| --- | --- | --- |
| Meta app with the WhatsApp product | developers.facebook.com → create a Business app → add WhatsApp | Meta adds a test number that only delivers to up to 5 verified recipients (others fail with `131030`) |
| `phoneNumberId` | WhatsApp → API Setup, next to the sender | Meta's numeric ID, **not** the phone number; the phone number makes `connect()` fail |
| `wabaId` | WhatsApp → API Setup | Only needed for account-level calls (template management, flows list, catalogs, analytics, `phoneNumbers()`) |
| `accessToken` | Temporary: API Setup (expires in 24 h). Production: Business settings → System users → assign the app and the WhatsApp account → generate a non-expiring token with `whatsapp_business_messaging` and `whatsapp_business_management` | A bot that dies after a day is running on the temporary token |
| `verifyToken` | Any long random string you choose; type the same value into the webhook form | Unset means every verification gets `403` |
| `appSecret` | App settings → Basic | Must come from the app that owns the webhook, or every POST gets `401` |
| Webhook | WhatsApp → Configuration: callback URL (public HTTPS, full path) + verify token; subscribe `messages`, plus `message_template_status_update` for `template-status` | Verification succeeds but no POSTs arrive: the field isn't subscribed, or a WABA added later isn't subscribed to the app (`POST /<WABA_ID>/subscribed_apps`) |
| Own number | Add it in the dashboard, then `client.cloud.phone.requestCode()` / `verifyCode()` / `register(pin)` | Unregistered numbers fail every send with `133010`; a number registered for the Cloud API stops working in the WhatsApp Business app |

Details: https://zaileys.kejaa.id/cloud/setup#get-your-credentials

## Client options

| `cloud` option | Default | Behaviour |
| --- | --- | --- |
| `accessToken` | required | Sent as `Bearer` on every Graph request; missing or empty → `new Client()` throws `CONFIG` |
| `phoneNumberId` | required | Also becomes `me.id`; missing → `CONFIG` at construction |
| `wabaId` | — | Account-level calls without it throw `CONFIG` (`this operation needs cloud.wabaId …`) |
| `verifyToken` | — | Compared in constant time on the GET challenge |
| `appSecret` | — | Required for POSTs: verifies `X-Hub-Signature-256` over the raw body |
| `allowUnsigned` | `false` | Accepts POSTs without `appSecret`. Local development only: anyone who learns the URL can inject messages |
| `apiVersion` | `'v23.0'` | Graph version in every URL |
| `baseUrl` | `'https://graph.facebook.com'` | Proxy or mock server |

Construction checks only that `accessToken` and `phoneNumberId` are non-empty strings — a non-null assertion on
`process.env.X!` compiles but is `undefined` at runtime, which is the usual `CONFIG` cause.

## Connecting

`connect()` is one un-retried `GET /<phoneNumberId>`: `401`/`403` → `AUTH` (`cloud auth rejected (401) — check
accessToken/phoneNumberId`), other statuses → `REQUEST_FAILED` (`cloud health-check failed (400)`), network →
`REQUEST_FAILED`. With `autoConnect` (default) a failure only reaches an `error` listener. There is no session,
QR, or reconnect; `disconnect()` just stops the transport.

- `client.send()` / `msg.reply()` throw `INVALID_OPTIONS` (`client not connected`) until the check passes.
- `sendTemplate()` and `markRead()` don't wait for `connected`, but throw `CONFIG` (`… only available on the cloud
  provider`) until the transport exists — created when `connect()` starts or the first webhook payload arrives.
  With `autoConnect: false` and no `connect()`, they always throw that misleading `CONFIG`.

## The webhook contract

`client.webhook()` returns `(req: Request) => Promise<Response>` (on WhatsApp Web it throws `CONFIG`). Create it
once at startup; it doesn't need `connect()`.

| Request | Response |
| --- | --- |
| `GET` with `hub.mode=subscribe` and `hub.verify_token` equal to `verifyToken` | `200`, body = `hub.challenge` |
| Any other `GET`, or `verifyToken` unset | `403 forbidden` |
| Method other than GET/POST (including `HEAD` health checks) | `405 method not allowed` |
| `POST` with `appSecret` set and a missing or wrong signature | `401 invalid signature` |
| `POST` without `appSecret` and without `allowUnsigned` | `401 webhook requires appSecret (or allowUnsigned for local dev)` |
| `POST` whose body isn't JSON (checked after the signature) | `400 malformed body` |
| Any other `POST` | `200 OK` |

Once signed and parsed, the answer is always `200`, even when handlers throw — Meta redelivers anything that
isn't `200`, and a failing handler must not turn one message into a retry storm. Events are emitted
synchronously; synchronous throws are logged as `listener threw` (silent by default), async handlers keep running
after the response, and their rejections are unhandled. Consequences:

- Catch inside handlers, and make them idempotent by `msg.chatId` (the message ID): Meta can deliver twice.
- Serverless hosts that freeze after the response can cut replies off; prefer a long-lived server.
- On a cold start, the first reply can hit `client not connected`: keep the `connect()` promise and await it in
  `POST` (below).
- The handler doesn't filter by `metadata.phone_number_id`. With several numbers on one app, read it from
  `await req.clone().json()` and route to the matching client.
- Messages Zaileys doesn't recognise (such as template quick-reply taps) emit nothing.

## Mounting the webhook

Hono and Next.js hand over the original `Request`. Express must get the **raw** bytes: `express.json()`
re-serializes the body, so the HMAC never matches and every POST is `401`. Register the route before any global
`app.use(express.json())`; once another parser has read the stream the bytes are gone. The same applies to
Fastify, NestJS, and proxies that re-encode JSON. More:
https://zaileys.kejaa.id/cloud/webhook#why-express-needs-the-raw-body

```ts
import express from 'express'
import { Client } from 'zaileys'

const client = new Client({
  provider: 'cloud',
  cloud: {
    accessToken: process.env.WA_TOKEN ?? '',
    phoneNumberId: process.env.WA_PHONE_ID ?? '',
    verifyToken: process.env.WA_VERIFY_TOKEN,
    appSecret: process.env.WA_APP_SECRET,
  },
})
const webhook = client.webhook()
const app = express()

app.all('/webhook', express.raw({ type: '*/*' }), async (req, res) => {
  const headers = new Headers()
  for (const [name, value] of Object.entries(req.headers)) if (typeof value === 'string') headers.set(name, value)
  const init: RequestInit = { method: req.method, headers }
  if (req.method === 'POST' && Buffer.isBuffer(req.body)) init.body = new Uint8Array(req.body)
  const response = await webhook(new Request(new URL(req.originalUrl, 'http://localhost'), init))
  res.status(response.status).send(await response.text())
})
app.listen(3000)
```

```ts
import { serve } from '@hono/node-server'
import { Hono } from 'hono'

const webhook = client.webhook()
const app = new Hono()
app.all('/webhook', (c) => webhook(c.req.raw))
serve({ fetch: app.fetch, port: 3000 })
```

A Next.js App Router route (`app/api/whatsapp/route.ts`) on the Node.js runtime, not Edge, which also closes
the cold-start race:

```ts
import { Client } from 'zaileys'

const client = new Client({
  provider: 'cloud',
  autoConnect: false,
  cloud: {
    accessToken: process.env.WA_TOKEN ?? '',
    phoneNumberId: process.env.WA_PHONE_ID ?? '',
    verifyToken: process.env.WA_VERIFY_TOKEN,
    appSecret: process.env.WA_APP_SECRET,
  },
})
const ready = client.connect()
ready.catch((error: unknown) => console.error('Cloud API check failed:', error))
const webhook = client.webhook()

export const GET = (req: Request) => webhook(req)
export async function POST(req: Request): Promise<Response> {
  await ready
  return webhook(req)
}
```

Keep the `ready` promise: a second `connect()` during the check returns immediately without waiting.

## The 24-hour window and templates

Free-form messages (text, media, reply buttons, lists — anything from `client.send()`) reach a customer only
within 24 hours of **their** last message. Outside it, or for someone who never wrote, only an approved template
gets through; a template doesn't reopen the window, the customer's reply does. The builder's `.template()` is a
button message, not a Meta template.

`client.sendTemplate(to, name, languageCode, components?)` resolves the message key (`key.id` is the `wamid`
that `message-status` reports). `to` may be digits with country code or a JID; `name` is the approved name, not
the ID; `languageCode` must match an approved language exactly (`en_US` ≠ `en`). `components` pass through to
Meta unchanged — one entry per part with variables, parameters in placeholder order:

```ts
await client.sendTemplate('6281234567890', 'order_ready', 'en_US', [
  { type: 'header', parameters: [{ type: 'image', image: { link: 'https://shop.example.com/banner.jpg' } }] },
  { type: 'body', parameters: [{ type: 'text', text: 'Budi' }, { type: 'text', text: '#1042' }] },
  { type: 'button', sub_type: 'url', index: '0', parameters: [{ type: 'text', text: '1042' }] },
])
```

- Header media must be a public URL Meta can fetch; zaileys doesn't upload it. OTP templates take the code in
  the body **and** in a `button` component with `sub_type: 'url'`. A parameter count mismatch fails with `132000`.
- Bulk sends: `broadcast()` doesn't run here, so loop `sendTemplate()` behind `RateLimiter` and count deliveries
  from `message-status`, not resolved calls.

## Template management

`client.cloud.templates` needs `wabaId`, except `get()` with a numeric ID.

| Call | Behaviour |
| --- | --- |
| `list({ status?, limit? })` | `{ id, name, status, category?, language?, components? }[]` |
| `get(nameOrId)` | First match or `null`; digits-only input is treated as an ID |
| `create({ name, category: 'MARKETING' \| 'UTILITY' \| 'AUTHENTICATION', language, components })` | `{ id, status }`, usually `PENDING`. Components use Meta's uppercase types (`BODY`, `BUTTONS`) and need `example` values for placeholders |
| `delete(name, id?)` | Without `id`, deletes every language version of that name |

Review results arrive as `template-status` only when the webhook subscribes `message_template_status_update`;
otherwise poll `get()`.

## Cloud-only events

| Event | Payload | Notes |
| --- | --- | --- |
| `message-status` | `{ id, status: 'sent' \| 'delivered' \| 'read' \| 'failed', recipientId, timestamp, conversationId?, error?: { code?, title?, message? } }` | A resolved send only means Meta accepted it. `read` needs the recipient's read receipts on. For buttons and lists the send key holds a zaileys-generated ID that never matches |
| `template-status` | `{ event, id, name, language?, reason? }` | `event` is Meta's state, e.g. `APPROVED`, `REJECTED`, `PAUSED` |
| `flow-response` | `{ id, name, body?, response, senderId, senderName?, timestamp }` | `response` is the parsed `response_json` (`{}` if unparsable). Fires instead of `message` |
| `order` | `{ id, catalogId, text?, items: { productRetailerId, quantity, price, currency }[], senderId, senderName?, timestamp }` | Fires instead of `message` |

Timestamps are Unix seconds. Locations and contact cards arrive as `text`; `reaction`, `button-click`, and
`list-select` work as on WhatsApp Web.

## Read receipts and media

- `client.markRead(msg.chatId, { typing: true })` marks one inbound message read (`msg.chatId` is the message ID)
  and optionally shows a typing indicator.
- `client.downloadMedia(msg.message().key)` resolves `{ buffer, mime, size }` or `null` (message not in the store,
  or no media). `msg.media.buffer()` doesn't work on the Cloud API. It fetches Meta's short-lived URL, so
  download soon after the webhook; limits are 128 MB and 60 s, and the token is only sent to Meta's media hosts.

```ts
client.on('image', async (msg) => {
  try {
    await client.markRead(msg.chatId, { typing: true })
    const file = await client.downloadMedia(msg.message().key)
    if (file) await msg.reply(`Got ${file.mime}, ${file.size} bytes`)
  } catch (error) {
    console.error('image handler failed:', error)
  }
})
```

## How errors surface

Every Graph call goes through one client: `401`/`403` → `AUTH` immediately; `429` → retried after 0.5 s and 1 s,
then `RATE_LIMITED`; `5xx` → same retries, then `REQUEST_FAILED`; any other status → `REQUEST_FAILED` at once;
network failure → `REQUEST_FAILED` with the cause. Meta's code is appended to the message as `(code N)` or
`(code N/subcode)`: `graph request failed: <Meta's message> (code 131047)`.

| Call | What you catch |
| --- | --- |
| `client.send()`, `msg.reply()` | `ZaileysBuilderError` `SEND_FAILED`, the `ZaileysCloudError` on `error.cause` |
| `sendTemplate()`, `markRead()`, `client.cloud.*` | `ZaileysCloudError` directly |
| Unsupported content (polls, carousels, `rich: true`, > 3 reply buttons, media headers) | `SEND_FAILED` with cause code `NOT_IMPLEMENTED` |
| Failure after Meta accepted the message | No throw — `message-status` with `status: 'failed'` and `error.code` |

Whether a limit code arrives as `RATE_LIMITED` or `REQUEST_FAILED` depends on the HTTP status Meta pairs with it,
so branch on Meta's code, not only on `RATE_LIMITED`:

```ts
import { ZaileysBuilderError, ZaileysCloudError } from 'zaileys'

export function metaCode(error: unknown): number | undefined {
  const cloud = error instanceof ZaileysBuilderError ? error.cause : error
  if (!(cloud instanceof ZaileysCloudError)) return undefined
  const match = /\(code (\d+)/.exec(cloud.message)
  return match ? Number(match[1]) : undefined
}
```

| `ZaileysCloudError` code | Cause |
| --- | --- |
| `CONFIG` | Missing `accessToken`/`phoneNumberId`/`wabaId`; Cloud-only API on WhatsApp Web; `sendTemplate`/`markRead` before the transport exists; `flows.send` without `flowId` or `flowName` |
| `AUTH` | Health check or Graph call answered `401`/`403` — expired, partial, or under-permissioned token |
| `REQUEST_FAILED` | Other Meta refusals, exhausted `5xx` retries, network errors, a send without a returned `wamid`, media URL or size violations |
| `RATE_LIMITED` | Meta answered `429` three times |
| `NOT_IMPLEMENTED` | Content the Cloud API can't carry |

## Meta error codes

Seen as `(code N)` in a thrown message or as `error.code` on a failed `message-status` — check both.

| Code | Meaning | Fix |
| --- | --- | --- |
| `131047` | Re-engagement: more than 24 h since the customer's last message | Send an approved template; free-form works again after they reply |
| `131026` | Undeliverable: not on WhatsApp, outdated app, or can't receive from this business | Verify the number; don't retry in a loop |
| `131056` | Pair rate limit: too many messages to one recipient (about one per 6 s sustained) | Merge messages; space sends per recipient (`RateLimiter` with `perJidPerSec`) |
| `130429` | Throughput limit for the number (80 msg/s by default) | Pace bulk sends; back off and retry later |
| `132000` | Template parameter count doesn't match the placeholders | Count `{{n}}` with `templates.get()` |
| `132001` | Template name doesn't exist in that language, or isn't approved | Check `name`, `language`, `status` |
| `131048` | Spam rate limit: sends restricted after a quality drop | Slow down, message only opted-in users; check `client.cloud.info()` `quality_rating` |
| `131049` | Marketing message held back for per-user engagement limits | Don't resend immediately; use utility templates for transactional updates |
| `131009` | A parameter value is invalid or missing | Fix the named field (e.g. a contact card without a name) |
| `131030` | Recipient not in the test number's allowed list | Add and verify the phone under API Setup, or use a registered number |
| `190` | Access token invalid or expired (arrives as `AUTH`) | Replace with a system user token |

Throughput, messaging tiers, and pricing: https://zaileys.kejaa.id/cloud/limits

## What doesn't run on the Cloud API

Web-only modules (`client.group`, `presence`, …) and `edit()`/`delete()`/`pin()` throw `UNSUPPORTED_ON_CLOUD`.
Commands, middleware, plugins, and auto-delete never run; `broadcast()` and `forward()` reject with
`client not connected`; scheduled jobs fail when due and are dropped after retries. Parse commands with
`parseCommand()` in a `text` handler. The full comparison is in the providers reference.
