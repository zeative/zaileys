# Sending messages

## Contents

- How a send runs
- Recipients and JIDs
- Content methods
- Media sources and conversion
- Modifiers
- Interactive messages and provider limits
- Statuses
- Acting on a sent message
- Send errors

## How a send runs

`client.send(to)` returns a `MessageBuilder<'init'>`. Call exactly one content method, add modifiers in any
order, then `await`. The builder is a thenable: **every `await` or `.then()` sends again**, so await it once
and keep the key it resolves to (`WAMessageKey`: `{ remoteJid, id, fromMe }`).

```ts
import type { WAMessageKey } from 'zaileys'

const key: WAMessageKey = await client.send(jid).text('Packing your order...')
await client.react(key, '📦')
if (client.provider === 'baileys') await client.edit(key).text('Shipped! Resi JX-20931')
```

| Stage | What fails there |
| --- | --- |
| `client.send(to)` | Throws `INVALID_OPTIONS` `client not connected` synchronously when there is no socket (Web) or the Cloud client isn't `connected` |
| Content method without files (`text`, `poll`, `location`, `contact`, `buttons`, `list`, `carousel`, `template`, `event`, `groupInvite`, text `groupStatus`) | Validates and throws synchronously, before anything is sent |
| Content method with files (`image`, `video`, `videoNote`, `audio`, `document`, `sticker`, `product`) | Starts loading immediately; the failure surfaces when you await. A media builder you never await becomes an unhandled rejection if its load fails |
| `await` | Bare-number lookup, inherited disappearing timer, `audience()` check, group-only check, then the socket send |

Wrap the whole `await client.send(...)...` statement in `try`/`catch`; that catches both synchronous and
asynchronous failures. To reach many chats, use `client.broadcast(jids, (b) => b.text('...'))` (Web only),
not a loop.

## Recipients and JIDs

| Chat | JID | Notes |
| --- | --- | --- |
| Person | `6281234567890@s.whatsapp.net` | Country code, no `+`, spaces, or leading `0` |
| Person by privacy ID | `123456789012345@lid` | Accepted as is by `send()` |
| Group | `120363041234567890@g.us` | Not a phone number; log `msg.roomId` to find it |
| Channel | `120363098765432109@newsletter` | |
| Personal status | `status@broadcast` | Needs `.audience([...])` |

- Strings ending in `@s.whatsapp.net`, `@g.us`, `@lid`, `@newsletter`, `@broadcast`, `@c.us` are used verbatim.
  Anything else is looked up on WhatsApp Web when you await (cached per client) and rejects with
  `USERNAME_NOT_FOUND` (`username "…" not found`) if no account matches. That is why sending to `msg.chatId`
  (a message ID) fails with that exact error. `client.forward()` and `client.setDisappearing()` resolve the same way.
- On the Cloud API there is no lookup: everything before `@` goes to Meta as the phone number.
- `.to(jid)` replaces the recipient before the content method and never does the lookup — pass a full JID.
- In a handler, answer with `msg.reply()` or `client.send(msg.roomId ?? msg.senderId)`; `senderId` alone
  sends privately to the sender even when the message came from a group.

