# Providers: WhatsApp Web and the Cloud API

## Contents

- Choosing
- What differs at runtime
- What only one provider can do
- One codebase, both providers
- Moving a WhatsApp Web bot to the Cloud API
- Moving a Cloud API bot to WhatsApp Web

## Choosing

Ask what the bot must do, then pick — don't default to WhatsApp Web because it needs no signup.

| Requirement | Provider | Reason |
| --- | --- | --- |
| Works today on an existing number, no Meta account | WhatsApp Web | QR or pairing code and it's connected |
| Groups, channels, communities, status, polls, albums, carousels | WhatsApp Web | The Cloud API has none of these |
| Commands, plugins, middleware, broadcast, scheduled sends | WhatsApp Web | They run on the WhatsApp Web connection only |
| Customer support or notifications on a business number that must not be banned | Cloud API | Meta's sanctioned API |
| Messaging people who haven't written in 24 hours (OTP, order updates, reminders) | Cloud API | Approved templates reach opted-in users any time |
| Serverless or request/response hosting | Cloud API | Messages arrive at a webhook; WhatsApp Web needs a long-running process |
| Delivery and read status per message | Cloud API | `message-status` event |

WhatsApp Web automates an unofficial protocol through Baileys. WhatsApp can restrict or ban numbers that behave
like bots, so recommend a number the user can afford to lose, and the Cloud API for anything critical.

## What differs at runtime

| | WhatsApp Web (`provider: 'baileys'`, default) | Cloud API (`provider: 'cloud'`) |
| --- | --- | --- |
| Credentials | None; the phone links the device | `cloud.accessToken`, `cloud.phoneNumberId`; `verifyToken` and `appSecret` for the webhook; `wabaId` for templates management and analytics |
| Login | QR (`authType: 'qr'`, default) or pairing code (`authType: 'pairing'` + `phoneNumber`) | `connect()` only checks the token against the Graph API |
| Session | Saved by the auth store (`./.zaileys/auth/<sessionId>` by default) | None |
| Incoming messages | Over the connection zaileys keeps open | `client.webhook()` mounted on a public HTTPS URL |
| Reconnects | Automatic with backoff; `authGuard` limits login attempts | Not applicable |
| States | `idle → connecting → qr-pending/pairing-pending → connected → reconnecting …` | `idle → connecting → connected` (or `disconnected` if the token is rejected) |
| Events that never fire | `message-status`, `template-status`, `flow-response`, `order` | `qr`, `pairing-code`, `reconnecting`, `auth-exhausted`, `edit`, `delete`, `poll-vote`, `mention`, group, call, and presence events |
| Cost | Free | Meta's WhatsApp Business pricing |

Cloud API sends need the `connected` state too: until the token check passes they throw
`client not connected`. A rejected token rejects `connect()` with `ZaileysCloudError` code `AUTH`.

## What only one provider can do

**WhatsApp Web only.** Using these on the Cloud API fails immediately:

| Feature | On the Cloud API |
| --- | --- |
| `client.group`, `privacy`, `newsletter`, `community`, `profile`, `chat`, `contact`, `business`, `presence` | `ZaileysProviderError` code `UNSUPPORTED_ON_CLOUD` |
| `edit()`, `delete()`, `pin()`, `unpin()`, `setDisappearing()`, `rejectCall()` | `UNSUPPORTED_ON_CLOUD` |
| Polls, carousels, events, group invites, `.product()`, `rich: true`, `htmlApp()`, copy/call buttons, more than 3 reply buttons | The send rejects with `ZaileysBuilderError` `SEND_FAILED`; `error.cause` is a `ZaileysCloudError` with code `NOT_IMPLEMENTED` |
| `album()` | `SEND_FAILED` — send each file separately |
| Commands, middleware, plugins, auto-delete | Never run — handle `text` events |
| `broadcast()`, `forward()` | Throw `client not connected` |
| `scheduleAt()` | Saves the job, but the send fails when due |
| Mentions, view once, GIF playback, disappearing timers on a send | Silently ignored |

**Cloud API only.** Using these on WhatsApp Web throws `ZaileysCloudError` code `CONFIG`:

| Feature | API |
| --- | --- |
| Receive messages by webhook | `client.webhook()` |
| Send an approved template | `client.sendTemplate(to, name, languageCode, components?)` |
| Read receipt (optionally with a typing indicator) | `client.markRead(messageId, { typing: true })` |
| Templates, Flows, commerce, business profile, blocklist, QR codes, analytics, phone registration | `client.cloud.templates`, `.flows`, `.commerce`, `.profile`, `.blocklist`, `.qr`, `.analytics`, `.phone` |
| Download received media | `client.downloadMedia(key)` |

Features on both, with different calls: read receipts (`client.chat.markRead()` on Web), blocking
(`client.privacy.block()` on Web, `client.cloud.blocklist` on Cloud), business profile and catalog
(`client.business` on Web, `client.cloud.profile` / `client.cloud.commerce` on Cloud).

## One codebase, both providers

The provider is fixed when the client is created. To serve both, create one client per provider and branch on
`client.provider` before any provider-specific call:

```ts
import { ZaileysProviderError } from 'zaileys'

async function notifyOrderShipped(to: string, orderId: string) {
  if (client.provider === 'cloud') {
    await client.sendTemplate(to, 'order_shipped', 'id', [
      { type: 'body', parameters: [{ type: 'text', text: orderId }] },
    ])
    return
  }
  try {
    await client.presence.typing(to)
  } catch (error) {
    if (!(error instanceof ZaileysProviderError)) throw error
  }
  await client.send(to).text(`Pesanan ${orderId} sudah dikirim`)
}
```

`client.on()`, `client.send()`, `msg.reply()`, and the send builder work the same on both, so handlers usually
need no branching — only the features in the tables above do.

## Moving a WhatsApp Web bot to the Cloud API

1. Get the Meta app credentials: access token, phone number ID, a verify token you choose, the app secret.
2. Constructor: add `provider: 'cloud'` and `cloud: { accessToken, phoneNumberId, verifyToken, appSecret }`
   from environment variables. `authType`, `phoneNumber`, `qrTerminal`, and the `.zaileys` session folder
   stop mattering.
3. Serve `client.webhook()` on a public HTTPS route with the raw body, and register the URL in the Meta
   dashboard subscribed to the `messages` field.
4. Replace everything in the WhatsApp Web–only table: commands and plugins become `text` handlers,
   `broadcast()` becomes a paced `sendTemplate()` loop, polls and carousels become lists or reply buttons.
5. Start conversations and send anything more than 24 hours after the customer's last message with approved
   templates; free-form sends then fail with Meta code `131047`.
6. Listen for `message-status` to learn about failed deliveries that the send call itself didn't report.

## Moving a Cloud API bot to WhatsApp Web

1. Remove `provider: 'cloud'` and the `cloud` options; log in with a QR or pairing code and persist the session
   (file store with an absolute `basePath`, a mounted volume, or a database store).
2. Remove `client.webhook()`, `client.cloud`, `sendTemplate()`, and `markRead()` — they throw `CONFIG`. Use
   `client.chat.markRead()` for read receipts.
3. Stop relying on `message-status`, `template-status`, `flow-response`, and `order`.
4. Add ban protection: keep `authGuard` and `operationGuard` on, use `client.broadcast()` for bulk sends, and
   don't cold-message people in bulk.
