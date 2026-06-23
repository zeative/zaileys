# zaileys API Reference

Dense, source-verified API surface for implementing zaileys (WhatsApp client over baileys). Import: `import { Client } from 'zaileys'`. JIDs: user `628xxx@s.whatsapp.net`, group `xxx@g.us`, newsletter `xxx@newsletter`.

## Quick start

```typescript
import { Client } from 'zaileys'

const client = new Client({ sessionId: 'main', authType: 'pairing', phoneNumber: '628xxx' })
client.on('connect', ({ me }) => console.log('online', me.id))
client.on('text', async (msg) => { if (msg.text === 'ping') await msg.reply('pong') })
// autoConnect defaults to true — connect() fires automatically on next microtask.
// Call client.connect() manually only if autoConnect:false. connect() RETURNS a Promise<void> that resolves on 'open'.
```

---

## Client construction & ClientOptions

`new Client(options?: ClientOptions)`. All keys optional.

| option | type | default | note |
|---|---|---|---|
| `sessionId` | `string` | `'default'` | namespaces auth dir + scheduler |
| `authType` | `'qr' \| 'pairing'` | `'qr'` | `'pairing'` REQUIRES `phoneNumber` (else `connect()` rejects) |
| `phoneNumber` | `string` | — | digits only, no `+`; required for pairing |
| `auth` | `AuthStoreBundle` | `new FileAuthStore({ basePath: './.zaileys/auth/<sessionId>' })` | credential/signal store |
| `store` | `MessageStore` | `new MemoryMessageStore()` | message/chat/scheduler store |
| `logger` | `Logger` | adopted internal | `{debug,info,warn,error,fatal}` |
| `cacheSignal` | `boolean` | `true` | wraps auth in cacheable layer |
| `reconnect` | `ReconnectOptions` | `{}` | `{enabled?,maxAttempts?,initialDelayMs?,maxDelayMs?,jitterFactor?}` |
| `qrTerminal` | `boolean` | `true` | print QR to terminal on `qr` |
| `baileys` | `Partial<UserFacingSocketConfig>` | `{}` | merged into socket cfg (`markOnlineOnConnect:false` is set, override-able) |
| `autoConnect` | `boolean` | `true` | auto `connect()` via `queueMicrotask` |
| `statusLog` | `boolean` | `true` | human status lines to stderr; suppresses libsignal noise |
| `commandPrefix` | `string \| string[]` | — | enables `.command()`; empty/undefined ⇒ commands disabled |
| `citation` | `CitationConfig` | — | `{authors?, banned?}`: each `string[] \| (jid)=>boolean\|Promise<boolean>` |
| `ignoreMe` | `boolean` | `true` | drop self-authored inbound messages |

### Properties & lifecycle methods

| member | type | note |
|---|---|---|
| `client.sessionId` | `string` | readonly |
| `client.state` | `ConnectionState` | `'idle'\|'connecting'\|'qr-pending'\|'pairing-pending'\|'connected'\|'reconnecting'\|'disconnecting'\|'disconnected'` |
| `client.socket` | `WASocket \| undefined` | raw baileys socket |
| `client.auth` | `AuthStoreBundle` | |
| `client.store` | `MessageStore` | |
| `client.connect()` | `Promise<void>` | resolves on first `open`; rejects if pairing w/o phoneNumber or closed before open |
| `client.disconnect()` | `Promise<void>` | graceful; closes auth+store, emits `disconnect{willReconnect:false}` |
| `client.logout()` | `Promise<void>` | `socket.logout()` + clears creds/signal; emits `disconnect{reason:'logged-out'}` |
| `client.group` / `.privacy` / `.newsletter` / `.community` / `.presence` / `.profile` / `.chat` / `.contact` / `.business` | domain modules | lazy getters |

Domain/builder methods throw `ZaileysBuilderError('INVALID_OPTIONS','client not connected')` (send/edit/etc) or `ZaileysDomainError('NOT_CONNECTED', …)` when socket is absent.

---

## Connection events — `client.on(name, cb)`

| event | payload |
|---|---|
| `connect` | `{ sessionId, me: { id, lid?, name? } }` |
| `disconnect` | `{ sessionId, reason: DisconnectReasonDomain, willReconnect: boolean }` |
| `qr` | `{ sessionId, qrString, expiresAt }` (expiresAt = now+60000) |
| `pairing-code` | `{ sessionId, code, expiresAt }` |
| `reconnecting` | `{ sessionId, attempt, delayMs, reason }` |
| `error` | `{ sessionId, error: Error }` (emitted for auto-connect failures only if an `error` listener exists) |