| Helper (import from `'zaileys'` unless it's a client method) | Behaviour |
| --- | --- |
| `phoneToJid('+62 812-3456-7890')` | Strips non-digits, appends `@s.whatsapp.net`. Cannot fix a missing country code (`0812…` stays wrong) |
| `jidToPhone(jid)` | Digits for `@s.whatsapp.net`/`@c.us`; `''` for groups and LIDs |
| `isJid`, `isJidGroup`, `isLidJid`, `jidNormalizedUser` | Type checks; `jidNormalizedUser` drops the `:device` suffix |
| `areJidsSameUser(a, b)` | Compares only the part before `@`, so `123@lid` equals `123@s.whatsapp.net` — use `sameUser(a, b)` when namespace matters |
| `client.lidToPn(lid)`, `client.pnToLid(pn)` | `null` when unknown, never throws; WhatsApp Web only (always `null` on Cloud) |
| `client.lidToPns(lids)`, `client.pnToLids(pns)` | One request, returns a `Map`; unresolved entries are absent |
| `client.getUsername(jid)`, `client.usernames(jids)` | Reverse lookup of a `@handle`; `null`/absent when none. Works best with LIDs |

```ts
import { phoneToJid } from 'zaileys'

await client.send(phoneToJid('+62 812-3456-7890')).text('Your order #1042 has shipped.')
```

## Content methods

| Method | Accepts | Limits and gotchas | Cloud API |
| --- | --- | --- | --- |
| `text(content, opts?)` | `string`; `{ rich, title, footer, sources }` | Empty/whitespace → `EMPTY_CONTENT`. `rich: true` renders Markdown as an AI-style card (undocumented WhatsApp format; images must be URLs) | Plain only; `rich: true` → `SEND_FAILED` |
| `htmlApp(markup, { title, height, device, fallback, maxBytes })` | `string` or `html` tag result | Runs inside the bubble on **WhatsApp Android only**, offline: no network, storage, links, or scrolling; the card can't reach the bot. `device` other than `'android'` sends `fallback` text or throws `INVALID_RECIPIENT`. Build pages with `html` so values are escaped; quote attribute values and pass data to `<script>` only through `htmlJson` (the escaping doesn't cover script, style, or unquoted attributes). Default `maxBytes` 256 KB. May show a one-tap Download prompt | `SEND_FAILED` |
| `image(src, { caption, viewOnce })` | `MediaSource` | | `viewOnce` ignored |
| `video(src, { caption, gifPlayback, viewOnce, ptv })` | `MediaSource` | Bytes must sniff as `video/*`, else `INVALID_OPTIONS` — a `.gif` is an image (send it as a sticker or convert to MP4) | `gifPlayback`, `viewOnce`, `ptv` ignored |
| `videoNote(src, { viewOnce })` | `MediaSource` | Same as `video({ ptv: true })`; errors still name `video()` | Regular video |
| `audio(src, { ptt, seconds })` | `MediaSource` | **`ptt` defaults to `true`** (voice note). Always transcoded to Opus; voice notes get a waveform and measured duration | Audio message |
| `document(src, { fileName, mimetype, caption })` | `MediaSource` | `fileName` required; mimetype sniffed, fallback `application/octet-stream` | Yes |
| `sticker(src, opts)` | `MediaSource` | See conversion below | Yes |
| `album(items)` | `{ type: 'image' \| 'video', src, caption? }[]` | 2–30 items, checked at await. Resolves to the parent key; children go one by one, so a mid-way failure leaves a partial album (`error.cause` has `parentKey`, `index`) | `SEND_FAILED` |
| `location(lat, lon, { name, address })` | numbers | −90..90 / −180..180 | Yes |
| `contact(vcard)` | one vCard string | Must start with `BEGIN:VCARD`; one card per message | Reads `FN`, `N`, `TEL` |
| `poll(question, options, { multipleChoice })` | `string`, `string[]` | 2–12 unique non-empty options; votes arrive as `poll-vote` (Web) | `SEND_FAILED` |
| `event({ name, startAt, endAt, description, location, call, canceled })` | `Date` or epoch **ms** | Rounded down to the second; the card renders only in groups | `SEND_FAILED` |
| `groupInvite({ jid, code, subject, caption, expiresAt, thumbnail })` | group JID + `client.group.inviteCode()` | `expiresAt` in **seconds**, default 3 days | `SEND_FAILED` |
| `product({ image, title, businessOwnerId, price, currency, … })` | | `price` in currency units (sent ×1000) | `SEND_FAILED` |
| `buttons`, `list`, `carousel`, `template` | | See interactive section | Partial |
| `groupStatus(text \| source, opts?)` | | See statuses | `SEND_FAILED` |
| `requestPhoneNumber()`, `sharePhoneNumber()`, `limitSharing(enabled = true)` | none | `limitSharing` changes a chat setting, not a bubble | `SEND_FAILED` |

`caption`, `viewOnce`, `fileName`, and `gifPlayback` are options of the content method, not builder modifiers.
Guide with every option: https://zaileys.kejaa.id/reference/send-builder

## Media sources and conversion

`MediaSource` is `string | Buffer | URL`. The type is always sniffed from the bytes; never pass it.

