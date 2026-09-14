# Receiving messages and events

## Contents

- Event catalog
- What one message fires
- How handlers run
- Own messages and replayed messages
- MessageContext fields
- Replying and reading context
- Received media
- Mentions
- Taps, reactions, edits, deletes, and votes
- Per-conversation state

## Event catalog

`client.on(name, handler)` is fully typed; `ClientEventMap['name']` gives any payload type. Payload types
(`MessageContext`, `ButtonClickPayload`, `ReactionPayload`, …) are exported from `'zaileys'`.

| Group | Event | Payload | Web | Cloud |
| --- | --- | --- | --- | --- |
| Messages | `message` | `MessageContext` — anything with text or an attachment, including button/list taps | Yes | Yes |
| | `text` | `MessageContext` — text bodies and structured content (poll, location, contact, event, buttons…); **not** captions or taps | Yes | Yes |
| | `image`, `video`, `audio`, `document`, `sticker` | `MessageContext` with a file `media`; caption in `msg.text` | Yes | Yes |
| | `mention` | `MentionContext` — the bot's own account was @mentioned | Yes | No |
| | `mention-all` | `MentionAllContext` — a group message carrying a group mention (`msg.mentionedGroups`) | Yes | No |
| Message changes | `reaction` | `ReactionPayload` | Yes | Yes |
| | `edit`, `delete`, `poll-vote` | `EditPayload`, `DeletePayload`, `PollVotePayload` | Yes | No |
| Interactions | `button-click`, `list-select` | `ButtonClickPayload`, `ListSelectPayload` | Yes | Yes |
| Groups | `group-join`, `group-leave`, `group-update`, `member-tag` | `groupId`, `participants[]`, `action`, `by?` / changed fields | Yes | No |
| Calls | `call-incoming`, `call-ended` | `{ callId, from, isGroup, isVideo, caller? }`; reject with `client.rejectCall(call)` | Yes | No |
| Presence and account | `presence` | `{ jid, participant?, status }` — only for chats subscribed with `client.socket?.presenceSubscribe(jid)` | Yes | No |
| | `history-sync`, `newsletter`, `limited` | Sync progress, channel activity, account restrictions | Yes | No |
| Connection | `connect`, `disconnect`, `error` | `{ me }`, `{ reason, willReconnect }`, `{ error }` | Yes | Yes |
| | `qr`, `pairing-code`, `reconnecting`, `auth-exhausted` | Login and retry state | Yes | No |
| Commands | `command-blocked`, `command-error`, `command-not-found` | Command framework only; listening to `command-error` stops zaileys logging it | Yes | No |
| Cloud only | `message-status`, `template-status`, `flow-response`, `order` | Arrive through `client.webhook()` | No | Yes |

Payload fields: https://zaileys.kejaa.id/reference/events

## What one message fires

The pipeline emits synchronously, in this order, for every incoming message: `message`, `text`, `image`,
`video`, `audio`, `document`, `sticker`, `mention`, `mention-all`, `button-click`, `list-select` — each only
when it applies.

| Someone sends | Fires |
| --- | --- |
| `hi` | `message`, `text` |
| Photo captioned `/help` | `message`, `image` (not `text` — so caption commands need `message`) |
| Poll, location, contact card | `message`, `text` (details in `msg.media`) |
| Tap on a reply button | `message` (`msg.text` is the button label), `button-click` |
| Group photo @mentioning the bot | `message`, `image`, `mention` |

Listening to both `message` and `text` for the same job answers text twice. Pick specific events, or one
`message` handler that switches on `msg.chatType` (`'text' | 'image' | 'video' | 'audio' | 'document' |
'sticker' | 'poll' | 'contact' | 'location' | 'live-location' | 'event' | 'album' | 'group-invite' |
'product' | 'order' | 'payment' | 'buttons' | 'list' | 'interactive' | 'template' | 'unknown'`).

## How handlers run

| Behaviour | Consequence |
| --- | --- |
| Handlers run in registration order, synchronously, and their promises are **not awaited** | Two async handlers for one event run concurrently; so do handlers for consecutive messages from the same chat |
| `client.on()` returns an idempotent unsubscribe function; `client.off(event, fn)` also works | There is no `once` — call the returned function inside the handler |
| `client.removeAllListeners('message')` | Also removes zaileys' own `message` listeners: the command dispatcher and the per-chat disappearing-timer tracking. Unsubscribe your own handlers instead |
| A handler that throws synchronously | Caught; the other handlers still run; logged at `error` level as `listener threw` — invisible unless a `logger` is passed or `ZAILEYS_DEBUG=1` |
| An `async` handler that rejects | Not caught: an unhandled rejection, which exits Node.js by default |
| Messages whose sender or mentions are LIDs | Held up to 3 s per lookup while zaileys maps LIDs to phone JIDs, so they can arrive after later messages. Under a flood the backlog is capped and overflow is dropped with a `shed messages` warning rather than delivered with an unresolved identity |
| Hot reload re-running `client.on()` | Duplicate handlers; check `client.listenerCount('text')` |