`DisconnectReasonDomain` = `'logged-out' | 'connection-replaced' | 'forbidden' | 'restart-required' | 'bad-session' | 'connection-closed' | 'connection-lost' | 'multi-device-mismatch' | 'unavailable-service' | 'unknown'`. Fatal (no reconnect): `logged-out`, `connection-replaced`, `forbidden`. Auth cleared on those + `bad-session`.

`on`/`off` are typed via `TypedEventEmitter`. `off(name, handler)` removes; `on` returns `this`.

---

## Message events + MessageContext

Message events deliver a `MessageContext` (mention events extend it):

| event | payload type |
|---|---|
| `message` | `MessageContext` — umbrella; fires once for ANY inbound message (any `chatType`), in addition to the specific event |
| `text` `image` `video` `audio` `document` `sticker` | `MessageContext` |
| `reaction` | `ReactionPayload {key,emoji:string\|null,sender,timestamp}` |
| `edit` | `EditPayload {key,newContent,editedAt,sender}` |
| `delete` | `DeletePayload {key,deletedFor:'everyone'\|'me',sender,timestamp}` |
| `poll-vote` | `PollVotePayload {pollKey,selectedOptions:string[],voter,timestamp}` |
| `button-click` | `ButtonClickPayload {key,buttonId,buttonText?,sender,timestamp}` |
| `list-select` | `ListSelectPayload {key,rowId,title?,sender,timestamp}` |
| `mention` | `MentionContext` (extends ctx) `{mentionedJids,selfJid}` |
| `mention-all` | `MentionAllContext` `{isMentionAll:true,selfJid,members?}` |
| `group-update` | `{groupId,update:Partial<{subject,description,announce,restrict,ephemeralDuration}>,timestamp}` |
| `group-join` | `{groupId,participants:GroupParticipantInfo[],action:'add'\|'invite'\|'invite-link',by?,timestamp}` |
| `group-leave` | `{groupId,participants[],action:'remove'\|'leave',by?,timestamp}` |
| `member-tag` | `{groupId,participant,participantAlt?,label,timestamp}` |
| `call-incoming` / `call-ended` | `{callId,from,isGroup,isVideo,timestamp,status?,kind}` |
| `history-sync` | `{syncType,status:'complete'\|'paused',explicit}` |
| `limited` | `{reason:'reachout-timelock',retryAt}` \| `{reason:'chat-limit-reached',usedQuota?,totalQuota?}` |
| `presence` | `{jid,participant?,status:'available'\|'unavailable'\|'composing'\|'recording'\|'paused'}` |
| `newsletter` | `{newsletterId,timestamp, ...action variant}` |

`SenderInfo` = `{ jid, lid?, pn?, username?, pushName?, isMe? }`.

### MessageContext fields

| field | type | note |
|---|---|---|
| `uniqueId` | `string` | 16-char UPPERCASE hex (FNV-1a of remoteJid\|id\|fromMe); changes per message |
| `staticId` | `string` | 16-char UPPERCASE hex (FNV-1a of roomId\|senderId); STABLE per room+sender |
| `channelId` | `string` | = sessionId |
| `chatId` | `string` | message key id |
| `chatType` | `'text'\|'image'\|'video'\|'audio'\|'document'\|'sticker'\|'poll'\|'contact'\|'location'\|'live-location'\|'event'\|'album'\|'group-invite'\|'product'\|'order'\|'payment'\|'buttons'\|'list'\|'interactive'\|'template'\|'unknown'` | |
| `receiverId` | `string` | self jid |
| `roomId` | `string \| null` | group jid, else null |
| `senderId` | `string` | sender.pn ?? sender.jid |
| `senderLid` | `string \| null` | |
| `senderName` | `string \| null` | pushName |
| `senderDevice` | `'android'\|'ios'\|'web'\|'desktop'\|'unknown'\|string` | from jid device byte |
| `timestamp` | `number` | ms epoch |
| `text` | `string` | |
| `mentions` | `string[]` | resolved to PN (`@s.whatsapp.net`) when a LID map is available |
| `links` | `string[]` | http(s) URLs, trailing punctuation trimmed |
| `isFromMe` `isGroup` `isNewsletter` `isBroadcast` `isViewOnce` `isEphemeral` `isForwarded` | `boolean` | |
| `isQuestion` | `boolean` | text ends with `?` |
| `isPrefix` | `boolean` | text starts with a configured prefix |
| `isTagMe` | `boolean` | self jid in mentions |
| `isEdited` `isDeleted` `isPinned` `isUnPinned` `isBot` `isStatusMention` `isGroupStatusMention` | `boolean` | DERIVED from the raw message (protocol/pin/bot-metadata) |
| `isStory` | `boolean` | `remoteJid === 'status@broadcast'` |
| `isHideTags` | `boolean` | has mentions but text contains no `@digits` |
| `isSpam` | `boolean` | always `false` (reserved) |

