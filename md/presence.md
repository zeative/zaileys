# Presence

> Source: https://zeative.github.io/zaileys/presence

# Presence

`client.presence` exposes the four WhatsApp presence signals your bot can emit: marking the account
as online or offline globally, and showing a "typing…" or "recording audio…" indicator inside a
specific chat. It is a lazily-created `PresenceModule` — the object is constructed on first access
and proxies every call through the live socket.

```typescript

const client = new Client()

client.on('connect', async () => {
  await client.presence.online()

  const jid = '628xxxxxxxxxx@s.whatsapp.net'
  await client.presence.typing(jid, 2000) // shows "typing…", clears after 2 s
  await client.send(jid).text('Hey, thanks for reaching out!')
})
```

  Every method calls an internal `requireSocket()` guard. If the client is not connected when you
  call any presence method, it throws a `ZaileysAutomationError` with code `NOT_CONNECTED` and
  message `client not connected`. Always wait for the `'connect'` event (or `await client.connect()`)
  before driving presence. See [Error Handling](/error-handling).

## Methods at a glance

| Method | Signature | Description |
| --- | --- | --- |
| `online()` | `() => Promise<void>` | Marks the account as available (`available`) globally. |
| `offline()` | `() => Promise<void>` | Marks the account as unavailable (`unavailable`) globally. |
| `typing(jid, ms?)` | `(jid: string, ms?: number) => Promise<void>` | Shows a "typing…" indicator in the given chat. If `ms` is provided, auto-clears to `paused` after that many milliseconds. |
| `recording(jid, ms?)` | `(jid: string, ms?: number) => Promise<void>` | Shows a "recording audio…" indicator in the given chat. Auto-clears to `paused` after `ms` milliseconds if provided. |

## `online()`

```typescript
online(): Promise<void>
```

Broadcasts an `available` status update globally, making your account appear online to contacts.

```typescript
client.on('connect', async () => {
  await client.presence.online()
})
```

## `offline()`

```typescript
offline(): Promise<void>
```

Broadcasts an `unavailable` status update globally. Use this to signal that the account is no
longer active — for example, during scheduled downtime or before a clean shutdown.

```typescript
process.on('SIGINT', async () => {
  await client.presence.offline()
  await client.disconnect()
  process.exit(0)
})
```

## `typing(jid, ms?)`

```typescript
typing(jid: string, ms?: number): Promise<void>
```

| Parameter | Type | Description |
| --- | --- | --- |
| `jid` | `string` | The chat JID to show the indicator in (`628xxxxxxxxxx@s.whatsapp.net` for users, `xxx@g.us` for groups). |
| `ms` | `number` (optional) | If provided, schedules an automatic `paused` clear after this many milliseconds. |

Sends a `composing` presence update to the specified chat so the recipient sees "typing…". When
`ms` is given, a timer fires after that delay and sends `paused` to clear the indicator — you do
not need to call anything else. The timer is `unref`'d so it will not prevent your process from
exiting.

```typescript
const jid = '628xxxxxxxxxx@s.whatsapp.net'

// Manual clear (you are responsible for clearing later)
await client.presence.typing(jid)

// Auto-clear after 1.5 s
await client.presence.typing(jid, 1500)
```

## `recording(jid, ms?)`

```typescript
recording(jid: string, ms?: number): Promise<void>
```

| Parameter | Type | Description |
| --- | --- | --- |
| `jid` | `string` | The chat JID to show the indicator in. |
| `ms` | `number` (optional) | Auto-clears to `paused` after this many milliseconds, same as `typing`. |

Shows a "recording audio…" indicator (`recording`) in the chat. Behaves identically to `typing`
regarding auto-clear: pass `ms` to let zaileys clear it automatically.

```typescript
const jid = '628xxxxxxxxxx@s.whatsapp.net'

await client.presence.recording(jid, 3000) // clears after 3 s
await client.send(jid).audio('https://example.com/voice-note.ogg', { ptt: true })
```

## Auto-clear behavior

When you pass `ms` to `typing` or `recording`, zaileys schedules an internal `setTimeout` that
sends a `paused` update to the same JID after the delay. This clears the indicator without any
extra call from your side:

```typescript
// Pattern: show indicator → wait the same delay → send reply
const DELAY_MS = 2000
const jid = '628xxxxxxxxxx@s.whatsapp.net'

await client.presence.typing(jid, DELAY_MS)

setTimeout(async () => {
  await client.send(jid).text('Here is your answer.')
}, DELAY_MS)
```

  The auto-clear `setTimeout` is `unref`'d in Node.js — a pending clear will not keep your process
  alive on its own. If the socket disconnects before the timer fires, the clear is silently dropped
  (the `sendPresenceUpdate` error is caught and ignored internally).

## Practical pattern: typing indicator inside a message handler

The most common use case is showing a "typing…" indicator before replying to an inbound message.
Call `typing` with an `ms` value that matches how long your handler will actually take, then send
the reply after that same delay:

```typescript

const client = new Client()

client.on('text', async (ctx) => {
  const jid = ctx.roomId
  const THINK_MS = 1500

  // Show "typing…" — auto-clears after THINK_MS
  await client.presence.typing(jid, THINK_MS)

  // Simulate processing time, then reply
  await new Promise((resolve) => setTimeout(resolve, THINK_MS))
  await client.send(jid).text(`You said: ${ctx.text}`)
})
```

For a voice-note bot the same pattern works with `recording`:

```typescript
client.on('text', async (ctx) => {
  const jid = ctx.roomId

  await client.presence.recording(jid, 2000)
  await new Promise((resolve) => setTimeout(resolve, 2000))
  await client.send(jid).audio('https://example.com/reply.ogg', { ptt: true })
})
```

## Presence throttle

  **Built-in spam guard.** Sending presence updates in rapid succession (e.g., calling `typing`
  inside a high-frequency loop) is a known signal that WhatsApp uses to identify bot accounts. The
  `PresenceModule` includes a built-in throttle that silently drops duplicate updates for the same
  `(type, chat)` pair within a configurable window.

  **How it works:** the throttle is keyed per `type + jid`. The first call for a given key goes
  through immediately and records a timestamp. Any subsequent call for the same key within
  `minIntervalMs` milliseconds is dropped silently — the `Promise` resolves without sending. Once
  the window expires, the next call goes through and resets the timestamp.

  **Default:** throttle is **on** with `minIntervalMs: 1000` (1 second). This means calling
  `typing(jid)` in a tight loop sends at most one update per second per chat, regardless of how
  many times you call it.

  Configure via the `presence` option in [Configuration](/configuration):

  ```typescript

  // Tighten the window to 500 ms
  const client = new Client({
    presence: { minIntervalMs: 500 },
  })

  // Disable the throttle entirely (not recommended in production)
  const client2 = new Client({
    presence: { enabled: false },
  })
  ```

  | Option | Type | Default | Description |
  | --- | --- | --- | --- |
  | `enabled` | `boolean` | `true` | Whether the throttle is active. |
  | `minIntervalMs` | `number` | `1000` | Minimum milliseconds between two identical `(type, jid)` updates. |

  If you disable the throttle and drive presence from a hot path, you risk triggering WhatsApp's
  rate-limiting or account restrictions. See [Troubleshooting](/troubleshooting) if your account
  gets flagged.

## Error handling

Presence methods throw `ZaileysAutomationError` on failure. Import the class from `zaileys` to
handle specific codes:

```typescript

const client = new Client()
const jid = '628xxxxxxxxxx@s.whatsapp.net'

try {
  await client.presence.typing(jid)
} catch (err) {
  if (err instanceof ZaileysAutomationError) {
    if (err.code === 'NOT_CONNECTED') {
      console.error('Client must be connected before driving presence.')
    } else if (err.code === 'PRESENCE_FAILED') {
      console.error('Presence update failed at socket level:', err.cause)
    }
  }
}
```

| Code | When it is thrown |
| --- | --- |
| `NOT_CONNECTED` | Any presence method is called before the client has an active socket. |
| `PRESENCE_FAILED` | The underlying socket `sendPresenceUpdate` call throws. The original error is attached as `err.cause`. |

See [Error Handling](/error-handling) for the full `ZaileysAutomationError` reference and general
error-handling patterns.

## See also

- [Automation](/automation) — `client.broadcast()` and `client.scheduleAt()` for bulk and scheduled sends.
- [Configuration](/configuration) — the `presence` ClientOption and all other connection options.
- [Error Handling](/error-handling) — `ZaileysAutomationError` codes and catch patterns.
- [Troubleshooting](/troubleshooting) — what to do if your account gets rate-limited or flagged.