```ts
client.on('text', async (msg) => {
  if (msg.isOld || !msg.text.startsWith('!order ')) return
  try {
    const res = await fetch(`https://api.example.com/orders/${encodeURIComponent(msg.text.slice(7))}`)
    if (!res.ok) throw new Error(`order API answered ${res.status}`)
    await msg.reply(await res.text())
  } catch (error) {
    console.error('order lookup failed:', error)
    await msg.reply('Sorry, something went wrong. Try again in a minute.').catch(() => undefined)
  }
})
```

## Own messages and replayed messages

- `ignoreMe` (default `true`) drops messages sent from the bot's account — by the bot or by a person on its
  phone — before any message event fires, including `button-click` and `list-select`. Set `ignoreMe: false`
  to see them and check `msg.isFromMe`, or the bot will answer itself in a loop.
  https://zaileys.kejaa.id/concepts/configuration#react-to-your-own-messages
- `reaction`, `edit`, `delete`, and `poll-vote` are **not** filtered by `ignoreMe`; check `sender.isMe`.
- `msg.isOld` is `true` for messages delivered in a catch-up batch (after a reconnect or login) rather than
  live. Return early on it for anything that shouldn't answer hours-old messages.

## MessageContext fields

| Field | Type | What to know |
| --- | --- | --- |
| `text` | `string` | Body, caption, or tapped button label; `''` when none |
| `senderId` | `string` | Phone JID of the author. Stays `…@lid` when WhatsApp didn't share the mapping in time (`addressingMode === 'lid'`) |
| `senderLid` | `string \| null` | The LID whenever WhatsApp sent one. For owner checks compare both, or use `citation` |
| `roomId` | `string \| null` | The group, or the other person in a direct chat. Answer here: `msg.roomId ?? msg.senderId` |
| `chatId` | `string` | **The message ID** (`key.id`), not a chat. Never a send destination |
| `uniqueId` | `string` | 16 hex chars hashed from `remoteJid`, `id`, `fromMe` — unique per message. Dedupe, file names |
| `staticId` | `string` | Hash of `roomId` + `senderId` — same for one person in one chat. Conversation state key |
| `chatType` | `ChatType` | Discriminates content; see the list above |
| `senderName` | `string \| null` | Push name the sender chose — never use for authorization. `msg.business?.verifiedName` can't be faked |
| `isGroup`, `isFromMe`, `isOld`, `isViewOnce`, `isEdited`, `isForwarded` | `boolean` | `isGroup` is always `false` on Cloud |
| `isTagMe`, `mentions` | `boolean`, `string[]` | Mentions with LIDs mapped to phone JIDs where known |
| `isPrefix` | `boolean` | Text starts with one of `commandPrefix` |
| `timestamp` | `number` | **Milliseconds** (payload timestamps differ, see below) |
| `ephemeralDuration` | `number \| null` | Chat's disappearing timer in seconds |
| `verified` | `boolean` | `false` when the context was rebuilt from the sender's own quote data (see `replied()`) |
| `media` | `ContextMedia \| undefined` | File or structured content; narrow on `media.type` |

All fields: https://zaileys.kejaa.id/reference/message-context

## Replying and reading context

| Method | Returns | Gotcha |
| --- | --- | --- |
| `msg.reply(text, opts?)` | `Promise<WAMessageKey>` | Text only (`opts` = `{ rich, title, footer, sources }`); quotes the message and mirrors its disappearing timer. For media or mentions use the send builder with `.reply(msg.message())` |
| `msg.react(emoji)` | `Promise<WAMessageKey>` | `''` removes it |
| `msg.replied()` | `Promise<MessageContext \| null>` | The quoted message. Looked up in the store first; otherwise rebuilt from the quote the sender attached, with `verified: false` — its text, author, and `isFromMe` are the sender's claim, so don't authorize on them |
| `msg.roomName()` | `Promise<string \| null>` | Group subject (fetched, cached 5 min) or the sender's push name in a direct chat |
| `msg.receiverName()` | `Promise<string \| null>` | Bot's own name; `null` on Cloud |
| `msg.message()` | `WAMessage` | Raw Baileys message; `msg.message().key` is the key for `client.react/forward/downloadMedia` |
| `msg.citation.authors()` / `.banned()` | `Promise<boolean>` | From the `citation` client option; `false` when unset. Entries without `@` match phone numbers only, never LIDs |

## Received media

`msg.media` is always a file in the five media handlers, but TypeScript sees the whole `ContextMedia` union.
Narrow on `type` first; that also gives structured types (`'poll'`, `'location'`, `'contact'`, `'buttons'`, …).

| File field | Notes |
| --- | --- |
| `mimetype`, `caption`, `fileName` | `string \| null`; `fileName` is usually set for documents only — `basename()` it before writing to disk |
| `fileSize`, `duration`, `width`, `height`, `pages` | `number \| null`; always `null` on Cloud |
| `ptt`, `isAnimated` | Voice note vs audio file; GIF-style video or animated sticker |
| `thumbnail` | Embedded low-res JPEG `Buffer \| null`, no download needed (Web) |
| `buffer()`, `stream()` | Download on WhatsApp Web only; reject (logging `media download failed`) when WhatsApp no longer serves the file |

| Download path | Web | Cloud | Returns `null` when |
| --- | --- | --- | --- |
| `msg.media.buffer()` / `stream()` inside the handler | Yes, including view-once | Doesn't work | — |
| `client.downloadMedia(key)` → `{ buffer, mime, size }` | Yes | The only way | Message not in the store (memory store forgets on restart; auto-delete prunes after a month), no file, or view-once |

```ts
import type { MessageContext } from 'zaileys'

