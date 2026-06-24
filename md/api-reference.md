# API Reference

> Source: https://zeative.github.io/zaileys/api-reference

# API Reference

A grouped, quick-lookup index of every public export from the `zaileys` package. Everything below is re-exported from the package root, so a single import works for any symbol:

```typescript
```

This page is a terse exports index. For full prose, options tables, and end-to-end examples follow the deep-links to the relevant guide page on each entry.

## Client

The main entry point. See [Client & Lifecycle](/client) and [Configuration](/configuration).

```typescript

const client = new Client({
  sessionId: 'main',
  auth: new MemoryAuthStore(),
  store: new MemoryMessageStore(),
  authType: 'qr',
  qrTerminal: true,
})

client.on('connect', ({ me }) => console.log('connected as', me.id))
client.on('text', (ctx) => {
  if (ctx.text === 'ping') ctx.reply('pong')
})
```

| Member | Signature | Description |
| --- | --- | --- |
| `new Client(opts?)` | `(options?: ClientOptions)` | Construct a client; auto-connects unless `autoConnect: false`. |
| `connect()` | `(): Promise<void>` | Open the WhatsApp connection (QR or pairing). |
| `disconnect()` | `(): Promise<void>` | Close the socket without clearing auth. |
| `logout()` | `(): Promise<void>` | Log out and clear stored credentials. |
| `get state` | `ConnectionState` | Current state (`idle` \| `connecting` \| `connected` \| `disconnected`). |
| `get socket` | `BaileysSocket \| undefined` | Underlying socket (escape hatch). |
| `send(to)` | `(to: string): MessageBuilder<'init'>` | Start a fluent message builder for a JID. See [Sending Messages](/sending-messages). |
| `edit(key)` | `(key: WAMessageKey): EditBuilder` | Edit a previously sent message. |
| `delete(key, opts?)` | `(key, opts?: DeleteOptions): Promise<void>` | Delete a message. |
| `react(key, emoji)` | `(key, emoji: string): Promise<WAMessageKey>` | React to a message. |
| `forward(key, to)` | `(key, to: string): Promise<WAMessageKey>` | Forward a message to a JID. |
| `pin(key, opts?)` | `(key, opts?: { duration?: number }): Promise<WAMessageKey>` | Pin a message (`duration` seconds; defaults 86400). |
| `unpin(key)` | `(key): Promise<WAMessageKey>` | Unpin a message. |
| `setDisappearing(jid, seconds)` | `(jid: string, seconds: number): Promise<void>` | Set the chat's disappearing-message timer. |
| `lidToPn(lid)` | `(lid: string): Promise<string \| null>` | Resolve a `@lid` JID to its phone-number JID (`null` if unknown). Needs a connected socket. |
| `pnToLid(pn)` | `(pn: string): Promise<string \| null>` | Resolve a phone-number JID to its `@lid` JID (`null` if unknown). Needs a connected socket. |
| `broadcast(jids, build, opts?)` | `(jids: string[], build, opts?): Promise<BroadcastResult>` | Send to many recipients. See [Broadcast & Schedule](/automation). |
| `scheduleAt(date, build, opts?)` | `(date: Date, build, opts?): Promise<ScheduleHandle>` | Schedule a message for later. |
| `command(spec, handler)` | `(spec: string, handler: CommandHandler): this` | Register a command. See [Commands](/commands). |
| `use(middleware)` | `(middleware: Middleware): this` | Add command middleware. |
| `get group` | `GroupModule` | Group management. |
| `get privacy` | `PrivacyModule` | Privacy & blocking. |
| `get newsletter` | `NewsletterModule` | Newsletter/channel management. |
| `get community` | `CommunityModule` | Community management. |
| `get profile` | `ProfileModule` | Own profile name/status/picture. |
| `get chat` | `ChatModule` | Chat archive/pin/mute/read/star/delete. |
| `get contact` | `ContactModule` | Contact check/exists/save/remove. |
| `get business` | `BusinessModule` | Business profile & catalog/products. |
| `get presence` | `PresenceModule` | Presence updates. |
| `on/once/off/emit` | inherited from `TypedEventEmitter` | Typed event subscription. See [Events](/events). |

