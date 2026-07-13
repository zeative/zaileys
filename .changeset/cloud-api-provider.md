---
'zaileys': minor
---

Official Meta WhatsApp Cloud API provider. `new Client({ provider: 'cloud', cloud: { accessToken, phoneNumberId, verifyToken, appSecret } })` keeps the full zaileys DX on the sanctioned API: `send().text/media/buttons/list/location/contact`, `reply`, `react`, `forward`, plus cloud-only `sendTemplate()`, `markRead(id, { typing })`, and a `message-status` event. Inbound arrives through `wa.webhook()` — a framework-agnostic `(Request) => Response` handler with GET verification and HMAC signature checks — and flows through the same event pipeline (`text`, `image`, `reaction`, `button-click`, `list-select`, ...). Web-only surfaces (`group`, `newsletter`, `community`, `privacy`, `presence`, `edit`, `delete`, `pin`) throw a typed `ZaileysProviderError('UNSUPPORTED_ON_CLOUD')`. The baileys provider stays the default and is completely unchanged.