### MessageContext methods

| method | signature | note |
|---|---|---|
| `roomName()` | `Promise<string \| null>` | group subject |
| `receiverName()` | `Promise<string \| null>` | self name |
| `replied()` | `Promise<MessageContext \| null>` | quoted msg as ctx |
| `message()` | `WAMessage` | raw baileys message |
| `reply(content, opts?)` | `Promise<WAMessageKey>` | `opts: TextOptions`; quotes this msg |
| `react(emoji)` | `Promise<WAMessageKey>` | |
| `media?` | `ContextMedia` (discriminated by `type`) | present per message kind — see "ctx.media variants" below |
| `citation` | `{ authors():Promise<boolean>; banned():Promise<boolean> }` | resolved against `CitationConfig` for sender |

### ctx.media variants (`ContextMedia`, discriminated by `type`)

| type | fields |
|---|---|
| `image`/`video`/`audio`/`document`/`sticker` | `MediaAttachment { mimetype, caption, fileName, fileSize, ptt, buffer(), stream() }` (all nullable except flags) |
| `poll` | `{ name, options:string[], selectableCount }` |
| `contact` | `{ displayName, vcard, contacts: { displayName, vcard }[] }` |
| `location`/`live-location` | `{ latitude, longitude, name, address, accuracy, speed, caption }` |
| `event` | `{ name, description, location, startTime, endTime, isCanceled }` |
| `album` | `{ expectedImageCount, expectedVideoCount }` (counts null when absent) |
| `group-invite` | `{ groupId, groupName, inviteCode, caption, expiresAt }` |
| `product` | `{ productId, title, description, price, currency, retailerId, url, businessOwnerId }` |
| `order` | `{ orderId, title, itemCount, total, currency, status, message }` |
| `payment` | `{ kind:'request'\|'send'\|'invite', amount, currency, note, expiresAt }` |
| `link` | `{ url, title, description }` (link-preview) |
| `buttons` | `{ contentText, footerText, buttons: { id, text }[] }` |
| `list` | `{ title, description, buttonText, sections: { title, rows: { id, title, description }[] }[] }` |
| `interactive` | `{ title, body, footer, buttons: { name, params }[] }` |
| `template` | `{ text, buttons: { id, text }[] }` |

All scalar fields are nullable (`| null`) unless noted.

---

## Send builder — `client.send(to)`

`client.send(to: string): MessageBuilder<'init'>`. `to` may be a JID or a `@username`/raw string (resolved via socket). Builder is a thenable — `await` it to send; resolves to `WAMessageKey`. Chain ONE content method, then optional modifiers, then `await`.

```typescript
await client.send('628xxx@s.whatsapp.net').text('hi')
const key = await client.send(group).image('./a.jpg', { caption: 'x' }).mentions([jid])
```

Content methods (each returns `MessageBuilder<'content-set'>`):

| method | signature | options |
|---|---|---|
| `text` | `(content, opts?: TextOptions)` | `TextOptions = { rich?: boolean } & AIRichOptions` (see AIRich) |
| `image` | `(src: MediaSource, opts?: ImageOptions)` | `{ caption?, viewOnce? }` |
| `video` | `(src, opts?: VideoOptions)` | `{ caption?, gifPlayback?, viewOnce?, ptv? }` |
| `videoNote` | `(src, opts?: VideoNoteOptions)` | round PTV note; `{ viewOnce? }` |
| `audio` | `(src, opts?: AudioOptions)` | `{ ptt?, seconds? }` |
| `document` | `(src, opts: DocumentOptions)` | `{ fileName (req), mimetype?, caption? }` |
| `sticker` | `(src, opts?: StickerOptions)` | `{ animated? }` |
| `location` | `(lat: number, lon: number, opts?: LocationOptions)` | `{ name?, address? }` |
| `contact` | `(vcard: string)` | vcard MUST start with `BEGIN:VCARD` (else INVALID_OPTIONS) |
| `poll` | `(question: string, options: string[], opts?: PollOptions)` | `{ multipleChoice? }` |
| `album` | `(items: AlbumItem[])` | `AlbumItem = { type:'image'\|'video', src, caption? }` |
| `buttons` | `(buttons, opts?: ButtonsContentOptions)` | interactive — see below |
| `template` | `(opts: TemplateOptions)` | `{ header?, body (req), footer?, buttons: ButtonDef[] }` |
| `list` | `(opts: ListOptions)` | interactive — see below |
| `carousel` | `(cards: CarouselCard[], opts?: { text? })` | interactive — see below |
| `event` | `(opts: EventOptions)` | `{ name (req), description?, startAt:Date\|number (req), endAt?, location?:{latitude,longitude,name?,address?}, call?:'audio'\|'video', canceled? }` |
| `groupInvite` | `(opts: GroupInviteOptions)` | `{ jid (req), code (req), subject?, caption?, expiresAt?:unix-sec, thumbnail?:Buffer }` |
| `product` | `(opts: ProductOptions)` | `{ image (req), title (req), businessOwnerId (req), description?, price?, currency?, productId?, retailerId?, url?, body?, footer? }` |
| `requestPhoneNumber` | `()` | ask recipient to share their number |
| `sharePhoneNumber` | `()` | share own number |
| `limitSharing` | `(enabled = true)` | toggle limit-sharing (status forwarding) |