Related client exports: `TypedEventEmitter`, `TypedEventEmitterOptions`.

## Configuration Types

Types backing the `Client` constructor. See [Configuration](/configuration).

| Export | Kind | Description |
| --- | --- | --- |
| `ClientOptions` | interface | All constructor options (`sessionId`, `auth`, `store`, `authType`, `phoneNumber`, `logger`, `cacheSignal`, `reconnect`, `qrTerminal`, `baileys`, `autoConnect`, `statusLog`, `commandPrefix`, `citation`, `ignoreMe`). |
| `ConnectionState` | type | `idle \| connecting \| connected \| disconnected` (and reconnecting states). |
| `ConnectionAuthType` | type | `'qr' \| 'pairing'`. |
| `ReconnectOptions` | interface | Reconnect backoff configuration. |
| `Logger` | interface | Pluggable logger contract. |
| `ClientEventMap` / `ClientEventName` | type | Full event map (connection + inbound). |
| `ConnectionEventMap` / `ConnectionEventName` / `ConnectionEventHandler` | type | Connection-only event types. |
| `BaileysSocket` | type | Alias for the underlying `WASocket`. |

## Auth Stores

Credential persistence. Pass an instance to `Client`'s `auth` option. See [Storage Adapters](/storage).

```typescript

const client = new Client({
  sessionId: 'main',
  auth: new SqliteAuthStore({ path: './session.db' }),
})
```

| Export | Kind | Description |
| --- | --- | --- |
| `MemoryAuthStore` | class | In-memory creds (non-persistent). |
| `FileAuthStore` | class | File-based store. Options: `FileAuthStoreOptions`. |
| `SqliteAuthStore` | class | SQLite-backed. Options: `SqliteAuthStoreOptions`. |
| `PostgresAuthStore` | class | Postgres-backed. Options: `PostgresAuthStoreOptions`. |
| `RedisAuthStore` | class | Redis-backed. Options: `RedisAuthStoreOptions`. |
| `ConvexAuthStore` | class | Convex-backed. Options: `ConvexAuthStoreOptions`. |
| `makeCacheableAuthStore(...)` | function | Wrap a store with an in-memory cache. Options: `CacheableAuthStoreOptions`. |
| `AuthStoreBundle` | interface | `{ creds: AuthCredsStore; signal: AuthStore }` — the contract all adapters implement. |
| `AuthStore` / `AuthCredsStore` | interface | Signal-key and credential sub-stores. |
| `AuthStoreKey` / `AuthStoreValue` | type | Signal data key/value types. |

## Message Stores

Chat/message/contact/presence persistence. Pass to `Client`'s `store` option. See [Storage Adapters](/storage).

| Export | Kind | Description |
| --- | --- | --- |
| `MemoryMessageStore` | class | In-memory message store. |
| `SqliteMessageStore` | class | SQLite-backed. Options: `SqliteMessageStoreOptions`. |
| `PostgresMessageStore` | class | Postgres-backed. Options: `PostgresMessageStoreOptions`. |
| `RedisMessageStore` | class | Redis-backed. Options: `RedisMessageStoreOptions`. |
| `ConvexMessageStore` | class | Convex-backed. Options: `ConvexMessageStoreOptions`. |
| `MessageStore` | interface | Store contract: `saveMessage`, `getMessage`, `listMessages`, `saveChat`, `getChat`, `listChats`, `saveContact`, `getContact`, `listContacts`, `savePresence`, `getPresence`, `bind`, `clear`, `close`, optional `saveScheduledJob`/`listScheduledJobs`/`deleteScheduledJob`. |
| `MessageStoreListOptions` | type | Pagination/filter options for `listMessages`. |
| `ScheduledJobRecord` | type | Persisted scheduled-job row. |
| `BaileysSocketLike` | interface | Minimal socket shape consumed by `MessageStore.bind`. |

## Builder (Sending Messages)