| Source | Loaded as | Limits |
| --- | --- | --- |
| `http(s)://` string or `URL` | `fetch` | 30 s timeout, 64 MB cap (streamed, so a lying `content-length` can't bypass it), loopback/RFC1918/link-local hosts refused unless `media.allowPrivateNetwork` |
| Other string, or `file:` URL | Filesystem, relative to the **process cwd** | 64 MB; paths inside `.zaileys` or the file auth store directory are refused so user text can't exfiltrate `creds.json` |
| `Buffer` | As is | None |

Client option `media: { maxBytes, allowLocalPaths, allowPrivateNetwork, deniedDirs, maxImagePixels, maxConcurrentFfmpeg }`
is process-wide — with several clients the last one constructed wins. Set `allowLocalPaths: false` when a
source string can come from a chat message.

- **Stickers**: images are resized to WebP, GIFs and videos become animated WebP (cut to about 6 s); a WebP
  input is not re-encoded but its pack metadata is replaced. Pass `animated: true` for GIF/video sources —
  conversion detects animation, but the message flag comes only from this option. `shape`
  (`'default' | 'circle' | 'rounded' | 'oval'`) applies to stills; `quality` defaults to 60.
- **Sticker defaults**: `new Client({ sticker: { packageName, authorName } })` sets pack metadata for every
  sticker (aliases `pack`/`packname`, `author`/`publisher`). It is a static default shared by all clients in
  the process; per-call options override it. Built-in fallback: `Zaileys Library` / the GitHub URL.
- **Voice notes**: any format ffmpeg reads is transcoded to Opus. A waveform failure still sends the note.
- Conversion failures reject with `MEDIA_LOAD_FAILED` (`sticker() conversion failed: …`, `audio() transcode failed: …`).
  Heavy conversions queue behind `media.maxConcurrentFfmpeg` (default 4, ~235 MB per 1080p re-encode).

```ts
import { Client } from 'zaileys'

const shop = new Client({ sticker: { packageName: 'Toko Budi', authorName: 'tokobudi.id' } })
```

## Modifiers

| Modifier | Effect | Gotcha | Cloud API |
| --- | --- | --- | --- |
| `.reply(quoted)` | Quotes a message | Pass `msg.message()`: a bare key shows no preview and is ignored entirely on buttons, lists, carousels, templates, invites, group statuses, and rich text. `null` → `INVALID_OPTIONS` | Quotes by id; dropped on interactive sends |
| `.mentions(jids)` | Tags people | Also write `@<number>` in the text or nothing is highlighted. Each JID needs `@`; repeated calls merge | Ignored |
| `.mentionAll()` | Tags every group member without listing them | Groups only | Ignored |
| `.disappearing(seconds)` | Per-message timer | Positive integer. Usually unnecessary: the chat's timer is learned from incoming messages (latest wins, 500 chats kept) and applied to every send | Ignored |
| `.audience(jids)` | Who sees a personal status | Only valid for `status@broadcast` | — |

`msg.reply(text, opts?)` sends text only, quotes the message, and always mirrors the quoted message's
disappearing timer. For media, mentions, or buttons, use the builder with `.reply(msg.message())`:

```ts
client.on('text', async (msg) => {
  if (!msg.isGroup || msg.text !== '!chart') return
  try {
    await client
      .send(msg.roomId ?? msg.senderId)
      .image('./reports/sales.png', { caption: `Sales this week, @${msg.senderId.split('@')[0]}` })
      .mentions([msg.senderId])
      .reply(msg.message())
  } catch (error) {
    console.error('chart send failed:', error)
  }
})
```

## Interactive messages and provider limits

| Method | Rules (violations throw `INVALID_OPTIONS` at call time) |
| --- | --- |
| `buttons(buttons, { text, title, subtitle, footer, image, video, bottomSheet, limitedTimeOffer })` | 1–10 buttons, each with non-empty `text` (except `location`). `{ id, text }` or `type: 'reply'` needs a unique `id`; `url` needs `url`; `copy` needs `code`; `call` needs `phone`; `reminder`/`cancel-reminder`/`address` default `id` to `text`. `image` wins over `video`. `limitedTimeOffer.expiresAt` is Unix **seconds** |
| `list({ buttonText, sections, title, description, footerText })` | `buttonText` required; ≥1 section, each ≥1 row; ≤10 rows **total**; row ids unique across sections. `description` is the body |
| `carousel(cards, { text })` | 1–10 cards, each with `title`, `subtitle`, `body`, `footer`, `image`/`video`, up to 10 buttons |
| `template({ body, buttons, header, footer })` | 1–3 reply buttons; `header` becomes a bold first line. **Not** a Meta template — use `client.sendTemplate()` on Cloud |

Only reply buttons and list rows report back (`button-click`, `list-select`); url/copy/call act on the phone.
Encode what the handler needs in the id (`confirm:1042`) because the tap doesn't carry the original message.
Header media that fails to upload rejects with `SEND_FAILED` `interactive media upload failed`.

On the Cloud API the builder translates to Meta's layouts; anything else rejects with `ZaileysBuilderError`
`SEND_FAILED` whose `cause` is `ZaileysCloudError` code `NOT_IMPLEMENTED`:

| Sent on Cloud | Result |
| --- | --- |
| 1–3 reply buttons, `template()` | Reply buttons; `title` becomes a text header, `subtitle` dropped |
| `list()` | List |
| Exactly one `url` button | Link button; `webview` ignored |
| 4+ reply buttons, image/video header, copy/call/reminder/location/address, mixed reply+url, `carousel()` | `NOT_IMPLEMENTED` |
| `bottomSheet`, `limitedTimeOffer` | Silently dropped |

The key returned by an interactive send on Cloud carries a locally generated `id`, not Meta's `wamid`, so don't
react to or quote it. Details: https://zaileys.kejaa.id/messaging/interactive#differences-on-the-cloud-api

```ts
import { ZaileysBuilderError, ZaileysCloudError } from 'zaileys'

const sendConfirm = async (to: string, orderId: string) => {
  try {
    await client.send(to).buttons(
      [
        { id: `confirm:${orderId}`, text: 'Confirm' },
        { type: 'copy', text: 'Copy voucher', code: 'HEMAT20' },
      ],
      { title: `Order #${orderId}`, text: 'Total: Rp185.000' },
    )
  } catch (error) {
    const notOnCloud =
      error instanceof ZaileysBuilderError &&
      error.cause instanceof ZaileysCloudError &&
      error.cause.code === 'NOT_IMPLEMENTED'
    if (!notOnCloud) throw error
    await client.send(to).template({ body: `Order #${orderId}. Voucher: HEMAT20`, buttons: [{ id: `confirm:${orderId}`, text: 'Confirm' }] })
  }
}
```

## Statuses

WhatsApp Web only.

- **Personal**: send any text/image/video/audio to `status@broadcast` with `.audience([...jids])`. Without an
  audience WhatsApp accepts the status and shows it to nobody, so zaileys refuses (`INVALID_OPTIONS`); there is
  no "all contacts" default. `.audience()` on another recipient → `INVALID_RECIPIENT`.
- **Group**: `client.send(groupJid).groupStatus('text', { backgroundColor: '#128C7E', font: 'calistoga' })`, or
  `groupStatus({ image | video | audio, caption?, ptt? })`, or `groupStatus(msg)` to repost text/image/video/audio
  (media is downloaded and re-uploaded). Non-group recipient → `INVALID_RECIPIENT`.

```ts
await client
  .send('status@broadcast')
  .image('./promo/weekend-sale.jpg', { caption: 'Weekend sale: 20% off' })
  .audience(['6281111111111@s.whatsapp.net', '6282222222222@s.whatsapp.net'])