`MediaSource = string | Buffer | URL` (file path, URL, or buffer).

Modifiers (chain after content, return same state; `reply`/`mentions` also valid on `'init'`):

| modifier | signature | note |
|---|---|---|
| `reply(quoted)` | `(WAMessage \| WAMessageKey)` | quote a message |
| `mentions(jids)` | `(string[])` | min 1; each must contain `@`; dedup-merged |
| `mentionAll()` | `()` | tag all group members |
| `disappearing(seconds)` | `(positive int)` | ephemeral expiration |
| `to(recipient)` | `(string)` | re-target (only on `'init'`) |

Send errors throw `ZaileysBuilderError` codes: `EMPTY_CONTENT` (no content set), `SEND_FAILED` (socket reject / no key), `INVALID_OPTIONS`, `MEDIA_LOAD_FAILED`.

---

## Interactive

Interactive content (`buttons`, `list`, `carousel`) sends via `socket.relayMessage` with a native_flow biz node. Throws `SEND_FAILED` if socket lacks `relayMessage`.

### buttons — `.buttons(buttons, opts?)`

`buttons: Array<ButtonDef | InteractiveButton>`, max 10, reply ids must be unique & non-empty.

`ButtonDef = { id, text }` (quick reply). `InteractiveButton` variants (discriminated by `type`):

| type | shape | native name |
|---|---|---|
| `'reply'` (default) | `{ type?:'reply', id, text }` | `quick_reply` |
| `'url'` | `{ type:'url', text, url, webview? }` | `cta_url` |
| `'copy'` | `{ type:'copy', text, code }` | `cta_copy` |
| `'call'` | `{ type:'call', text, phone }` | `cta_call` |
| `'reminder'` | `{ type:'reminder', text, id? }` | `cta_reminder` |
| `'cancel-reminder'` | `{ type:'cancel-reminder', text, id? }` | `cta_cancel_reminder` |
| `'location'` | `{ type:'location', text? }` | `send_location` |
| `'address'` | `{ type:'address', text, id? }` | `address_message` |

`ButtonsContentOptions = { text?, footer?, title?, subtitle?, image?: MediaSource, video?: MediaSource, bottomSheet?: BottomSheetOptions, limitedTimeOffer?: LimitedTimeOfferOptions }`.
`BottomSheetOptions = { listTitle?, buttonTitle?, buttonsLimit?, dividers?: number[] }`.
`LimitedTimeOfferOptions = { text?, url?, copyCode?, expiresAt?: number }`.

### list — `.list(opts: ListOptions)`

`ListOptions = { title?, description?, buttonText (req, non-empty), footerText?, sections: ListSection[] (≥1) }`.
`ListSection = { title, rows: Array<{ id, title, description? }> }`. Row ids unique & non-empty, titles non-empty; max 10 rows total. Rendered as `single_select`.

### carousel — `.carousel(cards, opts?)`

`cards: CarouselCard[]`, max 10. `CarouselCard = { title?, subtitle?, body?, footer?, image?, video?, buttons?: Array<ButtonDef|InteractiveButton> }`. `opts = { text? }`.

### template — `.template(opts)`

`TemplateOptions = { header?, body (req), footer?, buttons: ButtonDef[] }` (quick-reply buttons only).

### Interaction reply payloads

- Button tap ⇒ `button-click` event: `{ key, buttonId, buttonText?, sender, timestamp }`. `buttonId` = the reply button `id` (or copy/call/etc payload id).
- List selection ⇒ `list-select` event: `{ key, rowId, title?, sender, timestamp }`. `rowId` = selected row `id`.