Fluent message construction. See [Sending Messages](/sending-messages), [Interactive Messages](/interactive), [Rich Responses](/rich-responses).

```typescript
client
  .send('628xxx@s.whatsapp.net')
  .text('Hello *world*')
  .reply(msg.message().key)
```

### `MessageBuilder<State>`

| Method | Signature | Description |
| --- | --- | --- |
| `to(recipient)` | `(recipient: string): MessageBuilder<'init'>` | Set recipient JID. |
| `text(content, opts?)` | `(content: string, opts?: TextOptions): MessageBuilder<'content-set'>` | Text message (`opts.rich` enables AIRich). |
| `image(src, opts?)` | `(src: MediaSource, opts?: ImageOptions)` | Image. |
| `video(src, opts?)` | `(src: MediaSource, opts?: VideoOptions)` | Video. |
| `videoNote(src, opts?)` | `(src: MediaSource, opts?: VideoNoteOptions)` | Round video note (PTV). |
| `audio(src, opts?)` | `(src: MediaSource, opts?: AudioOptions)` | Audio / voice note. |
| `document(src, opts)` | `(src: MediaSource, opts: DocumentOptions)` | Document. |
| `sticker(src, opts?)` | `(src: MediaSource, opts?: StickerOptions)` | Sticker. |
| `buttons(...)` | interactive button message | See [Interactive](/interactive). |
| `carousel(...)` | carousel/cards | See [Interactive](/interactive). |
| `list(opts)` | `(opts: ListOptions)` | List message. |
| `poll(...)` | poll message (`PollOptions`) | See [Interactive](/interactive). |
| `location(...)` | location (`LocationOptions`) | Share location. |
| `contact(vcard)` | `(vcard: string)` | Share a contact. |
| `template(opts)` | `(opts: TemplateOptions)` | Template message. |
| `event(opts)` | `(opts: EventOptions)` | Event message (`name`, `startAt`, optional `endAt`/`location`/`call`/`canceled`). |
| `groupInvite(opts)` | `(opts: GroupInviteOptions)` | Group-invite card (`jid`, `code`, optional `subject`/`caption`/`expiresAt`/`thumbnail`). |
| `product(opts)` | `(opts: ProductOptions)` | Business product card (`image`, `title`, `businessOwnerId`, optional `price`/`currency`/`productId`/etc.). |
| `requestPhoneNumber()` | `()` | Ask the recipient to share their phone number. |
| `sharePhoneNumber()` | `()` | Share your own phone number. |
| `limitSharing(enabled?)` | `(enabled?: boolean)` | Toggle advanced chat-privacy (limit sharing); defaults `true`. |
| `album(items)` | `(items: AlbumItem[])` | Media album. |
| `reply(quoted)` | `(quoted: WAMessage \| WAMessageKey)` | Quote a message. |
| `mentions(jids)` | `(jids: string[])` | Mention specific JIDs. |
| `mentionAll()` | `()` | Mention all group members. |
| `disappearing(seconds)` | `(seconds: number)` | Set disappearing timer. |
| `then(...)` | thenable | Awaiting the builder sends the message and resolves to a `WAMessageKey`. |
| `sendMessage(...)` | low-level send | Internal/escape-hatch send. |

### `EditBuilder`

| Method | Signature | Description |
| --- | --- | --- |
| `text(content)` | `(content: string): this` | Replace text. |
| `image(src, opts?)` | `(src: MediaSource, opts?: ImageOptions): this` | Replace with image. |
| `video(src, opts?)` | `(src: MediaSource, opts?: VideoOptions): this` | Replace with video. |

### Builder mutations & helpers

| Export | Kind | Description |
| --- | --- | --- |
| `deleteMessage(...)` | function | Delete a message. Options: `DeleteOptions`. |
| `reactToMessage(...)` | function | React to a message. |
| `forwardMessage(...)` | function | Forward a message. |
| `isJid(value)` | function | `(value: string): boolean` — JID-format check. |
| `resolveUsername(...)` | function | Resolve a username to a JID. Socket: `UsernameResolveSocketLike`. |
| `BuilderSocketLike` / `TextOptions` | type | Builder socket shape + text options. |

