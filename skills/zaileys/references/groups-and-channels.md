# Groups, communities, and channels

## Contents

- Ground rules
- Groups
- Members and admins
- Invites and join requests
- Communities
- Channels (newsletters)
- Group events
- Pacing with operationGuard
- Errors

## Ground rules

- **WhatsApp Web only.** On `provider: 'cloud'`, merely reading `client.group`, `client.community`, or
  `client.newsletter` throws `ZaileysProviderError` `UNSUPPORTED_ON_CLOUD`. Branch on `client.provider`, or run
  a second WhatsApp Web client for group features.
- **Connected first.** Every call throws `ZaileysDomainError` `NOT_CONNECTED` without a socket, including
  during a reconnect. Do startup work in a `connect` handler, which runs again after every reconnect, so look
  things up before creating them.
- **IDs are JIDs.** Groups and communities end in `@g.us`, channels in `@newsletter`, people in
  `@s.whatsapp.net` (or `@lid`). Methods take and return invite *codes*, not `chat.whatsapp.com` URLs.
- **WhatsApp enforces permissions.** zaileys doesn't pre-check admin rights; a refused call rejects with
  WhatsApp's own error (message is the reason, numeric code on `error.data`), not a zaileys error.

## Groups

| Call | Returns / notes |
| --- | --- |
| `group.create(subject, participantJids)` | `GroupMetadata`. Paced 60 s. Check `participants` for who actually got in |
| `group.metadata(groupId)` | `GroupMetadata`: `subject`, `desc`, `owner`, `participants[]` (`id`, `admin: 'admin' \| 'superadmin' \| null`, `phoneNumber`/`lid` when shared), `announce`, `restrict`, `memberAddMode`, `joinApprovalMode`, `ephemeralDuration`, `linkedParent`. A network query each call — cache it yourself in busy bots |
| `group.list()` | Metadata of every group the bot is in; find an ID by `subject` |
| `group.updateSubject(id, subject)` / `updateDescription(id, text?)` | Omitting `text` clears the description |
| `group.setting(id, 'announcement' \| 'not_announcement' \| 'locked' \| 'unlocked')` | Admins-only sending / admins-only info editing |
| `group.memberAddMode(id, adminsOnly)` / `joinApproval(id, enabled)` | Booleans, not strings |
| `group.toggleEphemeral(id, seconds)` | `86400`, `604800`, `7776000`; `0` turns it off |
| `group.leave(id)` | There is no delete: remove members, then leave |
| `client.profile.setPicture(groupId, image)` | Group pictures live on `client.profile`, not `client.group` |

## Members and admins

`addMember`, `removeMember`, `promote`, `demote`, `approveJoin`, and `rejectJoin` all take `(groupId, jids[])`
and resolve one `{ jid, status }` per person instead of rejecting when someone fails. `status` is WhatsApp's
string code:

| `status` | Meaning | Next step |
| --- | --- | --- |
| `'200'` | Done | — |
| `'403'` | The person's privacy settings block being added | Send an invite card; zaileys drops the invite WhatsApp attaches to this result |
| `'408'` | They left the group recently | Invite them instead |
| `'409'` | Already a member | Nothing |
| anything else | WhatsApp refused that person | Log it; don't retry in a loop |

Batch people into one call: the 10 s `group.participants` gap applies per call, so 20 single-person calls take
over three minutes. Participants may be listed by LID or phone JID with device suffixes, so compare with the
exported `sameUser(a, b)` across `id`, `phoneNumber`, and `lid` — never by string equality:

```ts
import { sameUser } from 'zaileys'

async function isAdmin(groupId: string, person: string): Promise<boolean> {
  const { participants } = await client.group.metadata(groupId)
  return participants.some(
    (member) => member.admin != null && [member.id, member.phoneNumber, member.lid].some((id) => id !== undefined && sameUser(id, person)),
  )
}
```

For commands, the `admin: true` guard does this for the sender. To check the bot itself, keep `me.id` and
`me.lid` from the `connect` event. `group.tagMember(groupId, jid, label)` ignores `jid`: WhatsApp only lets a
member label itself, so it always labels the bot.

## Invites and join requests

