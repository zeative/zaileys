# Profile

> Source: https://zeative.github.io/zaileys/profile

# Profile

`client.profile` is the profile namespace on the zaileys [Client](/client). It lets you update your
own display name and status text, set or remove a profile picture (yours or a group's), and read the
picture URL and status of any JID. It is a lazily-created `ProfileModule` — constructed on first
access and proxying every call through the live socket.

```typescript

const client = new Client({ sessionId: 'default' })

client.on('connect', async () => {
  await client.profile.setName('Zaileys Bot')
  await client.profile.setStatus('Powered by zaileys ⚡')

  const url = await client.profile.getPicture('628xxxxxxxxxx@s.whatsapp.net')
  console.log('Avatar URL:', url)
})
```

Every method calls an internal `requireSocket()` guard. If the client is not connected, the call
immediately throws a `ZaileysDomainError` with code `NOT_CONNECTED` and message `client not
connected`. Always wait for the `'connect'` event (or `await client.connect()`) before calling any
profile method. See [Error Handling](/error-handling).

## Methods at a glance

| Method | Signature | Returns | Description |
| ------ | --------- | ------- | ----------- |
| `setName` | `setName(name)` | `Promise<void>` | Update your profile display name. |
| `setStatus` | `setStatus(status)` | `Promise<void>` | Update your profile status (the "about" text). |
| `setPicture` | `setPicture(jid, image)` | `Promise<void>` | Set the avatar for `jid` (self or a group). |
| `removePicture` | `removePicture(jid)` | `Promise<void>` | Remove the avatar for `jid`. |
| `getPicture` | `getPicture(jid, hd?)` | `Promise<string \| null>` | Get the avatar URL for `jid`. |
| `getStatus` | `getStatus(jid)` | `Promise<unknown>` | Fetch the status (about text) of `jid`. |

## `setName`

```typescript
setName(name: string): Promise<void>
```

Updates your own profile display name (the name other contacts see).

```typescript
client.on('connect', async () => {
  await client.profile.setName('Zaileys Bot')
})
```

| Parameter | Type | Description |
| --------- | ---- | ----------- |
| `name` | `string` | The new display name. |

## `setStatus`

```typescript
setStatus(status: string): Promise<void>
```

Updates your profile status — the short "about" text shown on your profile.

```typescript
client.on('connect', async () => {
  await client.profile.setStatus('Available 24/7 ⚡')
})
```

| Parameter | Type | Description |
| --------- | ---- | ----------- |
| `status` | `string` | The new status / about text. |

## `setPicture`

```typescript
setPicture(jid: string, image: Buffer | MediaSource): Promise<void>
```

Sets the profile picture. The `jid` defaults to your own account when you pass your self JID; pass a
**group JID** instead to set that group's avatar (you must be a group admin). The `image` may be a
`Buffer` or any zaileys `MediaSource` (URL, path, stream — see [Media Processing](/media)).

```typescript

client.on('connect', async () => {
  // Set your own avatar from a file (pass your own JID)
  await client.profile.setPicture('628xxxxxxxxxx@s.whatsapp.net', readFileSync('./avatar.jpg'))

  // Set a group's avatar from a URL
  await client.profile.setPicture(
    '120363000000000000@g.us',
    'https://example.com/group-logo.png',
  )
})
```

| Parameter | Type | Description |
| --------- | ---- | ----------- |
| `jid` | `string` | Target JID. Your self JID for your own avatar, or a group JID for a group avatar. |
| `image` | `Buffer \| MediaSource` | The image to upload. |

## `removePicture`

```typescript
removePicture(jid: string): Promise<void>
```

Removes the current profile picture for the given JID (your own account or a group you administer).

```typescript
client.on('connect', async () => {
  await client.profile.removePicture('628xxxxxxxxxx@s.whatsapp.net')
})
```

| Parameter | Type | Description |
| --------- | ---- | ----------- |
| `jid` | `string` | Target JID whose avatar to remove. |

## `getPicture`

```typescript
getPicture(jid: string, hd = false): Promise<string | null>
```

Returns the profile picture **URL** for the given JID, or `null` if the JID has no picture (or it is
not visible to you). Pass `hd: true` to request the full-resolution image URL instead of the small
preview.

```typescript
client.on('connect', async () => {
  const preview = await client.profile.getPicture('628xxxxxxxxxx@s.whatsapp.net')
  const fullRes = await client.profile.getPicture('628xxxxxxxxxx@s.whatsapp.net', true)

  if (preview) console.log('Preview URL:', preview)
  if (fullRes) console.log('HD URL:', fullRes)
})
```

| Parameter | Type | Description |
| --------- | ---- | ----------- |
| `jid` | `string` | The JID to fetch the avatar for (user or group). |
| `hd` | `boolean` (default `false`) | `true` for the full-resolution image URL, `false` for the preview. |

**Returns:** `string | null` — the picture URL, or `null` when unavailable.

## `getStatus`

```typescript
getStatus(jid: string): Promise<unknown>
```

Fetches the status ("about" text) of the given JID. The return value is the raw object from the
underlying transport layer; read `.status` and `.setAt` from it.

```typescript
client.on('connect', async () => {
  const status = await client.profile.getStatus('628xxxxxxxxxx@s.whatsapp.net')
  console.log(status)
})
```

| Parameter | Type | Description |
| --------- | ---- | ----------- |
| `jid` | `string` | The JID to fetch the status for. |

## See also

- [Client & Lifecycle](/client) — how to construct the client and connect.
- [Media Processing](/media) — the `MediaSource` shapes accepted by `setPicture`.
- [Groups](/groups) — group administration (you must be an admin to set a group avatar).
- [Error Handling](/error-handling) — `ZaileysDomainError` codes and catch patterns.