### Builder types

`BuilderState`, `BuilderContext`, `MediaSource`, `ImageOptions`, `VideoOptions`, `VideoNoteOptions`, `AudioOptions`, `DocumentOptions`, `StickerOptions`, `AlbumItem`, `ListOptions`, `ListSection`, `PollOptions`, `LocationOptions`, `TemplateOptions`, `EventOptions`, `GroupInviteOptions`, `ProductOptions`, `ButtonDef`, `InteractiveButton` (`ReplyButton`, `UrlButton`, `CopyButton`, `CallButton`, `ReminderButton`, `CancelReminderButton`, `LocationRequestButton`, `AddressButton`), `BottomSheetOptions`, `LimitedTimeOfferOptions`.

## Events

Inbound event payloads and helpers. See [Events](/events).

```typescript
client.on('message', (ctx) => console.log(ctx.chatType, ctx.text, ctx.senderId))
client.on('text', (ctx) => console.log(ctx.text, ctx.senderId))
client.on('call-incoming', (call) => console.log(call))
```

The `message` event is an umbrella that fires **once for any inbound message** regardless of type, delivering the same `MessageContext` as the typed events (`text`, `image`, …). Use it as a single catch-all entry point.

`MessageContext` notes:
- `uniqueId` — 16-char uppercase hex, stable per message (`remoteJid|id|fromMe`).
- `staticId` — 16-char uppercase hex, stable per room + sender (same value for every message from one sender in one room).
- `mentions` — resolved to PN (LID mentions mapped back to phone-number JIDs).
- `senderDevice` — detected (`android` \| `ios` \| `web` \| `desktop` \| `unknown`).
- Content-derived flags: `isEdited`, `isDeleted`, `isPinned`, `isUnPinned`, `isBot`, `isStatusMention`, `isGroupStatusMention`, `isStory`, `isHideTags`.
- `chatType` values include `album`, `group-invite`, `product`, `order`, `payment` (plus `text`/`image`/`video`/`audio`/`document`/`sticker`/`poll`/`contact`/`location`/`live-location`/`event`/`buttons`/`list`/`interactive`/`template`/`unknown`).

| Export | Kind | Description |
| --- | --- | --- |
| `buildMessageContext(...)` | function | Build the rich `MessageContext` from a raw message. |
| `dropSpoofedSelfOnly(upsert)` | function | Guard that drops spoofed self-only protocol messages. |
| `SELF_ONLY_PROTOCOL_TYPES` | const | Frozen list of self-only protocol types. |
| `MessageContext` | type | The rich, lazy message object passed to handlers. |
| `ChatType` / `SenderInfo` / `SenderDevice` | type | Sender/chat metadata. |
| Payload types | type | `ButtonClickPayload`, `CallPayload`/`CallBase`, `DeletePayload`, `EditPayload`, `GroupJoinPayload`, `GroupLeavePayload`, `GroupUpdatePayload`, `GroupParticipantInfo`, `HistorySyncPayload`, `LimitedPayload`, `ListSelectPayload`, `MemberTagPayload`, `NewsletterPayload`, `PollVotePayload`, `PresencePayload`, `ReactionPayload`, `QuotedRef`. |
| Media context | type | `ContextMedia`, `MediaDescriptor`, `MediaDownloadResult`, `MediaKind`. |
| `ctx.media` variants | interface | `MediaAttachment`, `PollMedia`, `ContactMedia`, `LocationMedia`, `EventMedia`, `AlbumMedia`, `GroupInviteMedia`, `ProductMedia`, `OrderMedia`, `PaymentMedia`, `LinkPreviewMedia`, `ButtonsMedia`, `ListMedia`, `InteractiveMedia`, `TemplateMedia` (see below). |
| Mentions | type | `MentionContext`, `MentionAllContext`. |
| Event maps | type | `InboundEventMap`, `InboundEventName`. |
| Citations | type | `CitationConfig`, `CitationPredicates`. |
| Misc | type | `BuildContextInput`, `UpsertPayload`, `SelfOnlyProtocolType`. |

