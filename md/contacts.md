# Contacts

> Source: https://zeative.github.io/zaileys/contacts

# Contacts

`client.contact` is the contacts namespace on the zaileys [Client](/client). Use it to check whether
phone numbers are registered on WhatsApp (and resolve their JIDs), and to add, edit, or remove
address-book entries. It is a lazily-created `ContactModule` — constructed on first access and
proxying every call through the live socket.

```typescript

const client = new Client({ sessionId: 'default' })

client.on('connect', async () => {
  const results = await client.contact.check('628111111111', '628999999999')
  for (const r of results) {
    console.log(r.jid, r.exists ? 'on WhatsApp' : 'not registered')
  }
})
```

Every method calls an internal `requireSocket()` guard. If the client is not connected, the call
immediately throws a `ZaileysDomainError` with code `NOT_CONNECTED` and message `client not
connected`. Always wait for the `'connect'` event (or `await client.connect()`) before calling any
contact method. See [Error Handling](/error-handling).

**Normalization is automatic.** You can pass bare phone numbers (`628111111111`) or full JIDs
(`628111111111@s.whatsapp.net`) — zaileys normalizes the input for `save` and `remove`, so you do
not have to format JIDs yourself.

## Methods at a glance

| Method | Signature | Returns | Description |
| ------ | --------- | ------- | ----------- |
| `check` | `check(...numbers)` | `Promise<{ jid; exists; lid? }[]>` | Check which numbers are on WhatsApp; one result per input. |
| `exists` | `exists(number)` | `Promise<boolean>` | Convenience check for a single number. |
| `save` | `save(jid, name)` | `Promise<void>` | Add or edit an address-book contact. |
| `remove` | `remove(jid)` | `Promise<void>` | Remove an address-book contact. |

## `check`

```typescript
check(...numbers: string[]): Promise<{ jid: string; exists: boolean; lid?: string }[]>
```

Checks whether one or more phone numbers are registered on WhatsApp. Returns one entry per input with
the resolved `jid`, an `exists` flag, and `lid` when WhatsApp returns a linked LID identifier.

```typescript
client.on('connect', async () => {
  const results = await client.contact.check('628111111111', '628222222222')

  for (const r of results) {
    console.log(`${r.jid} -> ${r.exists ? 'exists' : 'no account'}`)
    if (r.lid) console.log('  LID:', r.lid)
  }
})
```

| Parameter | Type | Description |
| --------- | ---- | ----------- |
| `numbers` | `...string[]` | One or more phone numbers (bare or JID form). |

**Returns:** `{ jid: string; exists: boolean; lid?: string }[]` — one entry per input number.

## `exists`

```typescript
exists(number: string): Promise<boolean>
```

Convenience wrapper around `check` for a single number. Returns `true` if the number has a WhatsApp
account, `false` otherwise.

```typescript
client.on('connect', async () => {
  if (await client.contact.exists('628111111111')) {
    await client.send('628111111111').text('Hi there!')
  }
})
```

| Parameter | Type | Description |
| --------- | ---- | ----------- |
| `number` | `string` | The phone number to check (bare or JID form). |

**Returns:** `boolean` — whether the number is on WhatsApp.

## `save`

```typescript
save(jid: string, name: { firstName?: string; lastName?: string; fullName?: string }): Promise<void>
```

Adds a new contact or edits an existing one in the address book. Provide any combination of
`firstName`, `lastName`, and `fullName`. The `jid` is normalized automatically.

```typescript
client.on('connect', async () => {
  await client.contact.save('628111111111', {
    firstName: 'Budi',
    lastName: 'Santoso',
    fullName: 'Budi Santoso',
  })
})
```

| Parameter | Type | Description |
| --------- | ---- | ----------- |
| `jid` | `string` | The contact's number or JID (normalized automatically). |
| `name.firstName` | `string` (optional) | Given name. |
| `name.lastName` | `string` (optional) | Family name. |
| `name.fullName` | `string` (optional) | Full display name. |

## `remove`

```typescript
remove(jid: string): Promise<void>
```

Removes a contact from the address book. The `jid` is normalized automatically.

```typescript
client.on('connect', async () => {
  await client.contact.remove('628111111111')
})
```

| Parameter | Type | Description |
| --------- | ---- | ----------- |
| `jid` | `string` | The contact's number or JID to remove (normalized automatically). |

## Practical pattern: validate before sending

```typescript

const client = new Client()

client.on('connect', async () => {
  const number = '628111111111'

  if (!(await client.contact.exists(number))) {
    console.warn(`${number} is not on WhatsApp — skipping.`)
    return
  }

  await client.contact.save(number, { fullName: 'New Lead' })
  await client.send(number).text('Welcome aboard!')
})
```

## See also

- [Client & Lifecycle](/client) — how to construct the client and connect.
- [Sending Messages](/sending-messages) — send once a number is verified.
- [Error Handling](/error-handling) — `ZaileysDomainError` codes and catch patterns.