const downloadBytes = async (msg: MessageContext): Promise<Buffer | null> => {
  if (client.provider === 'cloud') return (await client.downloadMedia(msg.message().key))?.buffer ?? null
  return msg.media && 'buffer' in msg.media ? msg.media.buffer() : null
}

client.on('image', async (msg) => {
  if (msg.media?.type !== 'image' || msg.text !== '/sticker') return
  try {
    const bytes = await downloadBytes(msg)
    if (bytes) await client.send(msg.roomId ?? msg.senderId).sticker(bytes, { shape: 'rounded' })
  } catch (error) {
    console.error('sticker failed:', error)
  }
})
```

Cloud downloads throw `ZaileysCloudError` `REQUEST_FAILED` (Meta couldn't serve it, 404 after expiry) or
`AUTH`. To convert received files without sending, `new Media(bytes)` exposes `image.resize(w, h)`,
`audio.toMp3()`, `audio.toOpus()`, `sticker.create(opts)`, `thumbnail.get()`; its methods throw plain `Error`.
Details: https://zaileys.kejaa.id/messaging/receiving-media#differences-on-the-cloud-api

## Mentions

- `msg.mentions` lists everyone tagged; `msg.isTagMe` says whether that includes the bot. To react to any
  mention, read these in `message`/`text` — the `mention` event fires only for the bot's own account.
- `mention` payload adds `mentionedJids` (same as `mentions`) and `selfJid`. It matches the bot by phone JID or LID.
- `mention-all` fires for WhatsApp's group mention (`contextInfo.groupMentions`, listed in
  `msg.mentionedGroups`), not for a message sent with `.mentionAll()`. `members` is always `undefined`.
- Mentioned LIDs are rewritten to phone JIDs in `msg.text` too when the mapping is known.

## Taps, reactions, edits, deletes, and votes

These payloads are not `MessageContext`: there is no `reply()`. Answer with `client.send()` to the chat in
`key.remoteJid`, falling back to the sender.

| Event | Fields | `timestamp` unit | Notes |
| --- | --- | --- | --- |
| `button-click` | `key`, `buttonId`, `buttonText?`, `sender` | seconds | `key` is the **tap**, not the message that showed the buttons |
| `list-select` | `key`, `rowId`, `title?`, `sender` | seconds | Same |
| `reaction` | `key` (the reacted-to message), `emoji: string \| null`, `sender` | milliseconds | `null` means the reaction was removed |
| `edit` | `key`, `newContent`, `editedAt`, `sender` | seconds (`editedAt`) | `newContent` is `''` for non-text edits |
| `delete` | `key`, `deletedFor: 'everyone' \| 'me'`, `sender` | seconds | Carries no content; `client.store.getMessage(key)` if kept |
| `poll-vote` | `pollKey`, `selectedOptions` (SHA-256 hex), `voter`, `options()` | milliseconds | `options()` needs the original poll in the store, else `[]` |

`sender`/`voter` is `SenderInfo`: `{ jid, deviceJid?, lid?, pn?, username?, pushName?, isMe? }`.

```ts
client.on('button-click', async (tap) => {
  const [action, orderId] = tap.buttonId.split(':')
  if (action !== 'confirm' || !orderId) return
  try {
    await client.send(tap.key.remoteJid ?? tap.sender.pn ?? tap.sender.jid).text(`Order #${orderId} confirmed.`)
  } catch (error) {
    console.error('confirm failed:', error)
  }
})
```

## Per-conversation state

Key state by `msg.staticId` (one person in one chat), not `uniqueId`, which changes with every message. The
same person gets separate state in each group; key by `senderId` to follow a person across chats.

Because handlers aren't awaited, two quick messages from the same chat run their handlers concurrently. Read
and write state synchronously, or serialize per `staticId` when a handler awaits between reading and writing:

```ts
const queues = new Map<string, Promise<void>>()
const carts = new Map<string, string[]>()

client.on('text', (msg) => {
  if (!msg.text.startsWith('add ')) return
  const previous = queues.get(msg.staticId) ?? Promise.resolve()
  const next = previous.then(async () => {
    const cart = [...(carts.get(msg.staticId) ?? []), msg.text.slice(4)]
    carts.set(msg.staticId, cart)
    await msg.reply(`Your cart: ${cart.join(', ')}`)
  })
  queues.set(msg.staticId, next.catch((error) => console.error('cart update failed:', error)))
})
```

In-memory maps vanish on restart and grow without bound; evict idle keys or use a store. `uniqueId` remains
the right key for deduplicating a message you may see twice (for example, after a reconnect).
Background: https://zaileys.kejaa.id/concepts/message-context#tell-messages-and-conversations-apart
