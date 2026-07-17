# Groups

> Source: https://zeative.github.io/zaileys/groups

# Groups

`client.group` is the group management namespace on the zaileys [Client](/client). It provides full
lifecycle control over WhatsApp groups: create and leave groups, manage participants, rotate invite
links, update subject and description, configure disappearing messages, and lock or unlock group
settings.

```typescript

const client = new Client({ sessionId: 'default' })

client.on('connect', async () => {
  const groupId = '120363000000000000@g.us'
  const meta = await client.group.metadata(groupId)
  console.log(meta.subject, 'has', meta.participants.length, 'members')
})
```

Every method on `client.group` calls an internal `requireSocket()` guard. If the client is not
connected, the call immediately throws a `ZaileysDomainError` with code `NOT_CONNECTED` and message
`client not connected`. Always wait for the `'connect'` event (or `await client.connect()`) before
calling any group method. See [Error Handling](/error-handling).

## At a glance

| Method | Signature | Returns | Description |
| ------ | --------- | ------- | ----------- |
| `create` | `create(subject, participants[])` | `Promise<GroupMetadata>` | Create a new group. |
| `metadata` | `metadata(groupId)` | `Promise<GroupMetadata>` | Fetch group info. |
| `addMember` | `addMember(groupId, jids[])` | `Promise<ParticipantUpdateResult[]>` | Add participants. |
| `removeMember` | `removeMember(groupId, jids[])` | `Promise<ParticipantUpdateResult[]>` | Remove participants. |
| `promote` | `promote(groupId, jids[])` | `Promise<ParticipantUpdateResult[]>` | Promote participants to admin. |
| `demote` | `demote(groupId, jids[])` | `Promise<ParticipantUpdateResult[]>` | Demote admins to member. |
| `updateSubject` | `updateSubject(groupId, subject)` | `Promise<void>` | Change the group name. |
| `updateDescription` | `updateDescription(groupId, description?)` | `Promise<void>` | Change or clear the group description. |
| `leave` | `leave(groupId)` | `Promise<void>` | Leave the group. |
| `tagMember` | `tagMember(groupId, jid, label)` | `Promise<void>` | Apply a member label in the group. |
| `inviteCode` | `inviteCode(groupId)` | `Promise<string>` | Get the current invite link code. |
| `revokeInvite` | `revokeInvite(groupId)` | `Promise<string>` | Revoke and regenerate the invite link. |
| `acceptInvite` | `acceptInvite(code)` | `Promise<string>` | Join a group by invite code; returns the group JID. |
| `toggleEphemeral` | `toggleEphemeral(groupId, seconds)` | `Promise<void>` | Set the disappearing-message timer (`0` disables). |
| `setting` | `setting(groupId, value)` | `Promise<void>` | Update group restrictions (`announcement`, `locked`, etc.). |
| `list` | `list()` | `Promise<GroupMetadata[]>` | All groups you participate in. |
| `inviteInfo` | `inviteInfo(code)` | `Promise<GroupMetadata>` | Resolve an invite code to its metadata (preview before joining). |
| `joinRequests` | `joinRequests(groupId)` | `Promise<Array<{ [k: string]: string }>>` | Pending join requests for the group. |
| `approveJoin` | `approveJoin(groupId, jids[])` | `Promise<ParticipantUpdateResult[]>` | Approve pending join requests. |
| `rejectJoin` | `rejectJoin(groupId, jids[])` | `Promise<ParticipantUpdateResult[]>` | Reject pending join requests. |
| `joinApproval` | `joinApproval(groupId, enabled)` | `Promise<void>` | Toggle "admin approval to join". |
| `memberAddMode` | `memberAddMode(groupId, adminsOnly)` | `Promise<void>` | Toggle whether only admins can add members. |

## Rate limiting and ban safety

**Rapid group operations are one of the top WhatsApp ban triggers.** Creating many groups, joining
many groups, or adding/removing large numbers of participants in quick succession is treated as
automated bulk abuse.

zaileys ships an `operationGuard` that automatically spaces out sensitive operations by category.
It is **enabled by default**. The default minimum intervals are:

