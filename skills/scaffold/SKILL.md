---
name: scaffold
description: >-
  Use when the user wants to CREATE, BUILD, SCAFFOLD, or SET UP a NEW zaileys WhatsApp bot
  or project from scratch ("buatkan bot WhatsApp", "create a whatsapp bot", "set up zaileys",
  "new bot project", "bikin bot zaileys"). Generates a complete, runnable zaileys project with a
  clean, layered `src/` structure that is identical across sessions for the same spec.
---

# Scaffold a zaileys Bot Project

Generate a complete, runnable zaileys WhatsApp bot from a short spec. zaileys is a TypeScript
WhatsApp library over baileys; import is always `import { Client } from 'zaileys'`. Target: Node 20+,
ESM (`"type": "module"`). Output a **layered `src/` project** (never a single flat `bot.ts`),
`package.json`, `tsconfig.json`, `.env.example`, `.gitignore`, and run steps.

## EXISTING-CODEBASE PRECEDENCE (check this FIRST, before any structure decision)

**Existing project conventions always win over this skill's canonical layout.** Before generating
anything, inspect the target directory:

1. **Greenfield** (empty dir, or no `src/` / `package.json`): apply the canonical PROJECT STRUCTURE
   CONTRACT below verbatim.
2. **Brownfield** (a project already exists — `package.json`, `src/`, established folders, or even
   empty-but-intentional dirs the developer pre-created like `src/prompts/`, `src/tools/`): **conform
   to what is there.** Map each role onto the existing folders and **match their conventions** — folder
   names, file naming (kebab vs camel), barrel (`index.ts`) vs flat, import style, default vs named
   exports. Do NOT rename, move, or re-layer their files; do NOT impose this skill's folder names.
3. **Partial / incomplete**: keep everything that exists as-is; only ADD the missing pieces, placed and
   named in the existing project's style. Use the canonical mapping below only to decide *what role a
   new file plays*, then express that role using their conventions.

How to detect intended structure: an empty folder a developer created (`src/prompts/`, `src/tools/`,
`src/pkg/`) is a deliberate signal — put that role's files there, do not invent a parallel location.
When the existing convention for a given role is genuinely ambiguous (e.g. an empty folder whose purpose
you cannot infer from its name), ASK rather than guess.

## DETERMINISM CONTRACT

Within each regime above, output is reproducible — a pure function of **(spec + the project's existing
conventions)**. Greenfield: **same (use case + features + auth + storage) → byte-for-byte same tree,
every session, every developer.** Brownfield: same spec + same existing layout → same placement, every
session. Never improvise structure per session; decide from the existing project first, then the tables
below.

Fixed conventions (never vary):

- **Layered by role**: `config/` (env), `client.ts` (Client factory), `handlers/` (event wiring),
  `commands/` (slash commands), `services/` (external integrations), `features/` (domain logic),
  `lib/` (pure helpers).
- **`src/index.ts` is the only file with top-level execution** — it builds the client and wires
  everything. Every other module exports functions only; **no side effects at import time.**
- **File names**: lowercase, kebab-case (`message.ts`, `connection.ts`, `openai.ts`, `ai-agent.ts`).
- **Wiring exports**: handler/command modules export `registerXxx(client)`; services export factory
  functions; features export plain logic functions. No default exports.
- **The skeleton is ALWAYS generated in full** (see below), even for a one-line echo bot. Features only
  ADD files to the fixed skeleton; they never collapse or rename it.

## WORKFLOW

0. **Scan the target directory first.** Determine greenfield vs brownfield per EXISTING-CODEBASE
   PRECEDENCE above. List existing folders/files (including intentionally pre-created empty dirs). This
   decides whether you follow the canonical layout or conform to what is already there.
