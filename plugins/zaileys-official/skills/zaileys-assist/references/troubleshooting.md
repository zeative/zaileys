# Troubleshooting

Runtime symptom → cause → fix reference for `zaileys`. These are operational/runtime problems (logs, loops, env, native deps). For thrown error classes (`ZaileysBuilderError`, `ZaileysCommandError`, `ZaileysDomainError`, `ZaileysAutomationError`, `ZaileysStoreError`) and how to catch them, see `errors.md`.

Import: `import { Client } from 'zaileys'`. Default auth path: `./.zaileys/auth/<sessionId>` (`sessionId` default `'default'`).

## Status-log strings (exact, for matching)

All friendly lines are prefixed `[zaileys]` and written to **stderr**. Controlled by `statusLog` (default `true`). Source: `src/connection/status-log.ts`.

| Event | Exact line |
| --- | --- |
| connecting | `[zaileys] Connecting to WhatsApp (session: <sessionId>)...` |
| qr | `[zaileys] Scan the QR code above with WhatsApp > Linked devices to authenticate.` |
| pairing-code | `[zaileys] Pairing code: <code> — enter it in WhatsApp > Linked devices > Link with phone number.` |
| connected | `[zaileys] Connected as <id>.` |
| reconnecting | `[zaileys] Connection lost (<reason>). Reconnecting in <s>s (attempt <n>)...` |
| invalid-creds hint (appended on reconnecting) | `[zaileys] The saved session looks invalid or corrupted (connection keeps closing before it authenticates). Delete the auth folder (default: ./.zaileys) and run again to scan a fresh QR / request a new pairing code.` |
| disconnect (fatal/manual only) | `[zaileys] Disconnected (<reason>).` |

Note: on a reconnecting disconnect, `formatConnectionStatus` returns `null` (no `Disconnected` line) — only the `Connection lost ...` line shows.

---

## Connection & session

### QR keeps regenerating / "session looks invalid or corrupted"
- **Symptom:** QR redraws in a loop; the connection authenticates then drops immediately. From attempt 2 onward you see the invalid-creds hint appended to the reconnecting line:
  ```text
  [zaileys] Connection lost (bad-session). Reconnecting in 1.0s (attempt 2)...
  [zaileys] The saved session looks invalid or corrupted (connection keeps closing before it authenticates). Delete the auth folder (default: ./.zaileys) and run again to scan a fresh QR / request a new pairing code.
  ```
- **Cause:** Saved creds are corrupt. The hint fires when `credsLoadedAtConnect && !openedThisRun && attempt >= 2` (creds existed but the socket never reached `open`). `bad-session`/`logged-out`/`connection-replaced`/`forbidden` also auto-clear the auth store on close (`shouldClearAuth`), but a corrupt-on-disk loop can still recur.
- **Fix:** Delete the auth folder and re-auth.
  ```bash
  rm -rf ./.zaileys                  # nuke everything
  rm -rf ./.zaileys/auth/default     # or just one session (replace 'default' with your sessionId)
  ```
  ```powershell
  Remove-Item -Recurse -Force .\.zaileys
  Remove-Item -Recurse -Force .\.zaileys\auth\default
  ```
  Custom session: `new Client({ sessionId: 'mybot' })` → auth lives at `./.zaileys/auth/mybot`.