### `ctx.media` variants

`ctx.media` is a discriminated union keyed on `type`. New variants added in v4.4 (all fields nullable unless noted):

| Variant (`type`) | Fields |
| --- | --- |
| `album` | `expectedImageCount`, `expectedVideoCount`. |
| `group-invite` | `groupId`, `groupName`, `inviteCode`, `caption`, `expiresAt`. |
| `product` | `productId`, `title`, `description`, `price`, `currency`, `retailerId`, `url`, `businessOwnerId`. |
| `order` | `orderId`, `title`, `itemCount`, `total`, `currency`, `status`, `message`. |
| `payment` | `kind` (`'request' \| 'send' \| 'invite'`), `amount`, `currency`, `note`, `expiresAt`. |
| `link` | `url`, `title`, `description`. |

## Commands

Prefix-based command routing. See [Commands](/commands).

```typescript
client.command('ping', async (ctx) => ctx.reply('pong'))
client.use(async (ctx, next) => { console.log(ctx.command); await next() })
```

| Export | Kind | Description |
| --- | --- | --- |
| `parseCommand(text, prefixes)` | function | Parse text into `ParsedArgs`. |
| `CommandRegistry` | class | Holds command definitions: `register`, `resolve`, `list`. |
| `runMiddleware(...)` | function | Run a middleware chain. |
| `attachCommandDispatcher(...)` | function | Wire the dispatcher to a client. |
| `CommandContext` | interface | Extends `MessageContext` with `command`, `args`, `flags`, `json`, `reply`, `react`, `edit`. |
| `CommandHandler` / `Middleware` | type | Handler and middleware function shapes. |
| `CommandDefinition` / `ParsedArgs` / `CommandPrefix` | type | Definition, parsed args, and prefix types. |
| `DispatcherDeps` / `DispatcherHandle` / `ResolvedCommand` | type | Dispatcher internals. |

## Automation

Rate limiting, queues, broadcast, scheduling, presence. See [Broadcast & Schedule](/automation).

| Export | Kind | Description |
| --- | --- | --- |
| `RateLimiter` | class | Token-bucket limiter. Method: `acquire(jid?)`. Options: `RateLimiterOptions`, `RateLimiterClock`. |
| `TaskQueue` | class | Concurrency-limited queue. Methods: `add(task)`, `onIdle()`. Options: `TaskQueueOptions`, `TaskQueueClock`. |
| `runBroadcast(...)` | function | Fan-out send. Options: `BroadcastOptions`, `BroadcastResult`, `BroadcastDeps`. |
| `Scheduler` | class | Persistent scheduler. Methods: `scheduleAt(...)`, `loadPending()`, `dispose()`. Deps/types: `SchedulerDeps`, `SchedulerTimer`, `ScheduleHandle`, `ScheduledContentSnapshot`. |
| `PresenceModule` | class | Methods: `online()`, `offline()`, `typing(jid, ms?)`, `recording(jid, ms?)`. Types: `AutomationSocketLike`, `WAPresence`. Full guide: [Presence](/presence). |
| `RetryPolicy` / `ScheduledJob` / `ScheduledJobRecord` | type | Retry config and scheduled-job shapes. |

## Domain Modules

Accessed via `client.group`, `client.privacy`, `client.newsletter`, `client.community`, `client.profile`, `client.chat`, `client.contact`, `client.business`. Full guides: [Groups](/groups) · [Communities](/community) · [Newsletters](/newsletter) · [Privacy & Blocking](/privacy). See also [Client & Lifecycle](/client).

```typescript
const meta = await client.group.metadata('xxx@g.us')
await client.group.addMember('xxx@g.us', ['628xxx@s.whatsapp.net'])
```

### `GroupModule`
`create`, `addMember`, `removeMember`, `promote`, `demote`, `updateSubject`, `updateDescription`, `leave`, `metadata`, `tagMember`, `inviteCode`, `revokeInvite`, `acceptInvite`, `toggleEphemeral`, `setting`, `list`, `inviteInfo`, `joinRequests`, `approveJoin`, `rejectJoin`, `joinApproval`, `memberAddMode`.

