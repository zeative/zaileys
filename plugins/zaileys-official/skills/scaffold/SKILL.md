---
name: scaffold
description: >-
  Use when the user wants to CREATE, BUILD, SCAFFOLD, or SET UP a NEW zaileys WhatsApp bot
  or project from scratch ("buatkan bot WhatsApp", "create a whatsapp bot", "set up zaileys",
  "new bot project", "bikin bot zaileys"). Generates a complete, runnable zaileys project —
  entry file, package.json, .env.example, and run steps — from a short spec.
---

# Scaffold a zaileys Bot Project

Generate a complete, runnable zaileys WhatsApp bot from a short spec. zaileys is a TypeScript
WhatsApp library over baileys; import is always `import { Client } from 'zaileys'`. Output a main
TS entry, `package.json`, `.env.example`, and run instructions. Target: Node 20+, ESM
(`"type": "module"`).

## WORKFLOW

1. **Ask ONLY the gaps.** If the user already stated a choice, skip it. Otherwise ask, with defaults:
   - **Auth**: `qr` (default) or `pairing` (needs a `phoneNumber`, E.164 digits, no `+`).
   - **Storage**: `file` (default, zero-config) / `memory` / `sqlite` / `postgres` / `redis` / `convex`.
   - **Features** (pick any): `echo`, `slash-commands`, `interactive-buttons`, `broadcast`.
   Keep it to one short round of questions. Assume defaults if the user says "just make it work".
2. **Generate the project.** Produce these files, filled in per the choices:
   - `bot.ts` — `Client` construction (chosen auth + storage), `qr`/`pairing-code`/`connect`/`disconnect`
     handlers, graceful shutdown, plus the chosen feature handlers.
   - `package.json` — `"type": "module"`, deps (`zaileys` + right optional peer dep), a `start` script, `engines.node >= 20`.
   - `.env.example` — every env var the entry reads.
   - `.gitignore` — at minimum `.zaileys`, `node_modules`, `.env`.
3. **Give run steps.** Install command, env setup, run command, scan-QR / enter-pairing-code note.
4. **Apply the golden rules** (below) to every generated file.
5. Point the user to deeper docs for customization (end of this file).

## GOLDEN RULES (always)

- **Register handlers synchronously right after `new Client()`** — `autoConnect` defaults `true` and
  schedules `connect()` in a microtask, so listeners must be attached in the same tick.
- **Send only inside a `connect`/message/command handler.** `send()`/`broadcast()` throw
  `ZaileysBuilderError` ("client not connected") before the socket opens.
- **One content method per builder**, then optional modifiers, then `await`:
  `await client.send(jid).text('hi')`. Awaiting yields a `WAMessageKey` (`key.id`).
- **Env-based config** — never hardcode numbers, tokens, or DB URLs; read `process.env[...]`.
- **Correct JIDs** — user `628xxx@s.whatsapp.net`, group `xxx@g.us`. Strip to digits before comparing.
- **Pairing requires `phoneNumber`** (E.164 digits, no `+`) or `connect()` rejects.
- **Broadcast must be rate-limited** (`rateLimitPerSec`, default 5) and called inside a handler.
- **`.env` and `.zaileys/` are secrets** — always gitignore them.

## STORAGE MATRIX

| Choice | Peer dep to install | Construction (in `Client({...})`) |
| --- | --- | --- |
| `file` (default) | none | omit `auth`, or `auth: new FileAuthStore({ basePath: './.zaileys/auth/bot' })` |
| `memory` | none | `auth: new MemoryAuthStore(), store: new MemoryMessageStore()` (no persistence) |
| `sqlite` | `better-sqlite3` | `auth: new SqliteAuthStore({ database: './auth.db' }), store: new SqliteMessageStore({ database: './history.db' })` |
| `postgres` | `pg` | `auth: new PostgresAuthStore({ connectionString }), store: new PostgresMessageStore({ connectionString })` |
| `redis` | `redis` | `auth: new RedisAuthStore({ url, namespace: 'wa-auth' }), store: new RedisMessageStore({ url, namespace: 'wa-store' })` |
| `convex` | `convex` | `auth: new ConvexAuthStore({ url, namespace: 'wa-auth' }), store: new ConvexMessageStore({ url, namespace: 'wa-store' })` |