### Connection keeps closing / reconnect loop
- **Symptom:** Repeated `[zaileys] Connection lost (<reason>). Reconnecting in <s>s (attempt <n>)...`.
- **Cause:** Normal auto-reconnect with exponential backoff + jitter. NOT an error for transient reasons — the library is recovering. `delayMs = min(maxDelayMs, initialDelayMs * 2^(attempt-1)) * (1 ± jitterFactor)`, clamped to `maxDelayMs`. Whether retrying helps depends on the disconnect reason.

  | `reason` (`DisconnectReasonDomain`) | Auto-reconnects? | Meaning |
  | --- | --- | --- |
  | `connection-closed` | Yes | Socket closed; transient |
  | `connection-lost` | Yes | Network dropped; transient |
  | `restart-required` | Yes | WhatsApp asked for a fresh socket |
  | `unavailable-service` | Yes | WhatsApp temporarily unavailable |
  | `multi-device-mismatch` | Yes | Device list out of sync |
  | `bad-session` | Yes — but creds suspect | Triggers the invalid/corrupted hint; auth store auto-cleared on close |
  | `unknown` | Yes | Unmapped close code |
  | `logged-out` | No (fatal) | Device unlinked — re-authenticate |
  | `connection-replaced` | No (fatal) | Another session took over this account |
  | `forbidden` | No (fatal) | Account/number blocked |

  Fatal = `logged-out` / `connection-replaced` / `forbidden` (`isFatalDisconnect`). On fatal the library stops retrying and emits a final `disconnect` with `willReconnect: false`.