| Category | Operations | Default interval |
| -------- | ---------- | ---------------- |
| `group.create` | `create()` | 60 seconds |
| `group.participants` | `addMember()`, `removeMember()`, `promote()`, `demote()` | 10 seconds |
| `group.join` | `acceptInvite()` | 30 seconds |

When multiple calls of the same category queue up, each one waits for the previous to finish plus
the minimum interval before running. This means calling `addMember()` three times in a row will
space the sends ~10 seconds apart automatically.

To tune or disable the guard, see [Configuration — operationGuard](/configuration#operationguard).
For advice on what patterns are risky, see [Troubleshooting](/troubleshooting).

## `create`

```typescript
create(subject: string, participants: string[]): Promise<GroupMetadata>
```

Creates a new WhatsApp group with the given subject (name) and initial list of participant JIDs.
Returns the full `GroupMetadata` for the newly created group.

Throttled by `operationGuard` under the `group.create` category (default 60 s between calls).

```typescript
client.on('connect', async () => {
  const group = await client.group.create('Project Zaileys', [
    '628111111111@s.whatsapp.net',
    '628222222222@s.whatsapp.net',
  ])

  console.log('Created group:', group.id)
  console.log('Subject:', group.subject)
})
```

| Parameter | Type | Description |
| --------- | ---- | ----------- |
| `subject` | `string` | The group name (displayed to all participants). |
| `participants` | `string[]` | Initial member JIDs in the format `628xxxxxxxxxx@s.whatsapp.net`. |

**Returns:** `GroupMetadata` — see [GroupMetadata shape](#groupmetadata).

## `metadata`

```typescript
metadata(groupId: string): Promise<GroupMetadata>
```

Fetches the current metadata for a group: subject, description, participant list, admin flags,
creation timestamp, and related fields. This is the primary read operation for group state.

```typescript
client.on('connect', async () => {
  const meta = await client.group.metadata('120363000000000000@g.us')

  console.log('Subject:', meta.subject)
  console.log('Participants:', meta.participants.length)

  const admins = meta.participants.filter((p) => p.admin)
  console.log('Admins:', admins.map((p) => p.id))
})
```

| Parameter | Type | Description |
| --------- | ---- | ----------- |
| `groupId` | `string` | The group JID (e.g. `120363000000000000@g.us`). |

**Returns:** `GroupMetadata` — see [GroupMetadata shape](#groupmetadata).

## `addMember`

```typescript
addMember(groupId: string, jids: string[]): Promise<ParticipantUpdateResult[]>
```

Adds one or more participants to the group. Returns a result entry for each JID indicating whether
the operation succeeded.

Throttled by `operationGuard` under the `group.participants` category (default 10 s between calls).
You must be a group admin to add members.

```typescript
client.on('connect', async () => {
  const results = await client.group.addMember('120363000000000000@g.us', [
    '628333333333@s.whatsapp.net',
    '628444444444@s.whatsapp.net',
  ])

  for (const r of results) {
    console.log(r.jid, '->', r.status)
  }
})
```

| Parameter | Type | Description |
| --------- | ---- | ----------- |
| `groupId` | `string` | Target group JID. |
| `jids` | `string[]` | JIDs to add. |

**Returns:** `ParticipantUpdateResult[]` — `{ jid: string; status: string }` for each entry.

## `removeMember`

```typescript
removeMember(groupId: string, jids: string[]): Promise<ParticipantUpdateResult[]>
```

Removes one or more participants from the group. You must be a group admin.

Throttled under `group.participants` (default 10 s).

```typescript
client.on('connect', async () => {
  const results = await client.group.removeMember('120363000000000000@g.us', [
    '628333333333@s.whatsapp.net',
  ])

  for (const r of results) {
    console.log(r.jid, '->', r.status)
  }
})
```

| Parameter | Type | Description |
| --------- | ---- | ----------- |
| `groupId` | `string` | Target group JID. |
| `jids` | `string[]` | JIDs to remove. |

**Returns:** `ParticipantUpdateResult[]`.

## `promote`

```typescript
promote(groupId: string, jids: string[]): Promise<ParticipantUpdateResult[]>
```

Promotes one or more participants to group admin. You must be a group admin yourself.

Throttled under `group.participants` (default 10 s).

```typescript
client.on('connect', async () => {
  const results = await client.group.promote('120363000000000000@g.us', [
    '628111111111@s.whatsapp.net',
  ])

  for (const r of results) {
    console.log(r.jid, 'promoted, status:', r.status)
  }
})
```

| Parameter | Type | Description |
| --------- | ---- | ----------- |
| `groupId` | `string` | Target group JID. |
| `jids` | `string[]` | JIDs to promote. |

**Returns:** `ParticipantUpdateResult[]`.

## `demote`

```typescript
demote(groupId: string, jids: string[]): Promise<ParticipantUpdateResult[]>
```

Demotes one or more group admins back to regular member. You must be a group admin yourself.

Throttled under `group.participants` (default 10 s).

```typescript
client.on('connect', async () => {
  const results = await client.group.demote('120363000000000000@g.us', [
    '628111111111@s.whatsapp.net',
  ])

  for (const r of results) {
    console.log(r.jid, 'demoted, status:', r.status)
  }
})
```

| Parameter | Type | Description |
| --------- | ---- | ----------- |
| `groupId` | `string` | Target group JID. |
| `jids` | `string[]` | JIDs to demote. |

**Returns:** `ParticipantUpdateResult[]`.

## `updateSubject`

```typescript
updateSubject(groupId: string, subject: string): Promise<void>
```

Updates the group name (subject). You must be a group admin (or the group must not have the `locked`
setting). Does not go through the `operationGuard` — avoid calling in a tight loop.

```typescript
client.on('connect', async () => {
  await client.group.updateSubject('120363000000000000@g.us', 'Team Announcements')
})
```

| Parameter | Type | Description |
| --------- | ---- | ----------- |
| `groupId` | `string` | Target group JID. |
| `subject` | `string` | New group name. |

## `updateDescription`

```typescript
updateDescription(groupId: string, description?: string): Promise<void>
```

Updates the group description. Pass `undefined` or omit `description` to clear it. You must be a
group admin.

```typescript
client.on('connect', async () => {
  // Set description
  await client.group.updateDescription(
    '120363000000000000@g.us',
    'This group is for internal announcements only.',
  )

  // Clear description
  await client.group.updateDescription('120363000000000000@g.us')
})
```

| Parameter | Type | Description |
| --------- | ---- | ----------- |
| `groupId` | `string` | Target group JID. |
| `description` | `string \| undefined` | New description, or omit to clear. |

## `leave`

```typescript
leave(groupId: string): Promise<void>
```

Leaves the specified group. After this call the bot is no longer a participant and will not receive
further group events for that JID.

```typescript
client.on('connect', async () => {
  await client.group.leave('120363000000000000@g.us')
  console.log('Left the group.')
})
```

| Parameter | Type | Description |
| --------- | ---- | ----------- |
| `groupId` | `string` | Group JID to leave. |

## `tagMember`

```typescript
tagMember(groupId: string, jid: string, label: string): Promise<void>
```

Applies a label to a member within the group. The `jid` parameter identifies the target member; the
`label` is the label string to apply. Label support depends on the group's WhatsApp configuration.

```typescript
client.on('connect', async () => {
  await client.group.tagMember(
    '120363000000000000@g.us',
    '628111111111@s.whatsapp.net',
    'VIP',
  )
})
```

| Parameter | Type | Description |
| --------- | ---- | ----------- |
| `groupId` | `string` | Target group JID. |
| `jid` | `string` | The member's JID. |
| `label` | `string` | Label string to apply. |

## `inviteCode`

```typescript
inviteCode(groupId: string): Promise<string>
```

Returns the current invite code for the group (the fragment appended to
`https://chat.whatsapp.com/<code>`). Throws `ZaileysDomainError('OPERATION_FAILED')` if the code
is unavailable (e.g. the bot is not an admin or the group does not exist).

```typescript
client.on('connect', async () => {
  const code = await client.group.inviteCode('120363000000000000@g.us')
  console.log('Invite link: https://chat.whatsapp.com/' + code)
})
```

| Parameter | Type | Description |
| --------- | ---- | ----------- |
| `groupId` | `string` | Target group JID. |

**Returns:** `string` — the raw invite code (not a full URL).

## `revokeInvite`

```typescript
revokeInvite(groupId: string): Promise<string>
```

Revokes the current invite link and generates a new one. The old invite code immediately becomes
invalid. Returns the new code. Throws `ZaileysDomainError('OPERATION_FAILED')` if the operation
fails. You must be a group admin.

```typescript
client.on('connect', async () => {
  const newCode = await client.group.revokeInvite('120363000000000000@g.us')
  console.log('New invite link: https://chat.whatsapp.com/' + newCode)
})
```

| Parameter | Type | Description |
| --------- | ---- | ----------- |
| `groupId` | `string` | Target group JID. |

**Returns:** `string` — the newly generated invite code.

## `acceptInvite`

```typescript
acceptInvite(code: string): Promise<string>
```

Joins a group using an invite code. The code is the raw fragment (not the full URL). Returns the JID
of the group that was joined. Throws `ZaileysDomainError('OPERATION_FAILED')` if the invite is
invalid or expired.

Throttled by `operationGuard` under the `group.join` category (default 30 s between calls).

Accepting many invites in rapid succession is a well-known WhatsApp ban signal. The `operationGuard`
spaces calls 30 seconds apart by default, but you should also avoid scripting bulk joins altogether.
See [Troubleshooting](/troubleshooting).

```typescript
client.on('connect', async () => {
  const groupJid = await client.group.acceptInvite('AbCdEfGhIjKlMnOpQrSt12')
  console.log('Joined:', groupJid)
})
```

| Parameter | Type | Description |
| --------- | ---- | ----------- |
| `code` | `string` | The invite code (the part after `https://chat.whatsapp.com/`). |

**Returns:** `string` — the JID of the group that was joined.

## `toggleEphemeral`

```typescript
toggleEphemeral(groupId: string, seconds: number): Promise<void>
```

Sets the disappearing-message timer for the group. Pass `0` to disable ephemeral messages. Common
values are `86400` (24 hours), `604800` (7 days), and `7776000` (90 days). You must be a group admin.

```typescript
client.on('connect', async () => {
  // Enable 7-day disappearing messages
  await client.group.toggleEphemeral('120363000000000000@g.us', 604800)

  // Disable disappearing messages
  await client.group.toggleEphemeral('120363000000000000@g.us', 0)
})
```

| Parameter | Type | Description |
| --------- | ---- | ----------- |
| `groupId` | `string` | Target group JID. |
| `seconds` | `number` | Timer in seconds. `0` disables ephemeral messages. |

## `setting`

```typescript
setting(
  groupId: string,
  setting: 'announcement' | 'not_announcement' | 'locked' | 'unlocked',
): Promise<void>
```

Applies a group-level restriction. You must be a group admin.

| Value | Effect |
| ----- | ------ |
| `'announcement'` | Only admins can send messages. |
| `'not_announcement'` | All participants can send messages. |
| `'locked'` | Only admins can edit the group subject, description, and icon. |
| `'unlocked'` | All participants can edit group info. |

```typescript
client.on('connect', async () => {
  const groupId = '120363000000000000@g.us'

  // Mute the group — only admins can send
  await client.group.setting(groupId, 'announcement')

  // Re-open for all participants
  await client.group.setting(groupId, 'not_announcement')

  // Lock editing to admins only
  await client.group.setting(groupId, 'locked')

  // Allow anyone to edit group info
  await client.group.setting(groupId, 'unlocked')
})
```

| Parameter | Type | Description |
| --------- | ---- | ----------- |
| `groupId` | `string` | Target group JID. |
| `setting` | `'announcement' \| 'not_announcement' \| 'locked' \| 'unlocked'` | The restriction to apply. |

## `list`

```typescript
list(): Promise<GroupMetadata[]>
```

Returns the metadata for every group the bot currently participates in. Internally fetches all
participating groups and returns them as an array.

```typescript
client.on('connect', async () => {
  const groups = await client.group.list()
  console.log('You are in', groups.length, 'groups')

  for (const g of groups) {
    console.log(g.subject, '—', g.participants.length, 'members')
  }
})
```

**Returns:** `GroupMetadata[]` — see [GroupMetadata shape](#groupmetadata).

## `inviteInfo`

```typescript
inviteInfo(code: string): Promise<GroupMetadata>
```

Resolves a group invite code to its metadata **without joining**. Use this to preview a group
(subject, description, participant count) before deciding to call `acceptInvite`. The `code` is the
raw fragment (the part after `https://chat.whatsapp.com/`).

```typescript
client.on('connect', async () => {
  const info = await client.group.inviteInfo('AbCdEfGhIjKlMnOpQrSt12')

  console.log('Group:', info.subject)
  console.log('Members:', info.size)
  console.log('Owner:', info.owner)
})
```

| Parameter | Type | Description |
| --------- | ---- | ----------- |
| `code` | `string` | The invite code (the part after `https://chat.whatsapp.com/`). |

**Returns:** `GroupMetadata` — see [GroupMetadata shape](#groupmetadata).

## `joinRequests`

```typescript
joinRequests(groupId: string): Promise<Array<{ [k: string]: string }>>
```

Returns the list of pending join requests for a group whose join approval mode is enabled. Each
entry describes a user awaiting admin approval. You must be a group admin.

```typescript
client.on('connect', async () => {
  const requests = await client.group.joinRequests('120363000000000000@g.us')
  console.log('Pending requests:', requests.length)

  for (const req of requests) {
    console.log(req)
  }
})
```

| Parameter | Type | Description |
| --------- | ---- | ----------- |
| `groupId` | `string` | Target group JID. |

**Returns:** `Array<{ [k: string]: string }>` — raw pending-request entries.

## `approveJoin`

```typescript
approveJoin(groupId: string, jids: string[]): Promise<ParticipantUpdateResult[]>
```

Approves one or more pending join requests. The approved JIDs become group members. You must be a
group admin.

Throttled by `operationGuard` under the `group.participants` category (default 10 s between calls).

```typescript
client.on('connect', async () => {
  const results = await client.group.approveJoin('120363000000000000@g.us', [
    '628333333333@s.whatsapp.net',
  ])

  for (const r of results) {
    console.log(r.jid, '->', r.status)
  }
})
```

| Parameter | Type | Description |
| --------- | ---- | ----------- |
| `groupId` | `string` | Target group JID. |
| `jids` | `string[]` | JIDs of pending requesters to approve. |

**Returns:** `ParticipantUpdateResult[]`.

## `rejectJoin`

```typescript
rejectJoin(groupId: string, jids: string[]): Promise<ParticipantUpdateResult[]>
```

Rejects one or more pending join requests. The rejected JIDs are removed from the pending list. You
must be a group admin.

Throttled under `group.participants` (default 10 s).

```typescript
client.on('connect', async () => {
  const results = await client.group.rejectJoin('120363000000000000@g.us', [
    '628333333333@s.whatsapp.net',
  ])

  for (const r of results) {
    console.log(r.jid, '->', r.status)
  }
})
```

| Parameter | Type | Description |
| --------- | ---- | ----------- |
| `groupId` | `string` | Target group JID. |
| `jids` | `string[]` | JIDs of pending requesters to reject. |

**Returns:** `ParticipantUpdateResult[]`.

## `joinApproval`

```typescript
joinApproval(groupId: string, enabled: boolean): Promise<void>
```

Toggles the group's "admin approval to join" mode. When enabled, users who follow the invite link
are placed in a pending queue (see `joinRequests`) instead of joining immediately. You must be a
group admin.

```typescript
client.on('connect', async () => {
  // Require admin approval for new joins
  await client.group.joinApproval('120363000000000000@g.us', true)

  // Allow anyone with the link to join directly
  await client.group.joinApproval('120363000000000000@g.us', false)
})
```

| Parameter | Type | Description |
| --------- | ---- | ----------- |
| `groupId` | `string` | Target group JID. |
| `enabled` | `boolean` | `true` to require admin approval, `false` to allow direct joins. |

## `memberAddMode`

```typescript
memberAddMode(groupId: string, adminsOnly: boolean): Promise<void>
```

Toggles who can add new members to the group. When `adminsOnly` is `true`, only admins can add
members; when `false`, any participant can. You must be a group admin.

```typescript
client.on('connect', async () => {
  // Only admins can add members
  await client.group.memberAddMode('120363000000000000@g.us', true)

  // Any member can add members
  await client.group.memberAddMode('120363000000000000@g.us', false)
})
```

| Parameter | Type | Description |
| --------- | ---- | ----------- |
| `groupId` | `string` | Target group JID. |
| `adminsOnly` | `boolean` | `true` to restrict adding members to admins only. |

## GroupMetadata

`create()` and `metadata()` return a `GroupMetadata` object (re-exported from the underlying
transport layer). Key fields you will typically use:

| Field | Type | Description |
| ----- | ---- | ----------- |
| `id` | `string` | The group JID (e.g. `120363000000000000@g.us`). |
| `subject` | `string` | The group name. |
| `desc` | `string \| undefined` | The group description. |
| `owner` | `string \| undefined` | JID of the group creator/owner. |
| `creation` | `number \| undefined` | Unix timestamp of group creation. |
| `participants` | `GroupParticipant[]` | Full participant list with admin flags. |
| `size` | `number \| undefined` | Number of participants. |

Each `GroupParticipant`:

| Field | Type | Description |
| ----- | ---- | ----------- |
| `id` | `string` | Participant JID. |
| `admin` | `'admin' \| 'superadmin' \| null \| undefined` | Admin role, or absent if regular member. |

## ParticipantUpdateResult

`addMember()`, `removeMember()`, `promote()`, and `demote()` all return
`ParticipantUpdateResult[]`:

```typescript
interface ParticipantUpdateResult {
  jid: string    // the participant's JID
  status: string // WhatsApp status code for this individual update
}
```

Iterate the result to detect per-member failures (e.g. a JID that does not have a WhatsApp account
will have a non-success status code).

```typescript
const results = await client.group.addMember(groupId, jids)

const failed = results.filter((r) => r.status !== '200')
if (failed.length > 0) {
  console.warn('Some members could not be added:', failed)
}
```

## Error handling

All `client.group` methods throw `ZaileysDomainError` on failure. The relevant error codes are:

| Code | When thrown |
| ---- | ----------- |
| `NOT_CONNECTED` | Any method called before the client is connected. |
| `OPERATION_FAILED` | `inviteCode()`, `revokeInvite()`, or `acceptInvite()` when the operation cannot complete (e.g. invalid/expired invite, insufficient permissions). |

```typescript

const client = new Client()

client.on('connect', async () => {
  try {
    const code = await client.group.inviteCode('120363000000000000@g.us')
    console.log(code)
  } catch (err) {
    if (err instanceof ZaileysDomainError) {
      if (err.code === 'NOT_CONNECTED') {
        console.error('Client disconnected unexpectedly.')
      } else if (err.code === 'OPERATION_FAILED') {
        console.error('Could not retrieve invite code — are you a group admin?')
      }
    }
  }
})
```

See [Error Handling](/error-handling) for the full error taxonomy and how to distinguish domain
errors from builder and automation errors.

## Complete example

The example below creates a group, promotes a member to admin, locks editing to admins, and prints
the invite link — demonstrating the common admin setup flow.

```typescript

const client = new Client({ sessionId: 'default' })

client.on('connect', async () => {
  // 1. Create the group
  const group = await client.group.create('Announcements', [
    '628111111111@s.whatsapp.net',
    '628222222222@s.whatsapp.net',
  ])

  console.log('Group created:', group.id)

  // 2. Promote a co-admin
  await client.group.promote(group.id, ['628111111111@s.whatsapp.net'])

  // 3. Only admins can send messages
  await client.group.setting(group.id, 'announcement')

  // 4. Only admins can edit group info
  await client.group.setting(group.id, 'locked')

  // 5. Enable 7-day disappearing messages
  await client.group.toggleEphemeral(group.id, 604800)

  // 6. Grab the invite link
  const code = await client.group.inviteCode(group.id)
  console.log('Share this link: https://chat.whatsapp.com/' + code)

  // 7. Update description
  await client.group.updateDescription(group.id, 'Official announcement channel. Admins only.')
})
```

## See also

- [Client & Lifecycle](/client) — how to construct the client and connect.
- [Configuration](/configuration#operationguard) — tuning or disabling the `operationGuard`.
- [Error Handling](/error-handling) — `ZaileysDomainError` codes and catch patterns.
- [Troubleshooting](/troubleshooting) — what to do if operations fail or the account gets flagged.
- [Communities](/client#clientcommunity) — grouping multiple groups under a community umbrella.