```

## Acting on a sent message

Keys come from a send, `msg.reply()`, `msg.message().key`, or event payloads. A key is plain JSON — store it
to edit or delete after a restart.

| Call | Resolves to | Web notes | Cloud API |
| --- | --- | --- | --- |
| `client.edit(key).text(s)` / `.image(src, opts)` / `.video(src, opts)` | new key | Thenable like `send()`; no content → `EMPTY_CONTENT`; key without `remoteJid` → `INVALID_OPTIONS` | Throws `UNSUPPORTED_ON_CLOUD` synchronously |
| `client.delete(key, { forEveryone })` | `void` | `forEveryone` defaults to `true`; `false` deletes only in the bot's account | `UNSUPPORTED_ON_CLOUD` |
| `client.react(key, emoji)` / `msg.react(emoji)` | reaction key | `''` removes the reaction | Works |
| `client.pin(key, { duration })` / `client.unpin(key)` | key | `duration` seconds: 86400 (default), 604800, 2592000 | `UNSUPPORTED_ON_CLOUD` |
| `client.forward(key, to)` | new key | Copies from the message store: messages from before a restart (memory store) or older than auto-delete's month reject with `MESSAGE_NOT_FOUND` | Rejects with `client not connected` |

`react`, `delete`, and `pin` pass socket failures through unwrapped (not `ZaileysBuilderError`).
Guide: https://zaileys.kejaa.id/messaging/edit-delete-react

## Send errors

Builder failures are `ZaileysBuilderError`; branch on `error.code`, and read `error.cause` for the original.

| Code | Caused by |
| --- | --- |
| `EMPTY_CONTENT` | Empty or whitespace text, poll question, or group status text; repost source with nothing to post; `client.edit(key)` awaited without a content method |
| `INVALID_RECIPIENT` | `groupStatus()` to a non-`@g.us` chat; `audience()` with a recipient other than `status@broadcast` |
| `USERNAME_NOT_FOUND` | A non-JID recipient that WhatsApp Web can't match — `msg.chatId`, a number with `+`/spaces/leading `0`, or a number not on WhatsApp |
| `MEDIA_LOAD_FAILED` | URL non-2xx, timeout, over `maxBytes`, private address, protected path, `ENOENT`, sticker conversion or audio transcode failure, group status upload |
| `INVALID_OPTIONS` | `client not connected`; limits and required fields above; `video()` given a non-video; album outside 2–30; key without `remoteJid`; personal status without audience |
| `SEND_FAILED` | Socket or Graph API rejected the send, or no key came back; interactive header upload failed. On Cloud, `cause` is a `ZaileysCloudError`: `NOT_IMPLEMENTED` (layout unsupported), `REQUEST_FAILED` (Meta refused; its code, such as 131047 outside the 24-hour window, is in the message), `RATE_LIMITED`, `AUTH` |
| `MESSAGE_NOT_FOUND` | `client.forward()` key not in the store |
| `UNSUPPORTED_ON_CLOUD` | `ZaileysProviderError` from `edit`, `delete`, `pin`, `unpin`, `setDisappearing` on Cloud; `error.feature` names the call |

Each error message, looked up by its text: https://zaileys.kejaa.id/reference/troubleshooting#sending