---

## AIRich — `.text(content, { rich: true, ...AIRichOptions })`

Renders a Meta-AI-style rich bot message (relay). `content` is markdown parsed into `AIRichPart[]`. `AIRichOptions = { title?, footer?, sources?: Array<[profileUrl, url, text]> }`.

### Inline syntax (inside text)

| syntax | effect |
|---|---|
| `[label](url)` | hyperlink |
| `[](url)` | numbered citation |
| `[text\|width\|height\|fontHeight\|padding](<latexUrl>)` | LaTeX image (only `text` + url required) |

### Block markdown → parts

| markdown | part |
|---|---|
| paragraph text | `text` (with inline entities) |
| ` ```lang\n…\n``` ` | `code` (JS/TS keyword highlighting) |
| `\| a \| b \|` + `\|---\|` separator | `table` (first row = header) |
| `![](url)` (consecutive) | `image` (single or array) |

### Directives `:::name … :::`

List items use `-`/`*` bullets; fields are `key: value` pipe-separated (`a: x | b: y`).

| directive | fields / form |
|---|---|
| `:::suggest` | bullet lines (pipe-splittable) → suggestion pills |
| `:::tip` | free text → tip block |
| `:::image` | one URL per line |
| `:::video` | `url \| duration` per line |
| `:::product` | `title:` (req) `\| price \| sale\|saleprice \| brand \| url \| image \| icon` |
| `:::reels` | `user\|username \| title \| profile \| thumb \| url \| likes \| shares \| views \| source \| verified` |
| `:::post` | `user\|username \| title \| subtitle \| profile \| thumb \| caption \| likes \| comments \| shares \| url \| source \| footer \| icon \| verified` |

Programmatic `AIRichPart` union also supports `product`/`reels`/`post` with full typed objects (`AIRichProduct{title,price?,salePrice?,brand?,url?,image?,icon?}`, `AIRichReel{username?,title?,profileUrl?,thumbnail?,url?,likes?,shares?,views?,source?,verified?}`, `AIRichPost{title?,subtitle?,username?,profileUrl?,verified?,thumbnail?,caption?,likes?,comments?,shares?,url?,deeplink?,source?,footer?,icon?,orientation?,postType?}`).

---

## Mutations

| method | signature | note |
|---|---|---|
| `client.edit(key)` | `EditBuilder` | chain `.text(s)` / `.image(src,opts?)` / `.video(src,opts?)` then `await` ⇒ `WAMessageKey` |
| `client.delete(key, opts?)` | `Promise<void>` | `DeleteOptions = { forEveryone? }` default `true`; `false` ⇒ delete-for-me |
| `client.react(key, emoji)` | `Promise<WAMessageKey>` | empty string emoji removes reaction |
| `client.forward(key, to)` | `Promise<WAMessageKey>` | looks up message in `store`; throws `MESSAGE_NOT_FOUND` if absent |
| `client.pin(key, opts?)` | `Promise<WAMessageKey>` | pin-in-chat; `PinOptions = { duration?:seconds }` (WA: 86400/604800/2592000; default 24h) |
| `client.unpin(key)` | `Promise<WAMessageKey>` | unpin |
| `client.setDisappearing(jid, seconds)` | `Promise<void>` | set chat-wide disappearing-message timer (0 = off) |

```typescript
const key = await client.send(jid).text('v1')
await client.edit(key).text('v2')
await client.react(key, '🔥')
await client.delete(key, { forEveryone: true })
await client.forward(key, otherJid)
```

---

## Commands

Enable by passing `commandPrefix`. Register handlers; dispatcher attaches once socket is connected and ≥1 command exists.

```typescript
const client = new Client({ commandPrefix: ['.', '/'] })
client.use(async (ctx, next) => { if (await ctx.citation.banned()) return; await next() })
client.command('menu | help', async (ctx) => { await ctx.reply('…') })   // '|' = aliases
client.command('add user', async (ctx) => { /* multi-word path */ })
```

- `client.command(spec, handler): this` — spec is space-separated path; `|` separates aliases; lowercased; duplicate ⇒ `ZaileysCommandError('DUPLICATE_COMMAND')`.
- `client.use(middleware): this` — `(ctx, next) => …`.
- `CommandContext extends MessageContext` adds: `raw`, `command`, `args: string[]`, `flags: Record<string,string|boolean>`, `json: unknown`, `reply(content,opts?)`, `react(emoji)`, `edit(content)` (edits the last `ctx.reply`; throws `NO_SENT_MESSAGE` if none).
- `CommandHandler = (ctx) => void|Promise<void>`. `Middleware = (ctx, next) => void|Promise<void>`.