### `PrivacyModule`
`set`, `get`, `block`, `unblock`, `blocklist`, `disappearingMode`.

### `NewsletterModule`
`create`, `follow`, `unfollow`, `metadata`, `updateName`, `updateDescription`, `updatePicture`, `mute`, `unmute`, `delete`, `removePicture`, `react`, `unreact`, `subscribers`, `messages`, `adminCount`, `changeOwner`, `demote`.

### `CommunityModule`
`create`, `createGroup`, `linkGroup`, `unlinkGroup`, `subGroups`, `leave`, `updateSubject`, `updateDescription`, `inviteCode`, `revokeInvite`, `acceptInvite`, `metadata`, `list`, `inviteInfo`, `toggleEphemeral`, `setting`, `memberAddMode`, `joinApproval`.

### `ProfileModule`
`setName`, `setStatus`, `setPicture`, `removePicture`, `getPicture`, `getStatus`.

### `ChatModule`
`archive`, `unarchive`, `pin`, `unpin`, `mute`, `unmute`, `markRead`, `markUnread`, `star`, `unstar`, `delete`, `clear`.

### `ContactModule`
`check`, `exists`, `save`, `remove`. Type: `ContactCheckResult`.

### `BusinessModule`
`profile`, `catalog`, `collections`, `orderDetails`, `createProduct`, `updateProduct`, `deleteProduct`.

Domain types: `ParticipantUpdateResult`, `PrivacyConfig`, `PrivacySettings`, `LinkedGroup`, `DomainSocketLike`.

## Media

FFmpeg/sharp-backed media processing. See [Media](/media).

```typescript

const m = new Media('./input.mp3')
const opus = await m.audio.toOpus()
const thumb = await m.video.thumbnail()
```

| Export | Kind | Description |
| --- | --- | --- |
| `Media` | class | Facade with getters: `audio` (`toOpus`/`toMp3`/`convert`/`waveform`), `video` (`toMp4`/`thumbnail`), `image` (`toJpeg`/`thumbnail`/`resize`), `sticker.create`, `document.create`, `thumbnail.get`. |
| `AudioProcessor` / `VideoProcessor` / `ImageProcessor` / `StickerProcessor` / `DocumentProcessor` | class | Low-level processors. |
| `FFmpegProcessor` / `FileManager` / `BufferConverter` / `MimeValidator` | class | FFmpeg/IO helpers. |
| `initializeFFmpeg(disable?)` / `detectFileType(buffer)` / `generateId()` / `ffmpegTransform(...)` | function | Setup and transform helpers. |
| `FFMPEG_CONSTANTS` | const | Shared MIME/extension constants. |
| `MediaInput` / `FileExtension` / `AudioType` / `StickerShapeType` | type | Input and format types. |
| `FFmpegConfig` / `StickerMetadataType` | interface | Config and sticker metadata. |

## Connection

Lower-level connection primitives (advanced). See [Client & Lifecycle](/client).

| Export | Kind | Description |
| --- | --- | --- |
| `createPairingFlow(opts)` | function | Build a pairing-code flow. Types: `PairingFlow`, `PairingFlowOptions`, `PairingFlowResult`. |
| `createReconnectStrategy(...)` | function | Reconnect backoff strategy. Types: `ReconnectStrategy`, `ReconnectDecision`, `ReconnectStrategyDeps`. |
| `createConnectionStateMachine(initial?)` | function | State machine. Types: `ConnectionStateMachine`, `StateTransitionListener`. |
| `signalKeyStoreFromAuthStore(store, logger?)` | function | Adapt an `AuthStore` into a Baileys signal key store. |
| `renderQrInTerminal(qrString)` | function | Render a QR string in the terminal. |
| `mapDisconnectReason(code)` / `isFatalDisconnect(r)` / `shouldClearAuth(r)` / `shouldReconnect(r)` | function | Disconnect-reason classifiers. Type: `DisconnectReasonDomain`. |
| `normalizePhoneNumber(raw)` / `validateE164(raw)` | function | Phone-number helpers. |