1. **Ask ONLY the gaps** (one short round; assume defaults if "just make it work"):
   - **Use case** — what the bot is for. Drives which feature modules exist. Common: `echo`,
     `ai-agent`, `slash-commands`, `interactive-buttons`, `broadcast`. Use cases vary widely and are
     not limited to AI; map any new one onto the placement table (services = external I/O, features =
     domain logic, handlers = WhatsApp events).
   - **Auth**: `qr` (default) or `pairing` (needs `phoneNumber`, E.164 digits, no `+`).
   - **Storage**: `file` (default) / `memory` / `sqlite` / `postgres` / `redis` / `convex`.
   - For `ai-agent`: **provider** (OpenAI / Anthropic / Gemini / OpenAI-compatible) and whether to
     include conversation memory + tool calling.
2. **Resolve the file set** from PROJECT STRUCTURE CONTRACT below (skeleton + one row per chosen feature).
3. **Generate** every resolved file from CANONICAL TEMPLATES, filled per the choices.
4. **Apply the GOLDEN RULES** to every file.
5. **Emit RUN STEPS** and point to deeper docs.

## PROJECT STRUCTURE CONTRACT

### Always-present skeleton (generate verbatim, every project)

```
src/
├─ index.ts              entry: build client → registerHandlers → (registerCommands) → shutdown hooks
├─ client.ts             createClient(): Client factory; wires auth/store/authType/commandPrefix
├─ config/
│  └─ env.ts             typed env accessor: env(key, fallback?) + required-var checks
├─ handlers/
│  ├─ index.ts           registerHandlers(client): calls every register* in this dir, synchronously
│  └─ connection.ts      registerConnectionHandlers(client): qr / pairing-code / connect / disconnect
└─ lib/
   └─ jid.ts             digitsOf() + jid helpers
```

Root files (always): `package.json`, `tsconfig.json`, `.env.example`, `.gitignore`.

### Feature placement table (add ONLY the rows for chosen features — fixed paths)

| Feature | Files added | Wiring |
| --- | --- | --- |
| `echo` (any text reply) | `src/handlers/message.ts` → `registerMessageHandlers(client)` | called by `handlers/index.ts` |
| `slash-commands` | `src/commands/index.ts` → `registerCommands(client)`; one `src/commands/<name>.ts` per command | `index.ts` calls `registerCommands`; set `commandPrefix` in `client.ts` |
| `interactive-buttons` | `src/handlers/buttons.ts` → `registerButtonHandlers(client)`; menu lives in a `src/commands/menu.ts` | `handlers/index.ts` |
| `broadcast` | `src/features/broadcast.ts` → `runBroadcast(client, …)` | invoked from a command in `src/commands/broadcast.ts` |
| `ai-agent` | `src/services/<provider>.ts` (client factory); `src/features/prompt.ts` (`SYSTEM_PROMPT` constant); `src/features/ai-agent.ts` (`askAgent`); `src/features/memory.ts` (working memory); `src/features/tools.ts` (defs + runner, if tool calling) | `message.ts` calls `askAgent` |

Rules: storage construction always lives **inside `client.ts`** (not a new folder). Pure, side-effect-free
helpers go in `src/lib/`. If a use case needs a new external integration (HTTP API, DB, queue), it is a
new `src/services/<name>.ts`; its business logic is a new `src/features/<name>.ts`. Keep this mapping —
that is what makes output reproducible.

## GOLDEN RULES (always)

- **Handlers attach synchronously.** `index.ts` does: `const client = createClient(); registerHandlers(client)`
  with `registerHandlers`/`registerCommands` being **synchronous** functions (they call `client.on(...)`
  directly). `autoConnect` defaults `true` and schedules `connect()` in a microtask, so all top-level
  sync wiring in `index.ts` runs first. Never `await` before attaching listeners.
- **Send only inside a handler/command/connect callback.** `send()`/`broadcast()` throw
  `ZaileysBuilderError` ("client not connected") before the socket opens.
- **One content method per builder**, then optional modifiers, then `await`:
  `await client.send(jid).text('hi')`. Awaiting yields a `WAMessageKey` (`key.id`).
