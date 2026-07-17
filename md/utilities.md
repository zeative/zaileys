# Utilities

> Source: https://zeative.github.io/zaileys/utilities

# Utilities

Zaileys exports a handful of pure helpers used internally — useful for building your own logic.
They are plain functions with no client dependency, so you can import and call them anywhere:

```typescript
```

  These are the same helpers zaileys uses to build each message context. For example,
  `computeUniqueId` / `computeStaticId` produce the exact `uniqueId` / `staticId` values you see on
  a `MessageContext`, and `senderDeviceOf` produces its `senderDevice`. See
  [Message Payload](/message-payload).

## JID helpers

Functions for inspecting and normalizing WhatsApp JIDs (the `user@server` addresses used for
chats, users, and groups).

| Method | Signature | Description |
| --- | --- | --- |
| `isJid(value)` | `(value: string) => boolean` | `true` if the string ends with a known WhatsApp server suffix (`@s.whatsapp.net`, `@g.us`, `@lid`, `@newsletter`, `@broadcast`, `@c.us`). |
| `isLidJid(jid)` | `(jid: string) => boolean` | `true` if the JID is a LID address (`@lid`). |
| `isPnJid(jid)` | `(jid: string) => boolean` | `true` if the JID is a phone-number address (`@s.whatsapp.net` or `@c.us`). |
| `normalizeJid(jid)` | `(jid: string \| null \| undefined) => string \| null` | Normalizes a JID — strips the device suffix and canonicalizes the user. Returns `null` for empty/invalid input. |
| `jidToPhone(jid)` | `(jid: string) => string` | Digits-only phone number from a phone JID. Returns `''` for groups, LIDs, and anything that is not a `@s.whatsapp.net` / `@c.us` JID. |
| `phoneToJid(phone)` | `(phone: string) => string` | Builds a user JID from a phone number or digits (non-digit characters are stripped). |

```typescript

isJid('628123@s.whatsapp.net') // true
isJid('hello')                  // false

isLidJid('12345@lid')                 // true
isPnJid('628123@s.whatsapp.net')      // true

// Strip a device suffix to get the canonical user JID
normalizeJid('628123:7@s.whatsapp.net') // '628123@s.whatsapp.net'

// Convert between phones and JIDs
jidToPhone('628123@s.whatsapp.net') // '628123'
jidToPhone('12345@g.us')            // '' (groups have no phone)
phoneToJid('+62 812-3')             // '628123@s.whatsapp.net'
```

### Baileys JID helpers

The lower-level JID helpers from Baileys are re-exported from `'zaileys'`, so you can import them
directly without depending on `baileys`. They are pure functions.

| Method | Signature | Description |
| --- | --- | --- |
| `jidDecode(jid)` | `(jid: string) => { user: string; server: string; device?: number } \| undefined` | Decode a JID into its parts. `undefined` for invalid input. |
| `jidEncode(user, server, device?)` | `(user: string \| null, server: string, device?: number) => string` | Build a JID string from parts. |
| `jidNormalizedUser(jid)` | `(jid: string) => string` | Normalized user JID (strips the device segment). |
| `areJidsSameUser(a, b)` | `(a?: string, b?: string) => boolean` | `true` if both JIDs are the same user, ignoring device/LID. |
| `isJidGroup(jid)` | `(jid?: string) => boolean` | `true` for a group JID (`@g.us`). |
| `isJidBroadcast(jid)` | `(jid?: string) => boolean` | `true` for a broadcast JID (`@broadcast`). |
| `isJidNewsletter(jid)` | `(jid?: string) => boolean` | `true` for a newsletter/channel JID (`@newsletter`). |
| `isLidUser(jid)` | `(jid?: string) => boolean` | `true` for a LID user (`@lid`). |
| `isPnUser(jid)` | `(jid?: string) => boolean` | `true` for a phone-number user (`@s.whatsapp.net`). |
| `getDevice(jid)` | `(jid: string) => string` | Device kind decoded from the JID. |

```typescript
import {
  jidDecode, jidEncode, jidNormalizedUser, areJidsSameUser,
  isJidGroup, isJidNewsletter, isLidUser, isPnUser, getDevice,
} from 'zaileys'

jidDecode('628123:7@s.whatsapp.net') // { user: '628123', server: 's.whatsapp.net', device: 7 }
jidEncode('628123', 's.whatsapp.net') // '628123@s.whatsapp.net'
jidNormalizedUser('628123:7@s.whatsapp.net') // '628123@s.whatsapp.net'

areJidsSameUser('628123:7@s.whatsapp.net', '628123@s.whatsapp.net') // true
isJidGroup('12345@g.us')           // true
isPnUser('628123@s.whatsapp.net')  // true
isLidUser('12345@lid')             // true
```

### LID ↔ phone (async, on the client)

These two are **`client.*` methods, not pure functions** — they resolve through WhatsApp's LID
mapping and may hit the network, so they need a connected socket and return a `Promise`.

| Method | Signature | Description |
| --- | --- | --- |
| `client.lidToPn(lid)` | `(lid: string) => Promise<string \| null>` | Resolve a `@lid` JID to its phone-number JID. `null` if unknown. |
| `client.pnToLid(pn)` | `(pn: string) => Promise<string \| null>` | Resolve a phone-number JID to its `@lid` JID. `null` if unknown. |

