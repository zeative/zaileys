# Bots: commands, middleware, plugins, and automation

## Contents

- WhatsApp Web only
- Turn commands on
- Register commands
- Arguments and flags
- The command context
- Blocked, failed, and unknown commands
- Middleware
- Owners and banned users
- Plugins
- Broadcast
- Scheduled sends
- Auto-delete, calls, and presence
- Error codes

## WhatsApp Web only

Commands, middleware, plugins, `broadcast()`, `scheduleAt()`, and auto-delete all need the WhatsApp Web
connection. The command dispatcher only attaches once a Baileys socket exists, plugins load on the Web
`connect`, and `broadcast()` checks for that socket. On `provider: 'cloud'` nothing errors at registration —
handlers just never run, `broadcast()` rejects with `client not connected`, and scheduled jobs fail when due
until they are dropped. On the Cloud API, parse text yourself with the exported `parseCommand(text, prefixes)`
inside a `text` handler.

## Turn commands on

| Rule | Why it matters |
| --- | --- |
| `commandPrefix` is required (`'/'` or `['/', '!']`) | Without it the dispatcher never attaches; empty strings are dropped, so `''` also means off |
| Commands match the `message` event, not `text` | A media caption such as `/sticker` on a photo runs the command; `ctx.media` holds the file |
| The prefix is a literal `startsWith` | A `.` prefix also catches `...`; pick a character people rarely start messages with |
| `ignoreMe` defaults to `true` | Commands sent from the bot's own number are ignored — test from a second account |
| Old (`isOld`) messages are not filtered | Drop them in middleware if replayed messages must not re-run commands |

## Register commands

`client.command(spec, handler)` returns the client. A string spec is `'name|alias|alias'`; a space makes a
subcommand (`'note add'`) and the longest registered name wins (`/note add milk` → `ctx.args` `['milk']`).
Names are lowercased, arguments keep their case. Register once at startup — inside a `connect` handler the
first reconnect throws `DUPLICATE_COMMAND`. The object form adds metadata and guards:

```ts
client.command(
  { name: 'kick', aliases: ['remove'], description: 'Remove mentioned members', usage: '<@member>', category: 'admin', admin: true, cooldown: 10 },
  async (ctx) => {
    if (ctx.roomId === null || ctx.mentions.length === 0) return
    await ctx.client.group.removeMember(ctx.roomId, ctx.mentions)
    await ctx.reply(`Removed ${ctx.mentions.length} member(s).`)
  },
)
```

| Guard | Behaviour |
| --- | --- |
| `group` / `private` | Checked first; blocked as `group-only` / `private-only` |
| `admin` | Implies `group`. Fetches the group's metadata on **every** run (no cache) and compares the sender namespace-aware; a failed lookup counts as not admin. It checks the sender, not the bot |
| `cooldown` (seconds) | Per command per sender, in a process-wide LRU (10 000 entries, 1-hour TTL): lost on restart, and anything above 3600 s effectively caps at an hour |

Guards run before middleware. `client.commands()` returns every command's `name`, `aliases`, and metadata for
a help menu (skip `hidden: true`). `client.unregisterCommand(anyName)` removes the command and its aliases.

## Arguments and flags