- **Env only via `config/env.ts`** — never read `process.env` elsewhere; never hardcode tokens/URLs/numbers.
- **Env is for secrets / connection / deploy toggles only** (API keys, DB URLs, model name, tunable limits).
  Static application content — system prompts, persona, fixed copy/messages — is a **code constant**
  (e.g. `src/features/prompt.ts`), NEVER an env var or an `env(key, '…long default…')` fallback.
- **Correct JIDs** — user `628xxx@s.whatsapp.net`, group `xxx@g.us`. Use `lib/jid.ts` to strip to digits before comparing.
- **Pairing requires `phoneNumber`** (E.164 digits, no `+`) or `connect()` rejects.
- **Broadcast must be rate-limited** (`rateLimitPerSec`, default 5) and called inside a handler.
- **`.env` and `.zaileys/` are secrets** — always gitignore them.
- **No inline comments in generated code.** Names and file boundaries do the explaining; keep it terse.

## STORAGE MATRIX (construction goes inside `client.ts`)

| Choice | Peer dep | Construction |
| --- | --- | --- |
| `file` (default) | none | omit `auth`, or `auth: new FileAuthStore({ basePath: './.zaileys/auth/bot' })` |
| `memory` | none | `auth: new MemoryAuthStore(), store: new MemoryMessageStore()` (no persistence) |
| `sqlite` | `better-sqlite3` | `auth: new SqliteAuthStore({ database }), store: new SqliteMessageStore({ database })` |
| `postgres` | `pg` | `auth: new PostgresAuthStore({ connectionString }), store: new PostgresMessageStore({ connectionString })` |
| `redis` | `redis` | `auth: new RedisAuthStore({ url, namespace: 'wa-auth' }), store: new RedisMessageStore({ url, namespace: 'wa-store' })` |
| `convex` | `convex` | `auth: new ConvexAuthStore({ url, namespace: 'wa-auth' }), store: new ConvexMessageStore({ url, namespace: 'wa-store' })` |

Auth and message store are independent. Default store is `MemoryMessageStore` (RAM only). Only Convex
persists scheduled jobs. Give Redis/Convex auth + store **distinct namespaces**.

## CANONICAL TEMPLATES

Generate every skeleton file + one block per chosen feature. Trim feature blocks the spec did not request.

### `src/config/env.ts` (skeleton — always)

```typescript
import 'dotenv/config'

export const env = (key: string, fallback?: string): string => {
  const value = process.env[key] ?? fallback
  if (value === undefined) throw new Error(`Missing env: ${key}`)
  return value
}

export const envNumber = (key: string, fallback: number): number => {
  const raw = process.env[key]
  return raw === undefined ? fallback : Number(raw)
}
```

### `src/lib/jid.ts` (skeleton — always)

```typescript
export const digitsOf = (jid: string): string => (jid.split(/[:@]/)[0] ?? '').replace(/\D/g, '')
```

### `src/client.ts` (skeleton — auth + storage wired here)

```typescript
import { Client } from 'zaileys'
import { env } from './config/env.js'

export const createClient = (): Client =>
  new Client({
    sessionId: process.env['SESSION_ID'] ?? 'bot',
    // authType: 'pairing', phoneNumber: env('PHONE_NUMBER'),   // pairing variant
    // commandPrefix: ['/', '!'],                                // add iff slash-commands
    // auth/store: construct per STORAGE MATRIX, reading URLs via env()
  })
```

Pairing + Postgres example body (swap per choices):

```typescript
import { Client, PostgresAuthStore, PostgresMessageStore } from 'zaileys'
import { env } from './config/env.js'

export const createClient = (): Client => {
  const connectionString = env('DATABASE_URL')
  return new Client({
    sessionId: process.env['SESSION_ID'] ?? 'bot',
    authType: 'pairing',
    phoneNumber: env('PHONE_NUMBER'),
    commandPrefix: ['/', '!'],
    auth: new PostgresAuthStore({ connectionString }),
    store: new PostgresMessageStore({ connectionString }),
  })
}
```

### `src/handlers/connection.ts` (skeleton — always)