## Utilities

| Export | Kind | Description |
| --- | --- | --- |
| `createLogger(options?)` | function | Build a Pino-based logger. Options: `CreateLoggerOptions`. |
| `adoptLogger(maybe, fallback?)` | function | Normalize a partial logger into a full `Logger`. |
| `chunk(arr, size)` | function | Split an array into fixed-size chunks. |
| `isJid(value)` / `isLidJid(jid)` / `isPnJid(jid)` | function | JID predicates: any WhatsApp JID / `@lid` / phone (`@s.whatsapp.net`,`@c.us`). |
| `normalizeJid(jid)` | function | Strip device suffix and canonicalize a JID (`null` for invalid). |
| `jidToPhone(jid)` / `phoneToJid(phone)` | function | Convert a phone JID to digits / build a user JID from a phone. |
| `jidDecode(jid)` / `jidEncode(user, server, device?)` | function | Decode a JID to `{ user, server, device? }` / build a JID from parts (re-exported from Baileys). |
| `jidNormalizedUser(jid)` / `areJidsSameUser(a, b)` | function | Normalized user JID (strips device) / same-user check ignoring device/LID. |
| `isJidGroup(jid)` / `isJidBroadcast(jid)` / `isJidNewsletter(jid)` | function | JID predicates: group (`@g.us`) / broadcast / newsletter (`@newsletter`). |
| `isLidUser(jid)` / `isPnUser(jid)` | function | `@lid` user / phone-number user (`@s.whatsapp.net`) predicates. |
| `getDevice(jid)` | function | Device kind decoded from a JID (re-exported from Baileys). |
| `computeUniqueId(key)` / `computeStaticId(roomId, senderId)` | function | 16-char UPPERCASE hex hashers — the context's `uniqueId` / `staticId`. |
| `extractLinks(text)` | function | Extract `http(s)` URLs from a string. |
| `senderDeviceOf(jid)` | function | Decode device from a JID: `'android' \| 'ios' \| 'web' \| 'desktop' \| 'unknown'`. |
| `epochSecondsToMs(value)` | function | Epoch seconds → ms; accepts `number \| string \| bigint \| Long`. |
| `loadMedia(src, opts?)` / `detectMimeFromBuffer(buffer)` | function | Resolve a media source to `{ buffer, mime, size }` / sniff a buffer's MIME. Types: `LoadedMedia`, `LoadMediaOptions`. |
| `ZaileysLogger` / `LoggerLevel` | type | Logger instance and level types. |

See [Utilities](/utilities) for full signatures and examples.

## Errors

Typed error classes per subsystem. Each carries a discriminated `code`. See [Error Handling](/error-handling) for handling patterns.

```typescript

try {
  await client.send(jid).text('hi')
} catch (e) {
  if (e instanceof ZaileysBuilderError) console.error(e.code, e.message)
}
```

| Export | Kind | Description |
| --- | --- | --- |
| `ZaileysBuilderError` | class | Builder/send failures. Code: `BuilderErrorCode`. |
| `ZaileysDomainError` | class | Group/privacy/newsletter/community failures. Code: `DomainErrorCode`. |
| `ZaileysCommandError` | class | Command parsing/dispatch failures. Code: `CommandErrorCode`. |
| `ZaileysAutomationError` | class | Broadcast/schedule/queue failures. Code: `AutomationErrorCode`. |
| `ZaileysStoreError` | class | Store failures. Code: `StoreErrorCode`. |

## Misc Types

| Export | Kind | Description |
| --- | --- | --- |
| `LIDMapping` | interface | Linked-device ID mapping. |
| `LIDMappingUpdatePayload` | type | Payload for LID mapping updates. |

Optional native dependencies (SQLite, Postgres `pg`, Redis, Convex, FFmpeg, sharp) are loaded lazily. Install only the adapter you use — see [Storage Adapters](/storage) and [Media](/media).