| Typed after the name | Result |
| --- | --- |
| `hello world` | `args: ['hello', 'world']` |
| `"hello world"` or `'hello world'` | `args: ['hello world']`; `\` escapes inside quotes only |
| `--force` (last token) | `flags: { force: true }` |
| `--env=prod` or `--env prod` | `flags: { env: 'prod' }` |
| `--force app1` | `flags: { force: 'app1' }` — a flag swallows the next non-flag word, so put boolean flags last |
| `{"a":1}` | `json: { a: 1 }` and the token also stays in `args`; only the first valid JSON token counts |

`ctx.raw` is the full text including the prefix; `ctx.command` is always the canonical name, even for an alias.

## The command context

`ctx` is the `MessageContext` (sender, `roomId`, `mentions`, `media`, `citation`, …) plus:

| Member | Behaviour |
| --- | --- |
| `ctx.reply(text, opts?)` | Quotes the command message and inherits its disappearing timer; resolves the sent key |
| `ctx.send(to?)` | Builder to `to`, else `roomId ?? senderId`; inherits the chat's disappearing timer |
| `ctx.react(emoji)` | Reacts to the command message |
| `ctx.edit(text)` | Edits the **last `ctx.reply()`** of this invocation. Messages sent with `ctx.send()` don't count. Throws `NO_SENT_MESSAGE` before a reply; uses `client.edit()`, so WhatsApp Web only |
| `ctx.client` | The client, for handlers in other files |

## Blocked, failed, and unknown commands

zaileys never answers these by itself, and the default logger is silent, so a throwing handler vanishes unless
something listens. The dispatcher catches every handler and middleware failure, wraps it in
`ZaileysCommandError` (`HANDLER_ERROR`, or `MIDDLEWARE_ERROR` as thrown), and either emits `command-error` —
listening takes ownership — or logs `command dispatch failed`, visible only with `ZAILEYS_DEBUG=error` or a
custom `logger`. Command errors never crash the process; plain `client.on()` handlers can.

```ts
import { ZaileysCommandError } from 'zaileys'

client.on('command-error', ({ command, error, ctx }) => {
  const cause = error instanceof ZaileysCommandError ? error.cause : error
  console.error(`/${command} failed:`, cause)
  ctx.reply('Something went wrong.').catch(() => undefined)
})

client.on('command-blocked', ({ reason, retryIn, ctx }) => {
  const text = reason === 'cooldown' ? `Wait ${retryIn}s and try again.` : `Not allowed here (${reason}).`
  ctx.reply(text).catch(() => undefined)
})
```

`command-not-found` (`{ command, message }`) fires only while a listener exists, never for a bare prefix.

## Middleware

`client.use(mw)` appends; middleware runs in insertion order for matched commands that passed their guards.
Code after `await next()` runs once the handler finishes. Return without `next()` to stop the command.
Calling `next()` twice throws `MIDDLEWARE_ERROR`. A handler error passes back out through each `await next()`
unchanged, so a middleware `try/catch` sees it; rethrow to keep `command-error` informed. `client.unuse(fn)`
needs the same function reference, so name middleware you may remove. Plugin middleware loads after the
connection opens, so it runs after startup middleware, and moves to the end on every reload.

## Owners and banned users

`citation: { authors, banned }` only powers `msg.citation.authors()` / `banned()` (async). zaileys enforces
nothing: banned users still trigger events and commands until middleware checks. Array entries match
namespace-aware — a bare number means a phone JID, device suffixes are ignored, and a phone entry never matches
a sender addressed by LID. Use a function for anything else.

```ts
import { Client, type Middleware } from 'zaileys'

const client = new Client({
  commandPrefix: '/',
  citation: { authors: ['6281234567890'], banned: (sender) => sender.startsWith('62800') },
})

const OWNER_ONLY = new Set(['restart', 'broadcast'])
const access: Middleware = async (ctx, next) => {
  if (ctx.isOld || (await ctx.citation.banned())) return
  if (OWNER_ONLY.has(ctx.command) && !(await ctx.citation.authors())) {
    await ctx.reply('Owner only.')
    return
  }
  await next()
}
client.use(access)
```

## Plugins

`plugins: { dir, watch, pattern, ignore, onError }` loads every file under `dir` (default `./plugins`,
resolved from the process working directory) once the WhatsApp Web connection opens. Each file default-exports
one `definePlugin({...})`; the plugin's `name` is the command, and its handler key is `message` — not
`command` or `handler`.

```ts
import { definePlugin } from 'zaileys'