- **Fix:** Observe and tune via the `reconnect` option. Defaults (`src/connection/reconnect.ts`): `enabled: true`, `maxAttempts: Infinity`, `initialDelayMs: 1000`, `maxDelayMs: 60000`, `jitterFactor: 0.2`.
  ```typescript
  const client = new Client({
    reconnect: { enabled: true, maxAttempts: 10, initialDelayMs: 1000, maxDelayMs: 30_000, jitterFactor: 0.2 },
  })
  client.on('reconnecting', ({ attempt, delayMs, reason }) => console.log(`retry #${attempt} in ${delayMs}ms (${reason})`))
  client.on('disconnect', ({ reason, willReconnect }) => { if (!willReconnect) console.error(`fatal disconnect: ${reason}`) })
  ```
  - Stuck in `bad-session` loop → delete the auth folder (above); retrying won't fix corrupt creds.
  - `connection-replaced` → same account linked elsewhere; only one socket can hold the session.
  - Set `reconnect: { enabled: false }` to disable auto-reconnect entirely.

### Pairing code rejected / invalid phone number
- **Symptom:** Throws before any code is requested:
  ```text
  Error: phoneNumber is required when authType is "pairing"
  Error: phoneNumber must be E.164 with country code
  ```
  Or WhatsApp rejects the request (wrapped):
  ```text
  Error: failed to request pairing code: <reason from WhatsApp>
  ```
- **Cause:** `validateE164` (`src/connection/pairing-flow.ts`) strips `[ \-()+]` then requires **digits only, 8–15 long**. `connect()` rejects up front if `authType: 'pairing'` and `phoneNumber` is unset. The `failed to request pairing code: ...` wrap means the number passed validation but WhatsApp refused (not on WhatsApp, rate-limited, etc.).
- **Fix:** Pass E.164 with country code, no leading local `0`, no `+`.
  ```typescript
  const client = new Client({
    authType: 'pairing',
    phoneNumber: '628123456789', // Indonesia: 62 + number, drop leading 0
  })
  client.on('pairing-code', ({ code }) => console.log('Enter in WhatsApp > Linked devices > Link with phone number:', code))
  ```
  Common mistakes: leaving the local `0` (`62812...` not `0812...`), number not on WhatsApp, or too many requests in a short window (wait a few minutes).

---

## Module & dependency errors

### "Cannot find module" for an optional peer dep
- **Symptom:** Construction of a DB-backed auth/store adapter throws a `ZaileysStoreError` with code `STORE_NOT_AVAILABLE` (see `errors.md` for catching it). Exact messages per driver:

  | Adapter (auth + store) | Exact message | Install |
  | --- | --- | --- |
  | SQLite (`better-sqlite3`) | `better-sqlite3 belum terpasang. Run: pnpm add better-sqlite3` | `better-sqlite3` |
  | Postgres (`pg`) | `pg is not installed. Run: pnpm add pg` | `pg` |
  | Redis (`redis`) | `redis peer dependency missing. Run: pnpm add redis` | `redis` |
  | Convex (`convex`) | `convex peer dependency missing. Run: pnpm add convex` | `convex` |

- **Cause:** Heavy DB drivers are declared as **optional peer dependencies** (`package.json` → `peerDependenciesMeta`, all `optional: true`) and loaded lazily — install only the one your adapter needs. The default file auth store + memory message store need none.
- **Fix:** Install the matching driver.
  ```bash
  npm install better-sqlite3   # or: pg | redis | convex
  pnpm add better-sqlite3      # pnpm builds better-sqlite3 (listed in onlyBuiltDependencies)
  yarn add better-sqlite3
  bun add better-sqlite3
  ```

### ESM vs `require` errors
- **Symptom:** `ERR_REQUIRE_ESM`, `Cannot use import statement outside a module`, or `require is not defined`.
- **Cause:** File extension / `package.json` `"type"` field disagrees with the import style used. `zaileys` ships both bundles (`dist/index.mjs` + `dist/index.cjs`) resolved via the `exports` map, so both styles work when matched correctly. Requires **Node.js >= 20** (`engines.node`).
- **Fix:** Pick one and stay consistent.
  ```typescript
  // ESM — "type": "module" in package.json, or .mjs / .ts
  import { Client } from 'zaileys'
  ```
  ```javascript
  // CommonJS — plain .js without "type": "module", or .cjs
  const { Client } = require('zaileys')
  ```
  For TypeScript, run with `tsx` (handles both): `npx tsx index.ts`. TS users should set `"module": "NodeNext"` / `"Node16"` / `"Bundler"` so the right `.d.ts` is picked.

### file-type / Node-version mismatch
- **Symptom:** Resolution or syntax errors from `file-type` (used for media MIME detection), or a peer/engine warning demanding a newer Node.
- **Cause:** Newer `file-type` majors (v22+) require **Node 22**. `zaileys` pins `file-type@^21` (installed 21.3.3, `engines.node >=20`), matching zaileys' own `engines.node >=20`. A mismatch usually means a transitive override pulled file-type v22 into a Node 20 runtime.
- **Fix:** Run on Node 20+ (LTS 20/22/24 recommended). If a dependency forced file-type v22 on Node 20, either upgrade Node to 22 or pin `file-type` back to `^21`. Node 18 and below are unsupported.

---

## Runtime quirks

### Bun: `ws` / WebSocket warnings (benign)
- **Symptom:** Bun prints `ws` upgrade-listener / WebSocket warnings while connecting; possibly a one-off `Closing session: <id>` from libsignal.
- **Cause:** Noise from Bun's `ws` compatibility layer, not from `zaileys`. The connection still establishes. `zaileys` already suppresses the libsignal `Closing session:` line on `console.info` (`suppressLibsignalNoise`, installed when `statusLog` is on).
- **Fix:** Ignore them. For a quiet startup keep `ZAILEYS_DEBUG` unset (logging defaults to `silent`) and `statusLog` default.

### Deno: native-dep / npm resolution
- **Symptom:** Media conversion or native storage adapters fail to resolve under Deno.
- **Cause:** Deno's virtual npm cache doesn't give Baileys, storage adapters, and the bundled ffmpeg/ffprobe binaries a real `node_modules` layout or child-process spawning.
- **Fix:** Always use `--node-modules-dir` and materialize deps to disk.
  ```bash
  deno cache --node-modules-dir npm:zaileys
  deno run --node-modules-dir --allow-all bot.ts
  ```
  Minimum perms instead of `--allow-all`: `--allow-read --allow-write` (auth store), `--allow-net` (socket), `--allow-run` (ffmpeg/ffprobe), `--allow-env`.

### Termux (Android): native-dep build
- **Symptom:** `node-gyp` build failures for `better-sqlite3` / `sharp`; missing ffmpeg.
- **Cause:** Prebuilt ARM/Android binaries rarely ship, so native add-ons compile from source and need a toolchain. `zaileys` bundles ffmpeg/ffprobe but falls back to `ffmpeg` on `PATH` when no Android prebuild exists.
- **Fix:** Install Node 20+ and build tools; prefer pure-JS paths if builds fail.
  ```bash
  pkg update && pkg upgrade
  pkg install nodejs-lts python make clang ffmpeg
  npm install zaileys
  ```
  If `better-sqlite3` won't build → use the file or memory storage adapter. If `sharp` won't build → omit it and rely on the bundled `jimp` fallback.

### Media: `sharp` → `jimp` fallback
- **Symptom:** No `sharp` installed, but stickers/images still work (slower).
- **Cause:** `sharp` is **not** a declared dependency — it is probed opportunistically via a hybrid loader (`require('sharp')` then dynamic `import('sharp')`, works in ESM + CJS). If absent or it fails to load, image/sticker processing silently falls back to the bundled pure-JS `jimp`. A missing `sharp` never throws.
- **Fix:** Nothing required. Install only for the faster native pipeline: `npm i sharp`. ffmpeg/ffprobe are bundled (`@ffmpeg-installer/ffmpeg`, `@ffprobe-installer/ffprobe`) with `PATH` fallback.

---

## Behavior & lifecycle

### Messages from self not received (`ignoreMe`)
- **Symptom:** Your bot never sees messages you send from the linked number.
- **Cause:** `ignoreMe` defaults to `true` (`src/client/client.ts`), so the inbound pipeline drops `fromMe` messages to prevent self-reaction loops.
- **Fix:** Set `ignoreMe: false` to process your own outgoing messages (self-note bots, testing from your own number).
  ```typescript
  const client = new Client({ ignoreMe: false })
  ```
  With `ignoreMe: false`, gate replies on sender or a command prefix to avoid an echo loop.

### Event message not visible in 1:1 chats (`event()`)
- **Symptom:** `client.send(jid).event({ name, startAt })` resolves with a message key and throws nothing, but no event card appears in the recipient's chat. Works fine when `jid` is a group.
- **Cause:** WhatsApp event messages are a **group** feature. There is no per-message error — the send succeeds, the client just renders nothing for a 1:1 event. (`event()` itself only validates a non-empty `name` + valid `startAt`; it does not check the target type.)
- **Fix:** Send events to a group JID (`xxx@g.us`). For a 1:1 reminder use a plain `text()` (optionally `buttons()` with a `ReminderButton`) instead.
  ```typescript
  await client.send(groupJid).event({ name: 'Standup', startAt: Date.now() + 3600_000 })
  ```

### groupInvite card shows "failed to get group info" on tap
- **Symptom:** `groupInvite()` sends successfully and the card renders, but tapping it shows "failed to get group info" / the group won't open. Often seen when the bot runs as a companion/linked device or the group is LID-addressed.
- **Cause:** The card itself is **valid** — the underlying invite link resolves fine. WhatsApp's invite-**card** resolution flakes on companion/linked-device sessions and LID-addressed groups; this is a WhatsApp-side rendering limitation, not a malformed payload.
- **Fix:** Share the raw invite link as a fallback (it always works), and make sure `expiresAt` is unix **seconds** (default `now + 3 days`), not milliseconds.
  ```typescript
  await client.send(jid).text(`Join: https://chat.whatsapp.com/${code}`)
  // card form (expiresAt in SECONDS):
  await client.send(jid).groupInvite({ jid: groupJid, code, expiresAt: Math.floor(Date.now() / 1000) + 86_400 })
  ```

### How to log out vs reset the session
- **`disconnect()`** — closes the socket cleanly, **keeps** credentials. Reconnect later without re-scanning. (Cancels the reconnect timer, detaches pipeline/commands/scheduler, closes auth signal + store.)
- **`logout()`** — unlinks the device on WhatsApp's side **and** wipes stored creds: calls `socket.logout()`, `auth.signal.clear()`, `auth.creds.deleteCreds()`. Next run needs a fresh QR / pairing code. Emits a final `disconnect` with `reason: 'logged-out'`, `willReconnect: false`.
  ```typescript
  await client.disconnect() // temporary: stop socket, keep session
  await client.logout()     // permanent: unlink + clear creds
  ```
- **Offline reset** (can't start the app to call `logout()`, e.g. corrupt session): delete the folder manually — the offline equivalent.
  ```bash
  rm -rf ./.zaileys/auth/default   # replace 'default' with your sessionId
  ```
  `logout()` only clears the configured auth store; with a DB adapter (SQLite/Postgres/Redis/Convex) it clears rows there instead of a folder.

### Enable debug logging (`ZAILEYS_DEBUG`)
- **Symptom:** No low-level logs; you want pino diagnostics.
- **Cause:** Logging defaults to `silent` (`resolveLevel` in `src/utils/logger.ts`). `ZAILEYS_DEBUG=1` → `info`; any valid pino level name (`fatal|error|warn|info|debug|trace`) → that level; anything else → `silent`.
- **Fix:**
  ```bash
  ZAILEYS_DEBUG=1 node index.js          # info level
  ZAILEYS_DEBUG=debug npx tsx index.ts   # verbose
  ZAILEYS_DEBUG=trace npx tsx index.ts   # everything
  ```
  ```powershell
  $env:ZAILEYS_DEBUG=1; node index.js
  $env:ZAILEYS_DEBUG="debug"; npx tsx index.ts
  ```
  Or pass a custom `logger` (full or partial — missing methods become no-ops):
  ```typescript
  const client = new Client({
    logger: {
      debug: (...a) => console.debug('[debug]', ...a),
      info:  (...a) => console.info('[info]', ...a),
      warn:  (...a) => console.warn('[warn]', ...a),
      error: (...a) => console.error('[error]', ...a),
      fatal: (...a) => console.error('[fatal]', ...a),
    },
  })
  ```
  The `[zaileys] ...` status lines are **separate** from `ZAILEYS_DEBUG` — they are controlled by `statusLog` (default `true`; set `statusLog: false` to silence). `ZAILEYS_DEBUG` controls only the low-level pino logs.

### Capture a full debug log for a bug report
```bash
ZAILEYS_DEBUG=trace npx tsx index.ts 2>&1 | tee zaileys-debug.log
```
Report at github.com/zeative/zaileys with the log + runtime (Node/Bun/Deno) version.

## ☁️ Cloud provider (official Meta Cloud API)

| Symptom | Cause | Fix |
| --- | --- | --- |
| Webhook GET returns 403 | `hub.verify_token` ≠ your `cloud.verifyToken` | Set the same string in the Meta dashboard **Verify token** and `cloud.verifyToken`. |
| Webhook POST returns 401 | `X-Hub-Signature-256` invalid — the raw body was mutated | Don't run a body-parser before `wa.webhook()`; on Express use `express.raw({ type: '*/*' })`. Verify `cloud.appSecret` matches the app. |
| `on('text')` never fires on cloud | No webhook mounted, or `messages` field not subscribed | Mount `wa.webhook()` on a public URL; subscribe the **`messages`** field in the dashboard. Cloud has **no socket** — `connect()` alone won't deliver inbound (but the webhook works even without `connect()`). |
| Every send fails `(#131047)` | Outside the 24-hour window / recipient never messaged you | Use `wa.sendTemplate(to, name, lang, components)`; free-form only works inside the window. |
| `(#132000) parameters does not match` | Template `parameters` count ≠ `{{n}}` | `wa.cloud.templates.get(name)` to inspect; pass exactly the right params. |
| `ZaileysCloudError code AUTH` / `(#190)` | Token expired (24h quick-start token) | Create a **permanent System User** token. |
| `ZaileysProviderError UNSUPPORTED_ON_CLOUD` | Called a web-only surface (`group`/`newsletter`/`edit`/poll/AIRich…) on cloud | Use the unofficial provider, or the `wa.cloud.*` equivalent. |
| `ZaileysCloudError CONFIG … wabaId` | A `wa.cloud.*` op needs the WhatsApp Business Account id | Set `cloud.wabaId`. |
| Duplicate inbound handling | Meta retried the webhook (you didn't ack in ~10s) | zaileys acks immediately; make your handlers **idempotent** (dedupe by message id). |

Full cloud reference: [cloud.md](cloud.md).