---

## Domain namespaces

### `client.group` (GroupModule)

| method | signature | returns |
|---|---|---|
| `create(subject, participants)` | `(string, string[])` | `GroupMetadata` |
| `addMember(groupId, jids)` / `removeMember` / `promote` / `demote` | `(string, string[])` | `ParticipantUpdateResult[]` (`{jid,status}`) |
| `updateSubject(groupId, subject)` | | `void` |
| `updateDescription(groupId, description?)` | | `void` |
| `leave(groupId)` | | `void` |
| `metadata(groupId)` | | `GroupMetadata` |
| `tagMember(groupId, jid, label)` | | `void` |
| `inviteCode(groupId)` / `revokeInvite(groupId)` | | `string` |
| `acceptInvite(code)` | | `string` (group jid) |
| `toggleEphemeral(groupId, seconds)` | | `void` |
| `setting(groupId, 'announcement'\|'not_announcement'\|'locked'\|'unlocked')` | | `void` |
| `list()` | | `GroupMetadata[]` (all participating) |
| `inviteInfo(code)` | | `GroupMetadata` |
| `joinRequests(groupId)` | | `Array<Record<string,string>>` (pending) |
| `approveJoin(groupId, jids)` / `rejectJoin(groupId, jids)` | `(string, string[])` | `ParticipantUpdateResult[]` |
| `joinApproval(groupId, enabled)` | `(string, boolean)` | `void` (approval mode on/off) |
| `memberAddMode(groupId, adminsOnly)` | `(string, boolean)` | `void` (admin_add vs all_member_add) |

### `client.profile` (ProfileModule)

| method | signature |
|---|---|
| `setName(name)` / `setStatus(status)` | `(string)` → `void` |
| `setPicture(jid, image)` | `(string, WAMediaUpload)` → `void` (jid = self or group) |
| `removePicture(jid)` | `(string)` → `void` |
| `getPicture(jid, hd?)` | `(string, boolean=false)` → `Promise<string \| null>` (URL) |
| `getStatus(jid)` | `(string)` → `Promise<unknown>` |

### `client.chat` (ChatModule)

| method | signature |
|---|---|
| `archive(jid)` / `unarchive(jid)` | `(string)` → `void` |
| `pin(jid)` / `unpin(jid)` | `(string)` → `void` (chat pin, not message pin) |
| `mute(jid, durationMs?)` | `(string, number?)` → `void` (omit = indefinite) |
| `unmute(jid)` | `(string)` → `void` |
| `markRead(jid)` / `markUnread(jid)` | `(string)` → `void` |
| `star(key, starred?)` / `unstar(key)` | `(WAMessageKey, boolean=true)` → `void` |
| `delete(jid)` / `clear(jid)` | `(string)` → `void` |

### `client.contact` (ContactModule)

| method | signature |
|---|---|
| `check(...numbers)` | `(...string)` → `Promise<{ jid, exists, lid? }[]>` (onWhatsApp) |
| `exists(number)` | `(string)` → `Promise<boolean>` |
| `save(jid, { firstName?, lastName?, fullName? })` | → `void` |
| `remove(jid)` | `(string)` → `void` |

### `client.business` (BusinessModule)

| method | signature |
|---|---|
| `profile(jid)` | `(string)` → `Promise<unknown>` |
| `catalog({ jid?, limit?, cursor? })` | → `Promise<unknown>` |
| `collections(jid?, limit?)` | → `Promise<unknown>` |
| `orderDetails(orderId, tokenBase64)` | → `Promise<unknown>` |
| `createProduct(create)` / `updateProduct(productId, update)` | `(Record<string,unknown>)` → `Promise<unknown>` |
| `deleteProduct(...productIds)` | `(...string)` → `Promise<{ deleted: number }>` |

### `client.privacy` (PrivacyModule)

| method | signature |
|---|---|
| `set(config)` | `PrivacyConfig & { readReceipts?: WAReadReceiptsValue \| boolean }` → `void`. `PrivacyConfig = { lastSeen?, online?, profile?, status?, readReceipts?, groupAdd? }` (baileys WAPrivacy* values; `readReceipts` boolean maps true→'all', false→'none') |
| `get()` | `Promise<PrivacySettings>` (`{[key]:string}`) |
| `block(jid)` / `unblock(jid)` | `void` |
| `blocklist()` | `Promise<string[]>` |
| `disappearingMode(seconds)` | `void` |

### `client.newsletter` (NewsletterModule)