export default definePlugin({
  name: 'dice',
  aliases: ['roll'],
  description: 'Roll a die',
  cooldown: 3,
  message: async (ctx) => {
    const sides = Number(ctx.args[0] ?? 6)
    await ctx.reply(`You rolled ${Math.ceil(Math.random() * sides)}`)
  },
  groupJoin: async (event, plugin) => {
    try {
      await plugin.client.send(event.groupId).text('Welcome!')
    } catch (error) {
      plugin.logger?.error(error, 'welcome failed')
    }
  },
  setup(plugin) {
    plugin.command({ name: 'dice stats', description: 'Roll history' }, async (cmd) => {
      await cmd.reply('No rolls yet.')
    })
    const timer = setInterval(() => undefined, 60_000)
    return () => clearInterval(timer)
  },
})
```

| Behaviour | Detail |
| --- | --- |
| Categories | The first subfolder under `dir` becomes `category` for object specs; files in the root and string specs get none |
| Event methods | camelCase of every inbound event except `message` (`groupJoin`, `pollVote`, …). Guards don't apply, and they aren't awaited — catch inside or the rejection can kill the process |
| `setup(plugin)` | Extra commands, middleware, listeners (`plugin.on` / `once`). Return a teardown. If it throws, its registrations are undone and the plugin is skipped |
| Unload | Reverse-order cleanup of everything registered through the plugin context, then `onUnload()` |
| `watch` default | `NODE_ENV !== 'production'`. Enabled in production it logs a warning: anyone who can write to `dir` runs code, and every reload leaks the old module |
| Hot reload | Saves within 150 ms batch; only the plugin file reloads — imported helpers stay cached; module state resets |
| Skipped files | Names starting with `_` and `.d.ts`; setting `ignore` replaces that default |
| `.ts` plugins | Imported as-is: need `tsx`/Bun, or point `dir` at compiled `.js` |
| Failures | Import error or no `name`: `plugin: import failed; skipped` plus `onError`. Duplicate plugin name: skipped. Name clashing with an existing command: `DUPLICATE_COMMAND` inside setup, logged as `plugin: setup failed; skipped`, **not** passed to `onError` |

Plugins stay loaded across reconnects and unload on `client.disconnect()`. They run with full process
access — load only trusted files. Details: https://zaileys.kejaa.id/bots/plugins#reload-plugins-while-the-bot-runs

## Broadcast

`client.broadcast(jids, build, { rateLimitPerSec, retry, onProgress })` sends one-to-one messages (not a
WhatsApp broadcast list) sequentially through a token bucket: the first `rateLimitPerSec` (default 5) go at once,
then one per `1/rate` s.

```ts
const recipients = ['6281111111111@s.whatsapp.net', '120363041234567890@g.us']
const result = await client.broadcast(recipients, (b) => b.text('Closed on Friday.'), {
  rateLimitPerSec: 2,
  retry: { maxRetries: 2, backoffMs: (attempt) => attempt * 2_000 },
  onProgress: (done, total, to, ok) => console.log(`${done}/${total} ${to} ${ok ? 'sent' : 'failed'}`),
})
for (const failure of result.failed) console.error(failure.jid, failure.error.message)
```

- Resolves `{ sent: string[], failed: { jid, error }[] }` and never rejects for a single recipient.
- Rejects up front with `ZaileysBuilderError` `INVALID_OPTIONS` (`client not connected`) before the socket
  exists, and with `RATE_LIMIT_INVALID` for a rate ≤ 0. A mid-run disconnect shows up in `failed`.
- Pass full JIDs; a bare string that isn't a JID is resolved as a username, one lookup per send. Duplicates are
  not removed.
- With `retry`, each attempt also has a 120 s deadline (`QUEUE_TIMEOUT`).
- `build` can't see the recipient: for per-person text, loop `client.send()` behind `await limiter.acquire()`
  on a `new RateLimiter({ perSec })`. Pacing doesn't prevent bans — only message people who opted in.

## Scheduled sends

```ts
const handle = await client.scheduleAt(new Date(Date.now() + 60 * 60_000), (b) =>
  b.to('6281234567890@s.whatsapp.net').text('Your appointment starts in 10 minutes.'),
)
handle.cancel()
```

| Behaviour | Detail |
| --- | --- |
| Recipient | The builder starts empty: call `.to(fullJid)` first. A missing `.to()` isn't caught until the job fires |
| Evaluation | Content is captured immediately (media read now). Invalid `Date`, a builder that throws or sets nothing, albums, and interactive or relayed content reject with `SCHEDULE_INVALID` |
| Past dates | Fire as soon as possible; delays past ~24.8 days are re-armed in chunks, so they don't fire early |
| Pacing | `scheduleRateLimitPerSec` (default 1, `0` = off) smooths due backlogs; it doesn't affect other sends |
| Failure at fire time | Logged `scheduled send failed; re-arming for retry`, retried after 30 s × attempt; after 5 failed attempts it logs `scheduled send failed repeatedly; dropping the job` and deletes it. An outage longer than ~5 minutes at fire time loses the job |
| Persistence | Only stores implementing `saveScheduledJob` / `listScheduledJobs` / `deleteScheduledJob` survive a restart — of the built-ins, only Convex. Otherwise jobs live in memory and are re-armed on reconnect |
| Handles | No list or cancel-by-id API: keep the handle |
| Recurring | Not supported; schedule the next run yourself or use a job runner calling `client.send()` |

## Auto-delete, calls, and presence

`autoDelete` prunes zaileys' **own message store**; it never deletes anything on WhatsApp. It is on by default
(`maxAgeMs` 30 days, sweep every `intervalMs` 60 s, first sweep one interval after connect), starts on the
WhatsApp Web `connect`, and stops on `disconnect()`. Pruned messages can't be found by `msg.replied()`,
`client.forward()`, or poll-vote decoding. `false` disables it, and the default memory store then grows
forever. A custom store without `pruneMessages` or `deleteMessage` disables the sweeper
(`AUTO_DELETE_UNSUPPORTED`, logged once).

```ts
import { Client } from 'zaileys'

