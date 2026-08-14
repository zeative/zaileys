# Unofficial Provider — WhatsApp Web (Baileys)

> Source: https://zeative.github.io/zaileys/unofficial

# Unofficial · WhatsApp Web

The **default** provider. It automates a WhatsApp Web session through
[Baileys](https://github.com/WhiskeySockets/Baileys) — the same multi-device protocol your phone
uses when you link a device. No Meta approval, no business verification: scan a QR (or enter a
pairing code) and you're live in seconds, with the **full power of a personal account**.

```typescript

const client = new Client() // provider: 'baileys' is the default

client.on('qr', ({ qrString }) => console.log('Scan this QR:', qrString))
client.on('connect', ({ me }) => console.log('Connected as', me.id))
client.on('text', (msg) => msg.reply(`You said: ${msg.text}`))
```

There is nothing extra to configure — every other page in these docs (Events, Sending Messages,
Interactive, Groups, Storage…) describes this provider unless a page is explicitly marked
**Official ☁️**. This page just frames *what makes it special* and *when to reach for it*.

## Why pick the unofficial provider

- **Zero approval, instant start** — no Meta Business account, no WABA, no template review. Great
  for prototypes, personal automation, and community bots.
- **Personal-account superpowers** — groups, communities, newsletters (channels), polls, stickers,
  presence, edit, delete, disappearing messages, status. None of these exist on the Cloud API.
- **Message anyone** — no 24-hour window, no template gate. You can DM any number that has WhatsApp.
- **Self-contained** — a persistent socket, no public webhook URL required. Runs on a Raspberry Pi,
  Termux, a VPS, anywhere Node runs.

## Logging in

```typescript
const client = new Client()
client.on('qr', ({ qrString }) => console.log(qrString))
```
Scan from **WhatsApp → Linked Devices → Link a Device**. The session is saved to disk (the `file`
auth store) so you only scan once.

```typescript
const client = new Client({ authType: 'pairing', phoneNumber: '6281234567890' })
client.on('pairing-code', ({ code }) => console.log('Enter on phone:', code))
```
Enter the code under **Linked Devices → Link with phone number instead**. Handy on headless servers
where you can't render a QR.

Sessions persist through the [storage adapters](/storage) — `file` (default), `sqlite`, `redis`,
`postgres`, or `convex`. Auto-reconnect with backoff and clean logout are handled for you; see
[Client & Lifecycle](/client).

## What's exclusive to this provider

These features simply don't exist on the official Cloud API — the unofficial provider is the only
way to use them in Zaileys:

- [Groups](/groups) — create, manage participants, admin actions, invite links.
- [Communities](/community) and [Newsletters / Channels](/newsletter).
- [Presence](/presence) — subscribe to others' online/typing state.
- Polls, carousels, stickers, edit, delete, pin, disappearing messages — see
  [Sending Messages](/sending-messages) and [Interactive](/interactive).
- [Privacy & Blocking](/privacy) settings and status/stories.

## Gotchas & trade-offs

This provider is **not endorsed by Meta**. It drives WhatsApp Web, so the number carries a real risk
of temporary or permanent bans — especially with bulk or cold messaging. Use a number you can afford
to lose, keep volumes human, and never spam.

| Gotcha | Why | What to do |
| --- | --- | --- |
| **Ban risk** on bulk / cold sends | Unofficial automation Meta actively detects | Keep volume human, warm up new numbers, add delays; for real scale use the [Official API](/official) |
| **Session can be lost** | Logging in elsewhere, "log out all devices", or 401 can drop the linked device | Persist auth with a durable [storage adapter](/storage); handle the `disconnect` event and re-auth |
| **Linked-device limits** | WhatsApp caps how many devices link to one account | Don't link the same number to many bots |
| **No delivery SLA** | It's a client session, not a business API | Don't rely on it for OTP/critical notifications — use [templates on the Official API](/official/templates) |
| **The phone must stay reachable** | Multi-device still needs the primary account healthy | Keep the account active; a banned/deleted account kills the session |
| **Spurious `401` right after connect** | WhatsApp sometimes emits a false logout | Zaileys already guards this — it reconnects to confirm before wiping the session |

For a compliant, unbannable channel with templates, OTP, and campaigns, use the
**[Official Cloud API](/official)** — same code, different `provider`. Compare both on
[Choose Your Provider](/providers).

Not sure which fits? See **[Choose Your Provider](/providers)** for the full comparison.

## Next steps

### Install and connect

Follow [Getting Started](/getting-started) to run your first bot with a QR login.

### Explore the builder and events

[Sending Messages](/sending-messages) and [Events](/events) cover everything you can send and react
to on a personal account.

### Add persistence and structure

Wire up [Storage Adapters](/storage), a [command router](/commands), and [plugins](/plugins) as your
bot grows.