```typescript

const client = new Client()
await client.connect()

await client.lidToPn('12345@lid')             // '628123@s.whatsapp.net' | null
await client.pnToLid('628123@s.whatsapp.net') // '12345@lid' | null
```

## ID hashers

Deterministic 16-character UPPERCASE hex hashers. They are pure: the same input always yields the
same id, with no randomness or counters.

| Method | Signature | Description |
| --- | --- | --- |
| `computeUniqueId(key)` | `(key: WAMessageKey) => string` | Per-message id derived from the message key (`remoteJid` + `id` + `fromMe`). Matches a context's `uniqueId`. |
| `computeStaticId(roomId, senderId)` | `(roomId: string \| null, senderId: string) => string` | Stable id per `(room, sender)` pair — same room + same sender always hash to the same value. Matches a context's `staticId`. |

```typescript

const uid = computeUniqueId({ remoteJid: '628123@s.whatsapp.net', id: 'ABCD', fromMe: false })
// e.g. 'A1B2C3D4E5F60718'

// Stable per (room, sender) — useful as a dedup / per-user key
const sid = computeStaticId('12345@g.us', '628123@s.whatsapp.net')
computeStaticId('12345@g.us', '628123@s.whatsapp.net') === sid // true
```

```typescript

const client = new Client()
const seen = new Set<string>()

client.on('text', (ctx) => {
  // ctx.staticId already equals this value
  const key = computeStaticId(ctx.roomId, ctx.senderId)
  if (seen.has(key)) return // already handled this sender in this room
  seen.add(key)
})
```

## Text & device

| Method | Signature | Description |
| --- | --- | --- |
| `extractLinks(text)` | `(text: string) => string[]` | Extracts all `http(s)` URLs from a string. Trailing punctuation (`.,;:!?`) is trimmed off each URL. Returns `[]` when none are found. |
| `senderDeviceOf(jid)` | `(jid: string) => 'android' \| 'ios' \| 'web' \| 'desktop' \| 'unknown'` | Decodes the originating device from a JID's device segment. |
| `epochSecondsToMs(value)` | `(value: unknown) => number` | Converts an epoch-**seconds** timestamp to milliseconds. Accepts `number`, `string`, `bigint`, or a Long-like `{ low, high }` / `{ toNumber() }` object. Returns `0` for invalid or non-positive input. |

```typescript

extractLinks('see https://zaileys.dev and http://example.com.')
// ['https://zaileys.dev', 'http://example.com']

senderDeviceOf('628123:2@s.whatsapp.net') // 'ios'
senderDeviceOf('628123@s.whatsapp.net')   // 'android'

epochSecondsToMs(1718000000) // 1718000000000
epochSecondsToMs('0')        // 0
```

## Media

| Method | Signature | Description |
| --- | --- | --- |
| `loadMedia(src, opts?)` | `(src: string \| Buffer \| URL, opts?: { timeoutMs?: number }) => Promise<{ buffer: Buffer; mime: string; size: number }>` | Resolves any media source into a buffer: fetches `http(s)` URLs, reads local file paths and `file:` URLs, or passes a `Buffer` through. Detects the MIME type and reports the byte size. Throws `ZaileysBuilderError` (`MEDIA_LOAD_FAILED`) on failure. Default fetch timeout is 30 000 ms. |
| `detectMimeFromBuffer(buffer)` | `(buffer: Buffer) => Promise<string>` | Sniffs the MIME type from a buffer's magic bytes. Falls back to `application/octet-stream` for empty/unknown buffers. |

```typescript

// From a URL (fetched), a path (read), or a Buffer (passed through)
const { buffer, mime, size } = await loadMedia('https://example.com/photo.jpg')
console.log(mime, size) // 'image/jpeg' 51234

await loadMedia('./assets/voice.ogg')          // local path
await loadMedia(Buffer.from([0xff, 0xd8]))      // existing buffer

await detectMimeFromBuffer(buffer) // 'image/jpeg'

// Override the fetch timeout (ms)
await loadMedia('https://slow.example.com/big.mp4', { timeoutMs: 60_000 })
```

## Array

| Method | Signature | Description |
| --- | --- | --- |
| `chunk(arr, size)` | `<T>(arr: readonly T[], size: number) => T[][]` | Splits an array into batches of at most `size` items. Throws `RangeError` if `size <= 0`. |

```typescript

chunk([1, 2, 3, 4, 5], 2) // [[1, 2], [3, 4], [5]]

// Common use: rate-limit bulk sends by batching recipients
const recipients = ['a@s.whatsapp.net', 'b@s.whatsapp.net' /* … */]
for (const batch of chunk(recipients, 10)) {
  await Promise.all(batch.map((jid) => client.send(jid).text('Hello!')))
}
```

## See also

- [Message Payload](/message-payload) — where `uniqueId`, `staticId`, `senderDevice`, and `links` show up on a context.
- [Media Processing](/media) — how zaileys uses `loadMedia` when sending media.
- [API Reference](/api-reference) — the full export surface.