const client: Client = new Client({
  autoDelete: { maxAgeMs: 7 * 24 * 60 * 60 * 1000, maxPerChat: 500 },
  autoRejectCall: {
    enabled: true,
    allow: ['6281234567890'],
    onReject: async (call) => {
      await client.send(call.from).text('This number does not take calls. Please send a message.')
    },
  },
  presence: { minIntervalMs: 2_000 },
})
```

- `autoRejectCall: true` rejects every call. The object form does nothing without `enabled: true`. `allow` uses
  the same namespace-aware matching as `citation`; a throwing predicate counts as not allowed. Reject manually
  with `client.rejectCall(call)` (Web only).
- `presence` throttling (on, 1 s) silently drops a repeated `typing`/`recording`/`online` for the same chat
  inside the window. `client.presence.typing(jid, ms)` sends `paused` after `ms`.

## Error codes

| Code | Class | Cause | Fix |
| --- | --- | --- | --- |
| `DUPLICATE_COMMAND` | `ZaileysCommandError` | A name or alias is already registered; thrown by `client.command()` | Register once at startup, or `unregisterCommand()` first |
| `INVALID_COMMAND_NAME` | `ZaileysCommandError` | Empty spec or empty alias (`'a\|\|b'`) | Give every segment a name |
| `HANDLER_ERROR` | `ZaileysCommandError` | The handler threw; original on `error.cause` | Listen to `command-error` |
| `MIDDLEWARE_ERROR` | `ZaileysCommandError` | A middleware threw, or called `next()` twice | Call `next()` at most once |
| `NO_SENT_MESSAGE` | `ZaileysCommandError` | `ctx.edit()` before any `ctx.reply()` | Reply first |
| `NOT_CONNECTED` | `ZaileysCommandError` | Declared but not thrown by the command layer; offline sends from a handler fail with `ZaileysBuilderError` `INVALID_OPTIONS` | Check `client.state === 'connected'` |
| `RATE_LIMIT_INVALID` | `ZaileysAutomationError` | Broadcast or `RateLimiter` rate ≤ 0 | Use a positive rate |
| `SCHEDULE_INVALID` | `ZaileysAutomationError` | See Scheduled sends | Valid `Date`, `.to()`, one text or media message |
| `NOT_CONNECTED` | `ZaileysAutomationError` | `presence` or `rejectCall` without a socket | Wait for `connect` |