```typescript
import type { Client } from 'zaileys'

export const registerConnectionHandlers = (client: Client): void => {
  client.on('qr', ({ qrString }) => console.log('Scan QR:', qrString))
  client.on('pairing-code', ({ code }) => console.log('Pairing code:', code))
  client.on('connect', ({ me }) => console.log('Connected as', me.id))
  client.on('disconnect', ({ reason, willReconnect }) => {
    console.log('Disconnected:', reason, willReconnect ? '(reconnecting)' : '')
  })
}
```

### `src/handlers/index.ts` (skeleton — always; lists every handler module)

```typescript
import type { Client } from 'zaileys'
import { registerConnectionHandlers } from './connection.js'
import { registerMessageHandlers } from './message.js'
// import { registerButtonHandlers } from './buttons.js'   // iff interactive-buttons

export const registerHandlers = (client: Client): void => {
  registerConnectionHandlers(client)
  registerMessageHandlers(client)
  // registerButtonHandlers(client)
}
```

### `src/index.ts` (skeleton — the only file that runs)

```typescript
import { createClient } from './client.js'
import { registerHandlers } from './handlers/index.js'
// import { registerCommands } from './commands/index.js'   // iff slash-commands

const client = createClient()
registerHandlers(client)
// registerCommands(client)

const shutdown = async (sig: string): Promise<void> => {
  console.log(`\n${sig} — shutting down`)
  try {
    await client.disconnect()
  } finally {
    process.exit(0)
  }
}
process.on('SIGINT', () => void shutdown('SIGINT'))
process.on('SIGTERM', () => void shutdown('SIGTERM'))
```

### Feature `echo` — `src/handlers/message.ts`

`client.on('message', …)` is the **umbrella inbound event** — one handler fires for *every* inbound
message type (text/image/video/audio/document/sticker/…). Prefer it over wiring many per-type handlers
when the bot reacts to all messages the same way; use the per-type events (`text`, `image`, …) only when
behavior truly differs by type. The callback context carries `ctx.staticId` — a stable hash of
room+sender — use it as the **per-conversation key** for memory/state instead of building your own.

```typescript
import type { Client } from 'zaileys'

export const registerMessageHandlers = (client: Client): void => {
  client.on('message', async (msg) => {
    if (msg.isFromMe || !msg.text) return
    await msg.react('👀')
    await msg.reply(`Echo: ${msg.text}`)
  })
}
```

### Feature `ai-agent` — message handler + service + feature modules

`src/services/openai.ts` (provider client; swap import/SDK for Anthropic/Gemini/OpenAI-compatible):

```typescript
import OpenAI from 'openai'
import { env } from '../config/env.js'

export const openai = new OpenAI({
  apiKey: env('OPENAI_API_KEY'),
  baseURL: process.env['OPENAI_BASE_URL'],
})

export const AI_MODEL = process.env['OPENAI_MODEL'] ?? 'gpt-4o-mini'
```