Auth (session) and message store are independent. Default store is `MemoryMessageStore` (RAM only).
Only Convex persists scheduled jobs. Give Redis/Convex auth + store **distinct namespaces**.

## CANONICAL TEMPLATES

### `bot.ts` — full echo + command + button + broadcast (trim to chosen features)

```typescript
import { Client, type Middleware } from 'zaileys'

const digitsOf = (jid: string): string => (jid.split(/[:@]/)[0] ?? '').replace(/\D/g, '')

// --- Auth (qr default). For pairing, swap to the block in the comment below. ---
const client = new Client({
  sessionId: process.env['SESSION_ID'] ?? 'bot',
  // authType: 'pairing', phoneNumber: process.env['PHONE_NUMBER'] ?? '',  // pairing variant
  // storage: pass `auth`/`store` here per the STORAGE MATRIX
  commandPrefix: ['/', '!'], // enables client.command(); drop this if no slash-commands
})

// --- Lifecycle (always) ---
client.on('qr', ({ qrString }) => console.log('Scan QR:', qrString))
client.on('pairing-code', ({ code }) => console.log('Enter in WhatsApp:', code)) // pairing only
client.on('connect', ({ me }) => console.log('Connected as', me.id))
client.on('disconnect', ({ reason, willReconnect }) => {
  console.log('Disconnected:', reason, willReconnect ? '(reconnecting)' : '')
})

// --- Feature: echo ---
client.on('text', async (msg) => {
  if (msg.isFromMe) return
  await msg.react('👀')
  await msg.reply(`Echo: ${msg.text}`)
})

// --- Feature: slash-commands (requires commandPrefix above) ---
const logging: Middleware = async (ctx, next) => {
  console.log(`[cmd] ${ctx.command} from ${ctx.senderId} args=${ctx.args.join(',')}`)
  await next() // call exactly once
}
client.use(logging)

client.command('ping', async (ctx) => {
  await ctx.reply('pong')
})

client.command('help|h', async (ctx) => {
  await ctx.reply('Commands: /ping, /help, /menu')
})

// --- Feature: interactive-buttons ---
client.command('menu', async (ctx) => {
  await client.send(ctx.roomId ?? ctx.senderId).buttons(
    [
      { id: 'yes', text: 'Yes' },
      { id: 'no', text: 'No' },
      { type: 'url', text: 'Docs', url: 'https://github.com/zeative/zaileys' },
    ],
    { title: 'Menu', text: 'Pick one', footer: 'zaileys' },
  )
})

const buttonActions: Record<string, (jid: string) => Promise<unknown>> = {
  yes: (jid) => client.send(jid).text('You said yes!'),
  no: (jid) => client.send(jid).text('Maybe next time.'),
}
client.on('button-click', async (ctx) => {
  await buttonActions[ctx.buttonId]?.(ctx.sender.jid)
})

// --- Feature: broadcast (owner-triggered, rate-limited) ---
const OWNER = digitsOf(process.env['OWNER'] ?? '')
client.command('broadcast', async (ctx) => {
  if (!OWNER || digitsOf(ctx.senderId) !== OWNER) return
  const text = ctx.args.join(' ') || 'Announcement from zaileys.'
  const recipients = (process.env['BROADCAST_TO'] ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
  const result = await client.broadcast(recipients, (b) => b.text(text), {
    rateLimitPerSec: 5,
    onProgress: (done, total, jid, ok) => console.log(`[${done}/${total}] ${jid} ${ok ? 'ok' : 'fail'}`),
  })
  await ctx.reply(`Sent ${result.sent.length}, failed ${result.failed.length}`)
})

// --- Graceful shutdown (always) ---
const shutdown = async (sig: string): Promise<void> => {
  console.log(`\n${sig} — shutting down`)
  try {
    await client.disconnect() // client.logout() to also clear the session
  } finally {
    process.exit(0)
  }
}
process.on('SIGINT', () => void shutdown('SIGINT'))
process.on('SIGTERM', () => void shutdown('SIGTERM'))
```

### Pairing auth variant (replace the `new Client({...})` call)

```typescript
const client = new Client({
  sessionId: process.env['SESSION_ID'] ?? 'bot',
  authType: 'pairing',
  phoneNumber: process.env['PHONE_NUMBER'] ?? '', // E.164 digits, no '+'
})
```