| method | signature | returns |
|---|---|---|
| `create(name, opts?)` | `opts: { description?, picture?: Buffer }` | `NewsletterMetadata` |
| `follow(jid)` / `unfollow(jid)` | | `void` |
| `metadata(jid)` | | `NewsletterMetadata` |
| `updateName(jid, name)` / `updateDescription(jid, description)` | | `void` |
| `updatePicture(jid, picture: Buffer)` | | `void` |
| `mute(jid)` / `unmute(jid)` | | `void` |
| `delete(jid)` | | `void` |
| `removePicture(jid)` | | `void` |
| `react(jid, serverId, emoji)` / `unreact(jid, serverId)` | | `void` |
| `subscribers(jid)` | | `Promise<unknown>` |
| `messages(jid, count=50, { since?, after? })` | | `Promise<unknown>` |
| `adminCount(jid)` | | `Promise<number>` |
| `changeOwner(jid, newOwnerJid)` / `demote(jid, userJid)` | | `void` |

### `client.community` (CommunityModule)

| method | signature | returns |
|---|---|---|
| `create(subject, body)` | | `GroupMetadata` |
| `createGroup(subject, participants, communityId)` | | `GroupMetadata` |
| `linkGroup(communityId, groupId)` / `unlinkGroup(communityId, groupId)` | | `void` |
| `subGroups(communityId)` | | `LinkedGroup[]` (`{id?,subject,creation?,owner?,size?}`) |
| `leave(communityId)` | | `void` |
| `updateSubject(communityId, subject)` / `updateDescription(communityId, description?)` | | `void` |
| `inviteCode` / `revokeInvite` / `acceptInvite(code)` | | `string \| undefined` |
| `metadata(communityId)` | | `GroupMetadata` |
| `list()` | | `GroupMetadata[]` (all participating) |
| `inviteInfo(code)` | | `GroupMetadata` |
| `toggleEphemeral(communityId, seconds)` | | `void` |
| `setting(communityId, 'announcement'\|'not_announcement')` | | `void` |
| `memberAddMode(communityId, adminsOnly)` / `joinApproval(communityId, enabled)` | `(string, boolean)` | `void` |

### `client.presence` (PresenceModule)

| method | signature | note |
|---|---|---|
| `online()` / `offline()` | `()` | global available/unavailable |
| `typing(jid, ms?)` | | composing; auto-clears to paused after `ms` |
| `recording(jid, ms?)` | | recording; auto-clears after `ms` |

---

## Automation

### Broadcast — `client.broadcast(jids, build, options?)`

```typescript
const res = await client.broadcast(
  ['628a@s.whatsapp.net', '628b@s.whatsapp.net'],
  (b) => b.text('promo'),
  { rateLimitPerSec: 5, retry: { maxRetries: 2, backoffMs: (a) => a * 1000 }, onProgress: (done, total, jid, ok) => {} },
)
// res: { sent: string[], failed: { jid, error }[] }
```

- `build: (b: MessageBuilder<'init'>) => MessageBuilder<'content-set'>` — do NOT await inside; return the chained builder.
- `BroadcastOptions = { rateLimitPerSec? (default 5), retry?: RetryPolicy, onProgress? }`. `RetryPolicy = { maxRetries, backoffMs:(attempt)=>number }`.
- Requires connected socket.

### Schedule — `client.scheduleAt(date, build)`

```typescript
const h = await client.scheduleAt(new Date(Date.now() + 60000), (b) => b.text('later'))
h.cancel()
```

- Returns `ScheduleHandle = { id: string, cancel(): void }`.
- Build is evaluated immediately to a content snapshot (sent later via raw socket; rich/interactive relay content NOT supported through scheduler — uses `socket.sendMessage`).
- Persisted if the store implements `saveScheduledJob`/`listScheduledJobs`/`deleteScheduledJob`; pending jobs reloaded on connect. Invalid date / no content ⇒ `ZaileysAutomationError('SCHEDULE_INVALID')`.

---

## Storage adapters

Construct and pass via `auth` and/or `store`. Optional peer deps must be installed.

### Auth (`AuthStoreBundle`)

| class | ctor options | peer dep |
|---|---|---|
| `MemoryAuthStore` | `()` | — |
| `FileAuthStore` | `{ basePath?: string }` (default `./.zaileys/auth`) | — (default) |
| `SqliteAuthStore` | `{ database: string \| Buffer, readonly? }` | `better-sqlite3` |
| `PostgresAuthStore` | `{ pool?: Pool, connectionString?, max? }` | `pg` |
| `RedisAuthStore` | `{ client?: RedisClientType, url?, namespace? }` (default ns `'zaileys'`) | `redis` |
| `ConvexAuthStore` | `ConvexKvOptions = { client?, url?, namespace? }` (pass client XOR url) | `convex` |