`src/features/prompt.ts` (persona — a code constant, NOT env; edit here to change the bot's behavior):

```typescript
export const SYSTEM_PROMPT = `You are a concise, friendly WhatsApp assistant. Use a tool when you need real-time data.`
```

`src/features/memory.ts` (working memory — last N turns per chat; full archive lives in the message store):

```typescript
import { envNumber } from '../config/env.js'

export type Turn = { role: 'user' | 'assistant'; content: string }
const MAX_HISTORY = envNumber('MAX_HISTORY', 16)
const store = new Map<string, Turn[]>()

export const history = (convoId: string): Turn[] => store.get(convoId) ?? []
export const remember = (convoId: string, turn: Turn): void => {
  const log = store.get(convoId) ?? []
  log.push(turn)
  if (log.length > MAX_HISTORY) log.splice(0, log.length - MAX_HISTORY)
  store.set(convoId, log)
}
export const reset = (convoId: string): void => void store.delete(convoId)
```

`src/features/tools.ts` (tool defs + runner; include only if tool calling chosen):

```typescript
import type { ChatCompletionTool } from 'openai/resources/chat/completions'

export const tools: ChatCompletionTool[] = [
  {
    type: 'function',
    function: {
      name: 'get_current_time',
      description: 'Current date/time. Use when asked about time or date.',
      parameters: {
        type: 'object',
        properties: { timezone: { type: 'string', description: 'IANA tz, default Asia/Jakarta' } },
      },
    },
  },
]

export const runTool = async (name: string, args: Record<string, unknown>): Promise<unknown> => {
  switch (name) {
    case 'get_current_time': {
      const timezone = typeof args['timezone'] === 'string' ? args['timezone'] : 'Asia/Jakarta'
      return { timezone, now: new Intl.DateTimeFormat('id-ID', { dateStyle: 'full', timeStyle: 'long', timeZone: timezone }).format(new Date()) }
    }
    default:
      return { error: `unknown tool: ${name}` }
  }
}
```

`src/features/ai-agent.ts` (the agent loop):

```typescript
import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions'
import { AI_MODEL, openai } from '../services/openai.js'
import { history } from './memory.js'
import { SYSTEM_PROMPT } from './prompt.js'
import { runTool, tools } from './tools.js'

const MAX_TOOL_ROUNDS = 5

export const askAgent = async (convoId: string, userText: string): Promise<string> => {
  const messages: ChatCompletionMessageParam[] = [
    { role: 'system', content: SYSTEM_PROMPT },
    ...history(convoId),
    { role: 'user', content: userText },
  ]
  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const res = await openai.chat.completions.create({ model: AI_MODEL, messages, tools, tool_choice: 'auto' })
    const choice = res.choices[0]?.message
    if (!choice) return 'No response from model.'
    messages.push(choice)
    const calls = choice.tool_calls ?? []
    if (calls.length === 0) return choice.content ?? '(empty)'
    for (const call of calls) {
      if (call.type !== 'function') continue
      let parsed: Record<string, unknown> = {}
      try { parsed = JSON.parse(call.function.arguments || '{}') } catch { parsed = {} }
      const output = await runTool(call.function.name, parsed)
      messages.push({ role: 'tool', tool_call_id: call.id, content: JSON.stringify(output) })
    }
  }
  return 'Too many tool steps; try a simpler question.'
}
```

`src/handlers/message.ts` (ai-agent variant — replaces the echo version):

```typescript
import type { Client } from 'zaileys'
import { askAgent } from '../features/ai-agent.js'
import { remember, reset } from '../features/memory.js'

export const registerMessageHandlers = (client: Client): void => {
  client.on('message', async (msg) => {
    if (msg.isFromMe || !msg.text) return
    const convoId = msg.staticId
    const room = msg.roomId ?? msg.senderId
    const input = msg.text.trim()
    if (input.toLowerCase() === '/reset') {
      reset(convoId)
      await msg.reply('Memory cleared. 🧹')
      return
    }
    if (!input) return
    try {
      await msg.react('🤖')
      await client.presence.typing(room)
      const answer = await askAgent(convoId, input)
      remember(convoId, { role: 'user', content: input })
      remember(convoId, { role: 'assistant', content: answer })
      await msg.reply(answer)
    } catch (err) {
      console.error('Agent error:', err)
      await msg.reply('Sorry, something went wrong. Try again.')
    }
  })
}
```

### Feature `slash-commands` — `src/commands/`

`src/commands/index.ts`:

```typescript
import type { Client, Middleware } from 'zaileys'
import { registerPing } from './ping.js'
import { registerHelp } from './help.js'

const logging: Middleware = async (ctx, next) => {
  console.log(`[cmd] ${ctx.command} from ${ctx.senderId} args=${ctx.args.join(',')}`)
  await next()
}

export const registerCommands = (client: Client): void => {
  client.use(logging)
  registerPing(client)
  registerHelp(client)
}
```

`src/commands/ping.ts` (one file per command — same shape for every command):

```typescript
import type { Client } from 'zaileys'

export const registerPing = (client: Client): void => {
  client.command('ping', async (ctx) => {
    await ctx.reply('pong')
  })
}
```

### Feature `interactive-buttons` — `src/commands/menu.ts` + `src/handlers/buttons.ts`

`src/commands/menu.ts`:

```typescript
import type { Client } from 'zaileys'

export const registerMenu = (client: Client): void => {
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
}
```

`src/handlers/buttons.ts`:

```typescript
import type { Client } from 'zaileys'

const actions: Record<string, (jid: string, client: Client) => Promise<unknown>> = {
  yes: (jid, client) => client.send(jid).text('You said yes!'),
  no: (jid, client) => client.send(jid).text('Maybe next time.'),
}

export const registerButtonHandlers = (client: Client): void => {
  client.on('button-click', async (ctx) => {
    await actions[ctx.buttonId]?.(ctx.sender.jid, client)
  })
}
```

### Feature `broadcast` — `src/features/broadcast.ts` + `src/commands/broadcast.ts`

`src/features/broadcast.ts`:

```typescript
import type { Client } from 'zaileys'

export const runBroadcast = (client: Client, recipients: string[], text: string) =>
  client.broadcast(recipients, (b) => b.text(text), {
    rateLimitPerSec: 5,
    onProgress: (done, total, jid, ok) => console.log(`[${done}/${total}] ${jid} ${ok ? 'ok' : 'fail'}`),
  })
```

`src/commands/broadcast.ts`:

```typescript
import type { Client } from 'zaileys'
import { env } from '../config/env.js'
import { runBroadcast } from '../features/broadcast.js'
import { digitsOf } from '../lib/jid.js'

export const registerBroadcast = (client: Client): void => {
  client.command('broadcast', async (ctx) => {
    const owner = digitsOf(env('OWNER', ''))
    if (!owner || digitsOf(ctx.senderId) !== owner) return
    const text = ctx.args.join(' ') || 'Announcement from zaileys.'
    const recipients = (process.env['BROADCAST_TO'] ?? '').split(',').map((s) => s.trim()).filter(Boolean)
    const result = await runBroadcast(client, recipients, text)
    await ctx.reply(`Sent ${result.sent.length}, failed ${result.failed.length}`)
  })
}
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
    "start": "tsx src/index.ts",
    "dev": "tsx --watch src/index.ts"
  },
  "dependencies": {
    "dotenv": "^16.4.0",
    "zaileys": "^4.0.0"
  },
  "devDependencies": {
    "tsx": "^4.21.0",
    "@types/node": "^24.0.0",
    "typescript": "^5.6.0"
  }
}
```

Add chosen peer deps to `dependencies` (types to `devDependencies` where relevant): storage —
`better-sqlite3` (+`@types/better-sqlite3`), `pg` (+`@types/pg`), `redis`, `convex`; ai-agent —
`openai` (or `@anthropic-ai/sdk`, `@google/genai`).

### `tsconfig.json`

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "types": ["node"]
  },
  "include": ["src"]
}
```

### `.env.example`

```bash
# Session name → auth folder ./.zaileys/auth/<SESSION_ID>
SESSION_ID=bot