### Storage variant (example: SQLite — import + pass to `Client`)

```typescript
import { Client, SqliteAuthStore, SqliteMessageStore } from 'zaileys'

const client = new Client({
  auth: new SqliteAuthStore({ database: process.env['SQLITE_AUTH'] ?? './auth.db' }),
  store: new SqliteMessageStore({ database: process.env['SQLITE_STORE'] ?? './history.db' }),
})
```

### `package.json`

```json
{
  "name": "zaileys-bot",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "engines": { "node": ">=20.0.0" },
  "scripts": {
    "start": "tsx bot.ts",
    "dev": "tsx --watch bot.ts"
  },
  "dependencies": {
    "zaileys": "^4.0.0"
  },
  "devDependencies": {
    "tsx": "^4.21.0",
    "@types/node": "^24.0.0",
    "typescript": "^5.6.0"
  }
}
```

Add the chosen peer dep to `dependencies` (and its types to `devDependencies` where relevant):
`"better-sqlite3": "^11.0.0"` (+ `@types/better-sqlite3`), `"pg": "^8.11.0"` (+ `@types/pg`),
`"redis": "^4.7.0"`, or `"convex": "^1.0.0"`. `file`/`memory` need none.

### `.env.example`

```bash
# Session name → auth folder ./.zaileys/auth/<SESSION_ID>
SESSION_ID=bot

# Pairing auth only (E.164 digits, no '+'); omit for QR
# PHONE_NUMBER=6281234567890

# Owner number for /broadcast guard (E.164 digits)
# OWNER=6281234567890
# Comma-separated recipient JIDs for /broadcast
# BROADCAST_TO=6281111111111@s.whatsapp.net,6282222222222@s.whatsapp.net

# Storage URLs (only for the adapter you chose)
# DATABASE_URL=postgres://user:pass@localhost:5432/zaileys   # postgres
# REDIS_URL=redis://localhost:6379                           # redis
# CONVEX_URL=https://your.convex.cloud                       # convex
```

### `.gitignore`

```bash
node_modules
.zaileys
.env
*.db
```

## RUN STEPS (emit, adapted to chosen package manager)

```bash
npm install                 # add the peer dep too if you chose sqlite/postgres/redis/convex
cp .env.example .env        # then edit values
npm start                   # runs `tsx bot.ts`
```

Then on your phone: **WhatsApp → Settings → Linked Devices → Link a Device**. For QR, scan the code
printed in the terminal. For pairing, choose **Link with phone number instead** and type the printed
8-character code. The session is saved under `./.zaileys/auth/<SESSION_ID>/`, so subsequent runs skip
auth. To force a fresh login, delete that folder.

## VERIFY BEFORE HANDOFF

- Exactly one content method chained per `send()`/`reply()` builder.
- `commandPrefix` present iff slash-commands were requested.
- `pairing-code` handler and `phoneNumber` present iff pairing was chosen.
- Chosen storage's import, construction, peer dep, and env var all line up.
- No secrets hardcoded; `.env`/`.zaileys` gitignored.

## DEEPER CUSTOMIZATION

- Cookbook + diagnostics: `references/recipes.md`; full API surface: `references/api.md` (in the
  `assist` skill).
- Error classes from `zaileys`: `ZaileysBuilderError`, `ZaileysCommandError`, `ZaileysDomainError`,
  `ZaileysAutomationError`, `ZaileysStoreError`.
- Live full docs (single file): <https://zeative.github.io/zaileys/llms-full.txt>.


## Live docs (fetch for the latest)

These are authoritative and kept in sync with the code — **fetch them** when you need more detail, the newest API, or to verify before answering (do not guess when unsure):

- **Docs site:** <https://zeative.github.io/zaileys/>
- **Full docs as one file (best for LLMs):** <https://zeative.github.io/zaileys/llms-full.txt>
- **Per-topic pages:** `/getting-started` · `/installation` · `/configuration` · `/client` · `/events` · `/sending-messages` · `/media` · `/interactive` · `/rich-responses` · `/commands` · `/automation` · `/storage` · `/error-handling` · `/runtimes` · `/troubleshooting` · `/api-reference` (e.g. <https://zeative.github.io/zaileys/sending-messages>)