### Message store (`MessageStore`)

| class | ctor options | peer dep |
|---|---|---|
| `MemoryMessageStore` | `()` | — (default) |
| `SqliteMessageStore` | `{ database: string \| Buffer, readonly? }` | `better-sqlite3` |
| `PostgresMessageStore` | `{ pool?, connectionString?, max? }` | `pg` |
| `RedisMessageStore` | `{ client?, url?, namespace? }` | `redis` |
| `ConvexMessageStore` | `ConvexKvOptions { client?, url?, namespace? }` | `convex` |

`MessageStore` interface: `saveMessage`, `getMessage(key)→WAMessage|undefined`, `listMessages(jid,opts?)`, `saveChat`/`getChat`/`listChats`, `saveContact`/`getContact`/`listContacts`, `savePresence`/`getPresence`, `bind(socket)`, `clear()`, `close()`, optional scheduler trio. Redis/Convex throw `ZaileysStoreError('STORE_CONNECTION_FAILED')` if both `client` and `url` (or neither) are given.

```typescript
import { Client, SqliteAuthStore, SqliteMessageStore } from 'zaileys'
const client = new Client({
  auth: new SqliteAuthStore({ database: './auth.db' }),
  store: new SqliteMessageStore({ database: './msgs.db' }),
})
```

---

## Media — `new Media(input)`

Standalone media processing (FFmpeg-backed). `input: MediaInput` (path/URL/Buffer). Namespaced getters:

| namespace | methods |
|---|---|
| `.audio` | `toOpus()`, `toMp3()`, `convert(type='opus')`, `waveform()` |
| `.video` | `toMp4()`, `thumbnail()` |
| `.image` | `toJpeg()`, `thumbnail()`, `resize(width, height)` |
| `.sticker` | `create(metadata?: StickerMetadataType)` |
| `.document` | `create()` |
| `.thumbnail` | `get()` — auto image/video detection |
| (instance) | `toBuffer(): Promise<Buffer>` |

```typescript
import { Media } from 'zaileys'
const opus = await new Media('./voice.mp3').audio.toOpus()
await client.send(jid).audio(opus, { ptt: true })
```

---

## Error classes

All extend `Error`, carry `.code` and optional `.cause`.

| class | codes |
|---|---|
| `ZaileysBuilderError` | `MEDIA_LOAD_FAILED`, `INVALID_RECIPIENT`, `USERNAME_NOT_FOUND`, `EMPTY_CONTENT`, `INVALID_OPTIONS`, `SEND_FAILED`, `MESSAGE_NOT_FOUND` |
| `ZaileysCommandError` | `DUPLICATE_COMMAND`, `INVALID_COMMAND_NAME`, `HANDLER_ERROR`, `MIDDLEWARE_ERROR`, `NO_SENT_MESSAGE`, `NOT_CONNECTED` |
| `ZaileysDomainError` | `NOT_CONNECTED`, `GROUP_NOT_FOUND`, `NEWSLETTER_NOT_FOUND`, `INVALID_PARTICIPANT`, `OPERATION_FAILED` |
| `ZaileysAutomationError` | `NOT_CONNECTED`, `RATE_LIMIT_INVALID`, `TASK_FAILED`, `SCHEDULE_INVALID`, `STORE_UNAVAILABLE`, `PRESENCE_FAILED` |
| `ZaileysStoreError` | `STORE_NOT_AVAILABLE`, `STORE_CONNECTION_FAILED`, `STORE_WRITE_FAILED`, `STORE_READ_FAILED`, `STORE_CORRUPTED`, `STORE_CLOSED` |

## Diagnostics

- **`connect()` rejects immediately → Cause:** `authType:'pairing'` without `phoneNumber`. **Fix:** pass `phoneNumber` (digits, no `+`).
- **Send throws `INVALID_OPTIONS "client not connected"` → Cause:** sending before `open`. **Fix:** `await client.connect()` or send inside an event handler / after `connect` event.
- **Interactive `SEND_FAILED "does not support relayMessage"` → Cause:** socket mock/version lacks `relayMessage`. **Fix:** use real baileys socket; interactive requires relay.
- **`forward` throws `MESSAGE_NOT_FOUND` → Cause:** message not in `store`. **Fix:** ensure a persistent/memory store retained the message (default `MemoryMessageStore` keeps in-session).
- **No commands firing → Cause:** `commandPrefix` unset/empty. **Fix:** set `commandPrefix`; messages must start with a prefix.