# Pairing auth only (E.164 digits, no '+'); omit for QR
# PHONE_NUMBER=6281234567890

# Storage URLs (only for the adapter you chose)
# DATABASE_URL=postgres://user:pass@localhost:5432/zaileys
# REDIS_URL=redis://localhost:6379
# CONVEX_URL=https://your.convex.cloud

# AI agent (ai-agent use case)
# OPENAI_API_KEY=sk-xxxx
# OPENAI_MODEL=gpt-4o-mini
# OPENAI_BASE_URL=http://localhost:11434/v1
# MAX_HISTORY=16
# (persona/system prompt lives in code: src/features/prompt.ts — not env)

# Broadcast guard
# OWNER=6281234567890
# BROADCAST_TO=6281111111111@s.whatsapp.net,6282222222222@s.whatsapp.net
```

### `.gitignore`

```bash
node_modules
.zaileys
.env
*.db
*.log
```

## RUN STEPS (emit, adapted to chosen package manager)

```bash
npm install                 # add peer deps for chosen storage / ai provider
cp .env.example .env        # then edit values
npm start                   # runs `tsx src/index.ts`
```

Then on the phone: **WhatsApp → Settings → Linked Devices → Link a Device**. For QR, scan the printed
code. For pairing, choose **Link with phone number instead** and type the printed 8-char code. The
session persists (under `./.zaileys/auth/<SESSION_ID>/` for file auth, or in the DB for db adapters),
so later runs skip auth. To force a fresh login, delete the session.

## VERIFY BEFORE HANDOFF

- **Brownfield**: every generated file lands in the existing project's folders and matches its naming/
  import/export conventions; no pre-existing file was renamed, moved, or re-layered; pre-created empty
  dirs were used for their role. (The skeleton checks below apply to greenfield only.)
- The full skeleton exists (`src/index.ts`, `src/client.ts`, `src/config/env.ts`,
  `src/handlers/index.ts`, `src/handlers/connection.ts`, `src/lib/jid.ts`) — even for trivial bots.
- Only `src/index.ts` has top-level execution; every other module exports functions, no import-time side effects.
- File set matches the placement table exactly for the chosen features (no extra/missing/renamed files).
- `handlers/index.ts` and `commands/index.ts` import every register* that was generated.
- Exactly one content method chained per `send()`/`reply()` builder.
- `commandPrefix` in `client.ts` iff slash-commands; `pairing-code` handler + `phoneNumber` iff pairing.
- Chosen storage's import, construction (in `client.ts`), peer dep, and env var all line up.
- No secrets hardcoded; env read only via `config/env.ts`; `.env`/`.zaileys` gitignored.

## v4.4 SURFACE (reach for these before improvising)

Generated bots can use the full current API — don't hand-roll what the library provides:

- **Inbound events** (`client.on(name, …)`): `message` (umbrella — all types), `text`, `image`, `video`,
  `audio`, `document`, `sticker`, `reaction`, `edit`, `delete`, `poll-vote`, `button-click`,
  `list-select`, `mention`, `mention-all`, `group-update`, `group-join`, `group-leave`, `member-tag`,
  `call-incoming`, `call-ended`, `history-sync`, `presence`, `newsletter`; connection: `connect`,
  `disconnect`, `qr`, `pairing-code`, `reconnecting`, `auth-exhausted`, `error`.
- **Conversation key**: `ctx.staticId` (stable `hash(roomId|senderId)`) — use it to key per-conversation
  memory/state, not an ad-hoc `roomId ?? senderId`. For send targets still use `roomId`/`senderId` JIDs.
- **Builder content methods** (one per `send()`): `text`, `image`, `video`, `videoNote`, `audio`,
  `document`, `sticker`, `buttons`, `carousel`, `list`, `poll`, `template`, `location`, `contact`,
  `event`, `groupInvite`, `product`, `requestPhoneNumber`, `sharePhoneNumber`, `limitSharing`, `album`.
  Modifiers: `reply`, `mentions`, `mentionAll`, `disappearing`, `to`. Notes: `event()` won't render in
  1:1 DMs (group/community only); `product()` needs a Business account (`businessOwnerId`);
  `groupInvite()` `expiresAt` is **unix SECONDS**.
- **Typed modules** (prefer over poking the raw socket): `client.profile`
  (`setName/setStatus/setPicture/removePicture/getPicture/getStatus`), `client.chat`
  (`archive/unarchive/pin/unpin/mute/unmute/markRead/markUnread/star/unstar/delete/clear`),
  `client.contact` (`check/exists/save/remove`), `client.business`
  (`profile/catalog/collections/orderDetails/createProduct/updateProduct/deleteProduct`).
- **Message mutations** (take a `WAMessageKey`): `client.pin(key, { duration? })`, `client.unpin(key)`,
  plus `client.setDisappearing(to, seconds)` to toggle disappearing messages for a chat.

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
