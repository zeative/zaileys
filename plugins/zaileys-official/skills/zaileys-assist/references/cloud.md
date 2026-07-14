# zaileys — Official Meta Cloud API provider (☁️)

The cloud-exclusive reference. zaileys runs on **two providers** behind one API:

- **🔗 unofficial (default)** — WhatsApp Web via Baileys. QR/pairing login, groups/channels/polls,
  full personal-account power. Documented in [api.md](api.md) + the other references.
- **☁️ official** — the Meta WhatsApp **Cloud API**. Token auth, no ban risk, templates/OTP/
  campaigns, Flows, commerce. **This file.**

The `send(jid)…` builder and `on('text' | 'image' | …)` events are **identical** across providers
(see [api.md](api.md)) — this file documents ONLY what's different or cloud-exclusive. Verified
against zaileys **4.8.1** (`src/cloud/*`).

## Switch provider

```ts
import { Client } from 'zaileys'

const wa = new Client({
  provider: 'cloud',                 // default is 'baileys'
  cloud: {
    accessToken: process.env.WA_TOKEN!,       // permanent / system-user token (required)
    phoneNumberId: process.env.WA_PHONE_ID!,  // sender phone-number id, NOT the number (required)
    wabaId: process.env.WA_WABA_ID,           // WhatsApp Business Account id — needed for wa.cloud.*
    verifyToken: process.env.WA_VERIFY!,      // webhook GET challenge secret you choose
    appSecret: process.env.WA_APP_SECRET!,    // verifies webhook X-Hub-Signature-256 (recommended)
    apiVersion: 'v23.0',                      // optional, pinned default
    baseUrl: 'https://graph.facebook.com',    // optional override
  },
})
```

`new Client()` (no `provider`) = baileys, unchanged. `client.provider` → `'baileys' | 'cloud'`.
Constructing `provider:'cloud'` without `accessToken`+`phoneNumberId` throws `ZaileysCloudError('CONFIG')`.

## connect() — no socket, no QR

```ts
await wa.connect()   // lightweight Graph health-check, resolves immediately
```

No QR, no pairing, no session file — the token authenticates. `qr`/`pairing-code`/reconnect events
never fire on cloud. `disconnect()` tears down local listeners.

**The webhook works even without `connect()`** — a serverless route (`export const POST = wa.webhook()`)
never calls connect and still dispatches events (runtime is lazy-initialized).

## Webhook — inbound is push-based

`wa.webhook()` returns a framework-agnostic `(req: Request) => Promise<Response>`:
GET → verification challenge (uses `verifyToken`); POST → verifies `X-Hub-Signature-256` HMAC (uses
`appSecret`, rejects forgeries with 401), then dispatches events. Only available on cloud (throws on baileys).

```ts
// Next.js — app/api/whatsapp/route.ts
const handler = wa.webhook()
export const GET = handler
export const POST = handler

// Hono
app.all('/webhook', (c) => handler(c.req.raw))

// Express — keep the RAW body (a body-parser breaks signature verification)
app.all('/webhook', express.raw({ type: '*/*' }), async (req, res) => {
  const request = new Request(`${req.protocol}://${req.get('host')}${req.originalUrl}`, {
    method: req.method,
    headers: req.headers as Record<string, string>,
    ...(req.method === 'POST' ? { body: req.body as Buffer } : {}),
  })
  const r = await handler(request)
  res.status(r.status).send(await r.text())
})
```

In the Meta dashboard: **WhatsApp → Configuration → Webhook** → set Callback URL + Verify token,
**subscribe to the `messages` field**. Meta expects a 200 within ~10s or it retries — zaileys acks
immediately, so make handlers **idempotent** (dedupe by message id).

## Sending — same builder, cloud caveats

All of `send(jid).text/image/video/audio/document/sticker/location/contact/buttons/list`, `reply`,
`react`, `forward`, `markRead` work (see [api.md](api.md)). Cloud differences:

- **Reply buttons max 3**; **carousels & polls not supported**; **media headers on buttons** unsupported.
- **`markRead(messageId, { typing })`** — takes a message id (no chat cursor); optional typing indicator.
- **Contacts need a first name** — vCard must have `FN:` + an `N:` line (zaileys derives it; error 131009 otherwise).
- **AIRich (`rich: true`) is NOT supported** — it's a WhatsApp-Web-only proto. Throws a clear error;
  send plain text instead (WhatsApp renders `*bold*` `_italic_` `~strike~` `` ```mono``` `` natively).
- **Media**: image ≤5MB, video ≤16MB, audio ≤16MB, document ≤100MB, sticker webp; URL must be public HTTPS or pass a Buffer/path.

```ts
await wa.send(to).text('*Order confirmed* ✅')
await wa.send(to).image('https://cdn/x.jpg', { caption: 'hi' })
await wa.markRead(msg.chatId, { typing: true })
```

## The 24-hour window — the #1 gotcha

Free-form sends (`text`/media/interactive) only work inside the **24h customer-service window** that
opens when a user messages you. To a cold contact / after the window → **only approved templates**,
else Graph error **131047**.

```ts
await wa.send('628xxx').text('hi')                  // ❌ 131047 if user never texted you
await wa.sendTemplate('628xxx', 'welcome', 'en_US') // ✅ business-initiated
```

## Templates — `sendTemplate` + `wa.cloud.templates`

`sendTemplate(to, name, language, components?)` — takes the template **name**, not id. The number of
`parameters` must exactly match the template's `{{n}}` or you get **132000**.

```ts
await wa.sendTemplate(to, 'promo_juli', 'id', [
  { type: 'body', parameters: [{ type: 'text', text: 'Budi' }] },
])
// image header:
await wa.sendTemplate(to, 'flash_sale', 'id', [
  { type: 'header', parameters: [{ type: 'image', image: { link: 'https://…/banner.jpg' } }] },
  { type: 'body', parameters: [{ type: 'text', text: '50%' }] },
])
```

**OTP** (AUTHENTICATION templates are usually approved instantly):

```ts
await wa.cloud.templates.create({
  name: 'kode_otp', category: 'AUTHENTICATION', language: 'id',
  components: [
    { type: 'BODY', add_security_recommendation: true },
    { type: 'FOOTER', code_expiration_minutes: 5 },
    { type: 'BUTTONS', buttons: [{ type: 'OTP', otp_type: 'COPY_CODE' }] },
  ],
})
await wa.sendTemplate(to, 'kode_otp', 'id', [
  { type: 'body', parameters: [{ type: 'text', text: '839201' }] },
  { type: 'button', sub_type: 'url', index: '0', parameters: [{ type: 'text', text: '839201' }] },
])
```

**Management** (needs `wabaId`):

```ts
await wa.cloud.templates.list({ status: 'APPROVED', limit: 100 })
await wa.cloud.templates.get('nama' | '1783414372642659')  // by name OR numeric id → components
await wa.cloud.templates.create({ name, category, language, components })
await wa.cloud.templates.delete('nama')
wa.on('template-status', (t) => console.log(t.name, t.event)) // APPROVED / REJECTED / PAUSED
```

## Marketing campaigns

Create+approve template → broadcast → track. Marketing is subject to Meta's per-user daily cap +
quality tiers (250 → unlimited by tier); watch `wa.cloud.info().quality_rating`.

```ts
for (const { phone, name } of contacts) {
  await wa.sendTemplate(phone, 'promo_juli', 'id', [{ type: 'body', parameters: [{ type: 'text', text: name }] }])
}
wa.on('message-status', (s) => console.log(s.id, s.status)) // sent/delivered/read/failed
const stats = await wa.cloud.analytics.messages({ start, end })
```

## `wa.cloud.*` — full management surface (needs `wabaId` where noted)

```ts
// account
await wa.cloud.info()          // display_phone_number, verified_name, quality_rating, throughput
await wa.cloud.phoneNumbers()  // all numbers on the WABA

