# Workflow: review a zaileys bot

Goal: a short, ranked list of real problems with file and line, each with why it matters and the fix. A review
that invents problems costs the user more than one that misses a style nit, so report only what you can point
to in the code.

```text
- [ ] 1. Map the bot
- [ ] 2. Run the doctor
- [ ] 3. Walk the checklist
- [ ] 4. Report
```

## 1. Map the bot

Find every `new Client(` and note provider, `sessionId`, stores, guards, `commandPrefix`, plugins, and
`media` options. List the handlers, commands, plugins, scheduled or bulk sends, and (Cloud) the webhook route.
Read `node_modules/zaileys/package.json` for the version the code runs against.

## 2. Run the doctor

```bash
node <this skill's directory>/scripts/doctor.mjs . --json
```

Every `error` or `warn` it reports with a `where` is a finding to verify in the code and include. It doesn't
understand control flow, so the checklist below still matters.

## 3. Walk the checklist

Severity is about what happens in production. Check each item against the code; skip items that don't apply.

**Critical — the bot breaks, loses data, or endangers the number**

- Ban risk (WhatsApp Web): `authGuard` or `operationGuard` disabled; loops of `client.send()` to many chats
  instead of `client.broadcast()`; bulk group creation, joins, or member adds; cold messaging lists of numbers.
- Login loops: `client.connect()` inside a `disconnect` handler, process managers restarting a bot that exits
  on `auth-exhausted`, multiple processes or replicas on one session (`connection-replaced`).
- Session loss: session folder not persisted in containers, `MemoryAuthStore` in production, `sessionId` that
  changes between runs or fails validation.
- Crashes: async handlers without `try`/`catch` around network or media work (unhandled rejection exits Node).
- Cloud webhook: missing `appSecret`, `allowUnsigned: true`, JSON-parsed body on the webhook route, secrets
  hardcoded instead of read from the environment.

**High — features fail or messages go astray**

- `msg.chatId` used as a destination; `roomId` used without `?? msg.senderId`.
- Features the provider lacks (commands, plugins, broadcast, groups on the Cloud API; templates on WhatsApp
  Web) — they throw or silently never run.
- Cloud: free-form sends to customers who may be outside the 24-hour window (reminders, shipping notices)
  instead of `client.sendTemplate()`; the builder's `.template()` mistaken for a Meta template; no
  `message-status` handling for failed deliveries.
- Listening to `text` for input that arrives as captions, button taps, or list picks.
- No `error` listener, so connection failures are invisible.

**Medium — cost, memory, and operability**

- In-memory message history on a small server or long uptime; no `media` limits when converting video;
  database store drivers missing from `package.json`.
- Session files, `.env`, or SQLite files not in `.gitignore` or copied into Docker images.
- No graceful shutdown (`client.disconnect()` on SIGTERM).

## 4. Report

Order findings by severity. For each: `file:line`, what is wrong, what it causes in production, and the fix
(a one-line code change where possible). Group repeated instances of one problem into one finding. If the code
is sound, say so plainly and mention at most a couple of optional improvements, labelled as optional. Don't
change code during a review unless the user asks.