| Call | Notes |
| --- | --- |
| `group.inviteCode(id)` / `revokeInvite(id)` | Admin only. Resolve the code; throw `OPERATION_FAILED` (`invite code unavailable`) when WhatsApp returns none. Revoking invalidates old links and old invite cards |
| `group.inviteInfo(code)` | Preview metadata without joining; no admin needed |
| `group.acceptInvite(code)` | Resolves the group JID or throws `OPERATION_FAILED`. Paced 30 s. With join approval on, it only files a request |
| `client.send(to).groupInvite({ jid, code, subject, caption?, expiresAt? })` | Tappable card; `jid` must end in `@g.us` and `code` must be non-empty, else `INVALID_OPTIONS`. `expiresAt` is Unix **seconds** |
| `group.joinRequests(id)` | Raw attribute maps; the requester is under `jid` |
| `group.approveJoin(id, jids)` / `rejectJoin(id, jids)` | Same `{ jid, status }` results and pacing as member changes |

Build links as `https://chat.whatsapp.com/${code}` and parse with `new URL(link).pathname.slice(1)`. There is no
zaileys event for new join requests; listen to the raw socket on each `connect` (the socket is replaced on
reconnect) — its shape follows Baileys, not zaileys:

```ts
client.on('connect', () => {
  client.socket?.ev.on('group.join-request', (request) => {
    if (request.action === 'created') console.log(`join request in ${request.id} from ${request.participant}`)
  })
})
```

Never script mass joins; joining many groups quickly is a strong spam signal even with the 30 s gap.

## Communities

`client.community` mirrors groups with these differences:

| Call | Difference from `client.group` |
| --- | --- |
| `create(subject, description)` / `createGroup(subject, jids, communityId)` | Share the `community.create` category: 120 s apart **together** |
| `linkGroup(communityId, groupId)` / `unlinkGroup(communityId, groupId)` | Community first; needs admin in both. Unlinking keeps the group |
| `subGroups(communityId)` | `{ id?, subject, size?, owner?, creation? }[]` |
| `inviteCode()`, `revokeInvite()`, `acceptInvite()` | Resolve `undefined` instead of throwing `OPERATION_FAILED` — check the result |
| `setting(id, 'announcement' \| 'not_announcement')` | No `locked`/`unlocked` |
| `metadata()`, `list()` | `isCommunity` on the parent, `isCommunityAnnounce` on its announcement group, `linkedParent` on sub-groups |

Groups inside a community are ordinary groups: manage members with `client.group`. There are no
community-specific events.

## Channels (newsletters)

WhatsApp calls channels newsletters, hence `client.newsletter` and `…@newsletter` IDs. Post with
`client.send(channelId).text(…)` (owner or admins only).

| Call | Notes |
| --- | --- |
| `create(name, { description?, picture? })` | Paced 120 s. `picture` is a `Buffer`, uploaded after creation |
| `metadata(channelId)` | Looks up by ID only, not invite link. Throws `NEWSLETTER_NOT_FOUND` when WhatsApp returns nothing. Fields: `name`, `description`, `subscribers`, `invite`, `owner`, `verification`, `mute_state` |
| `follow` / `unfollow` | Paced 2 s (shared category). Posts then arrive as `message` with `msg.isNewsletter` |
| `mute` / `unmute` | Notifications only; posts still arrive |
| `updateName`, `updateDescription` (required text), `updatePicture(Buffer)`, `removePicture` | Owner or admins |
| `react(channelId, serverId, emoji)` / `unreact(channelId, serverId)` | `serverId` is `msg.message().key.server_id` on received posts |
| `messages(channelId, count = 50, { since?, after? })`, `subscribers(channelId)` | WhatsApp's raw response, typed `unknown` — parse defensively |
| `adminCount`, `demote(channelId, userJid)`, `changeOwner(channelId, newOwnerJid)` | `changeOwner` removes the bot's ownership |
| `delete(channelId)` | Permanent, no confirmation |

The `newsletter` event carries `newsletterId`, `timestamp` (ms), and `action`: `'reaction'` (`serverId`,
`emoji`), `'view'` (`serverId`, `count`), `'participants'` (`count` is never filled), or `'settings'` (`update`).

## Group events

| Event | Payload | Gotchas |
| --- | --- | --- |
| `group-join` | `{ groupId, participants: { jid, participantAlt?, isAdmin?, authorPn? }[], action, by?, timestamp }` | `action` is typed `'add' \| 'invite' \| 'invite-link'`, but WhatsApp Web reports adds, link joins, and approvals as `'add'`. Fires when the bot itself is added — filter out the bot's own IDs before greeting |
| `group-leave` | Same shape, `action: 'remove' \| 'leave'` | WhatsApp Web reports both as `'remove'`; the member left voluntarily when `by` matches their `jid` or `participantAlt`. When the bot is removed it can no longer send there |
| `group-update` | `{ groupId, update: { subject?, description?, announce?, restrict?, ephemeralDuration? }, timestamp }` | No author. `update` can be empty (invite reset, member-add mode, join approval) — re-read `metadata()` |
| `member-tag` | `{ groupId, participant, participantAlt?, label, timestamp }` | `timestamp` is WhatsApp's seconds when present, otherwise `Date.now()` ms. Removing a label doesn't fire |