// business profile
await wa.cloud.profile.get()
await wa.cloud.profile.update({ about, address, description, email, websites, vertical })

// whatsapp flows
await wa.cloud.flows.list()
await wa.cloud.flows.send(to, { flowId, cta, bodyText, screen, flowToken?, data?, headerText?, footerText?, mode?, action? })
wa.on('flow-response', (f) => console.log(f.response)) // parsed nfm_reply

// catalog & commerce
await wa.cloud.commerce.catalogs()
await wa.cloud.commerce.products(catalogId)
await wa.cloud.commerce.sendProduct(to, { catalogId, retailerId, bodyText?, footerText? })
await wa.cloud.commerce.sendProductList(to, { catalogId, headerText, bodyText, sections: [{ title, productIds }] })
wa.on('order', (o) => console.log(o.items)) // { productRetailerId, quantity, price, currency }[]

// address request (ID/BR only)
await wa.cloud.sendAddressRequest(to, { bodyText, countryIso: 'ID' })

// blocklist / qr / analytics
await wa.cloud.blocklist.add(['628xxx']); await wa.cloud.blocklist.remove(['628xxx']); await wa.cloud.blocklist.list()
await wa.cloud.qr.create('prefilled msg', 'PNG'); await wa.cloud.qr.list(); await wa.cloud.qr.delete(code)
await wa.cloud.analytics.conversations({ start, end, granularity: 'DAILY' })
await wa.cloud.analytics.messages({ start, end, granularity: 'DAY' })

// phone-number management (touches live registration — use with care)
await wa.cloud.phone.register(pin); await wa.cloud.phone.deregister()
await wa.cloud.phone.requestCode('SMS' | 'VOICE', 'id'); await wa.cloud.phone.verifyCode(code)
```

`start`/`end` are Unix seconds. WABA-scoped calls throw `ZaileysCloudError('CONFIG')` without `wabaId`.
Accessing `wa.cloud` on the baileys provider throws.

## Events

Shared events fire the same (see [api.md](api.md)). Cloud-only:

| Event | Payload |
| --- | --- |
| `message-status` | `{ id, status: 'sent'\|'delivered'\|'read'\|'failed', recipientId, timestamp, error? }` |
| `template-status` | `{ name, event, id, language?, reason? }` |
| `flow-response` | `{ name, response, senderId, senderName?, id, timestamp }` |
| `order` | `{ catalogId, items: {productRetailerId,quantity,price,currency}[], senderId, ... }` |

## What's NOT on cloud → throws `UNSUPPORTED_ON_CLOUD`

`group`, `community`, `newsletter`, `privacy`, `presence`, `chat`, `contact`, `business`, `profile`
(the domain modules), plus `edit`, `delete`, `pin`, `setDisappearing`. Also: carousels, polls,
AIRich, status/stories. All throw `ZaileysProviderError('UNSUPPORTED_ON_CLOUD')` immediately — never a
silent no-op. For these, use the unofficial provider.

## Cloud error codes (see [errors.md](errors.md))

`131047` re-engagement (outside 24h → use a template) · `132000` param count mismatch · `131009`
contact name · `190` token expired (use a permanent System User token) · `131026` undeliverable ·
`131056` pair rate limit. All surface as `ZaileysCloudError` carrying the Graph code.