Promotions and demotions emit no zaileys event; read `metadata()` when admin state matters. Join/leave/update
timestamps are `Date.now()` at receipt, in milliseconds. Payloads don't carry the client — use `client`, or
the plugin context in a plugin. Handlers aren't awaited, so wrap async work in `try`/`catch`:

```ts
client.on('group-join', async (event) => {
  try {
    const newcomers = event.participants.map((member) => member.jid)
    await client.send(event.groupId).text(`Welcome, ${newcomers.map((id) => `@${id.split('@')[0]}`).join(' ')}!`).mentions(newcomers)
  } catch (error) {
    console.error('welcome failed:', error)
  }
})
```

## Pacing with operationGuard

WhatsApp restricts numbers that create groups, join groups, or change members in bursts — the pattern bulk
spammers use — and a restricted number can lose group features or be banned. `operationGuard` (on by default)
serializes calls per category and waits until the gap has passed since the previous call **started**. A failed
call doesn't block the queue, categories are independent, and your `await` includes the wait, so reply to the
user before slow member changes.

| Category | Calls | Default gap |
| --- | --- | --- |
| `group.create` | `group.create` | 60 s |
| `group.participants` | `addMember`, `removeMember`, `promote`, `demote`, `approveJoin`, `rejectJoin` | 10 s |
| `group.join` | `group.acceptInvite` | 30 s |
| `community.create` | `community.create`, `community.createGroup` | 120 s |
| `community.join` | `community.acceptInvite` | 30 s |
| `newsletter.create` | `newsletter.create` | 120 s |
| `newsletter.follow` | `newsletter.follow`, `newsletter.unfollow` | 2 s |
| `group.update`, `community.update`, `newsletter.update` | Accepted in options; no call uses them | 3 s |

Reads, renames, settings, and invite links are not paced. Raise gaps with
`new Client({ operationGuard: { intervalsMs: { 'group.participants': 20_000 } } })`. `{ enabled: false }`
removes all spacing — only acceptable when your own queue spaces these calls at least as far apart. The guard
is per client instance, so several clients on one number don't share it. More:
https://zaileys.kejaa.id/groups/groups#why-some-calls-take-longer

## Errors

| Code | Class | Thrown by | Fix |
| --- | --- | --- | --- |
| `UNSUPPORTED_ON_CLOUD` | `ZaileysProviderError` | Reading `client.group` / `community` / `newsletter` on the Cloud API | Use a WhatsApp Web client |
| `NOT_CONNECTED` | `ZaileysDomainError` | Any call without a socket (before `connect`, or while reconnecting) | Call from `connect` or message handlers |
| `OPERATION_FAILED` | `ZaileysDomainError` | `group.inviteCode` / `revokeInvite` (no code — usually not admin), `group.acceptInvite` (no group JID — code reset or expired) | Make the bot admin; check the code with `inviteInfo()` |
| `NEWSLETTER_NOT_FOUND` | `ZaileysDomainError` | `newsletter.metadata` with no result | Check the `@newsletter` ID still exists |
| `GROUP_NOT_FOUND` | `ZaileysDomainError` | Declared, never thrown: a wrong or foreign group ID rejects with WhatsApp's error | Verify IDs with `group.list()` |
| `INVALID_PARTICIPANT` | `ZaileysDomainError` | Declared, never thrown: per-person failures come back as `status` codes | Inspect each `{ jid, status }` |
| `INVALID_OPTIONS` | `ZaileysBuilderError` | `groupInvite()` with a non-`@g.us` `jid` or empty `code` | Pass the group JID and a fresh code |

```ts
import { ZaileysDomainError, ZaileysProviderError } from 'zaileys'

try {
  await client.group.updateSubject('120363041234567890@g.us', 'Weekend Hikers')
} catch (error) {
  if (error instanceof ZaileysProviderError) console.error('groups need WhatsApp Web')
  else if (error instanceof ZaileysDomainError && error.code === 'NOT_CONNECTED') console.error('retry after connect')
  else console.error('WhatsApp refused:', error instanceof Error ? error.message : error)
}
```
