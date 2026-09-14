# Production

## Contents

- Deployment checklist
- Server sizing
- Media limits
- ffmpeg and sharp
- Docker
- Process managers and restart policy
- Graceful shutdown and health checks
- Logging
- Security defaults
- Runtimes and bundlers
- Hosting a Cloud API server

## Deployment checklist

- One process per session: no replicas, PM2 cluster mode, or overlapping deploys — a second connection
  closes the first with `connection-replaced` and the client stops.
- Session on persistent storage at an absolute path; first link done once, not by a restart loop.
- A restart policy that won't relaunch a bot that needs a human; `SIGTERM` → `await client.disconnect()`.
- `error` and `disconnect` listeners that alert; history in a database store on 512 MB boxes; `media` limits set.

## Server sizing

Measured peaks including ffmpeg children, OS, and ~20% headroom
(https://zaileys.kejaa.id/data/server-sizing#pick-a-server-size):

| Workload | RAM | vCPU |
| --- | --- | --- |
| Text and commands, no media conversion | 256 MB | 1 |
| Text, image stickers, voice notes, an occasional 720p video | 512 MB | 1 |
| Several numbers, 100–200 msg/s, mixed media with 1080p video | 1 GB | 2 |
| Continuous parallel 1080p re-encoding | 2 GB | 2–4 |

Where memory goes:

| Consumer | Cost | Lever |
| --- | --- | --- |
| Idle text bot | 50–65 MB RSS, flat | — |
| `MemoryMessageStore` (the default) | Grows with traffic for 30 days | `SqliteMessageStore` keeps RSS flat; or lower `autoDelete.maxAgeMs` |
| Video re-encode (`new Media(file).video.toMp4()`) | ~121 MB at 720p, ~235 MB at 1080p, per job, independent of length | `media.maxConcurrentFfmpeg` |
| Video thumbnail / `send().audio()` (always transcoded to Opus) | ~51–89 MB / ~18 MB | same |
| `sharp` | ~70 MB once when loaded; full-resolution JPEG of a 48 MP photo +305 MB | `media.maxImagePixels` |
| Each connected WhatsApp Web number | Not measured — Signal sessions and key cache | Fewer numbers per process |

`send().image()`/`.video()`/`.document()` send files unconverted. Four parallel 1080p re-encodes measured 947 MB.
Messages use one thread (~800 msg/s in tests); video-heavy bots need vCPUs more than RAM. On a 256 MB text-only
box add `node --max-old-space-size=96`. Measure `RES` of `node` plus each `ffmpeg` child while converting.

## Media limits

`media` is process-wide: all clients share one ffmpeg pool, and each `Client` constructed overwrites the
fields it sets (`deniedDirs` accumulate). Invalid numbers throw from the constructor
(`invalid media limit maxConcurrent: 0`, or `ZaileysBuilderError` `INVALID_OPTIONS` for `maxBytes`).

| Option | Default | Bounds | Gotcha |
| --- | --- | --- | --- |
| `maxBytes` | 64 MB | Media read from a URL or file path | Buffers you pass aren't capped. Error: `MEDIA_LOAD_FAILED` `… exceeds N bytes` |
| `allowLocalPaths` | `true` | Plain strings treated as file paths | Set `false` when media strings come from users or an LLM; `file:` URLs still work and are still checked |
| `allowPrivateNetwork` | `false` | Fetching loopback, RFC1918, link-local, `localhost`, `*.localhost`, `*.internal` | A hostname check only: `http://minio:9000`, public names resolving to private IPs, and redirects are not blocked |
| `deniedDirs` | `.zaileys` and the `FileAuthStore` directory | Paths media may never be read from | Add the folders of SQLite session files and `.env` files |
| `maxImagePixels` | 50 000 000 | Image decode size | Rejected before decoding: `Image too large to decode safely: WxH`. 12 MP is 4000×3000 |
| `maxConcurrentFfmpeg` | 4 | ffmpeg children at once | 1 on a 512 MB box |
| `maxQueuedFfmpeg` | 64 (min 0) | Jobs waiting for a slot | Beyond it: `ffmpeg queue is full (64 jobs waiting)` |
| `ffmpegQueueTimeoutMs` | 120 000 | Wait for a slot | `ffmpeg job waited more than 120000ms for a slot`; raise it when you lower concurrency |

From `send().audio()`/`.sticker()` those failures arrive as `MEDIA_LOAD_FAILED` prefixed with
`audio() transcode failed:` or `sticker() conversion failed:`. Separately, every ffmpeg run is killed after a
fixed 120 s (`FFmpeg timed out after 120000ms`) and URL downloads time out after 30 s — neither is configurable,
so a slow single-core box can't re-encode long video.

```ts
import { Client, SqliteMessageStore } from 'zaileys'

const client = new Client({
  store: new SqliteMessageStore({ database: '/data/messages.db' }),
  autoDelete: { maxAgeMs: 7 * 24 * 60 * 60 * 1000 },
  media: {
    maxConcurrentFfmpeg: 1,
    ffmpegQueueTimeoutMs: 300_000,
    maxImagePixels: 12_000_000,
    maxBytes: 16 * 1024 * 1024,
    allowLocalPaths: false,
    deniedDirs: ['/data'],
  },
})
```

## ffmpeg and sharp

- Lookup order: `FFMPEG_PATH` / `FFPROBE_PATH`, then the bundled binary from the per-platform
  `@ffmpeg-installer/*` optional dependency (made executable if pnpm or bun skipped its postinstall), then `PATH`.
- The bundled binary silently goes missing — and media fails with `MEDIA_LOAD_FAILED` — when installs use
  `--omit=optional` / `--no-optional`, when `node_modules` is copied from another OS or CPU architecture, or when
  a bundler inlines the installer package. Install inside the target image; only platforms without a bundled
  binary (Termux) need ffmpeg on `PATH`.
- ffmpeg writes temp files to `os.tmpdir()`; a read-only root filesystem needs a writable `/tmp`.
- `sharp` is optional: zaileys loads it if present and falls back to `jimp`. Install it for image-heavy bots
  (faster, but ~70 MB resident). Where it can't build (Termux, some musl images), install with
  `--legacy-peer-deps`, because Baileys lists it as a peer dependency.

## Docker

```dockerfile
FROM node:22-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY dist ./dist
ENV SESSION_DIR=/data
VOLUME ["/data"]
CMD ["node", "dist/bot.js"]
```

- `.dockerignore` must list `node_modules`, `.zaileys`, and `*.db*`: host `node_modules` carry the wrong
  ffmpeg and native builds, and a baked-in session leaks with the image. No `apt-get install ffmpeg`.
- Point `basePath` or the SQLite `database` at a named volume (`SESSION_DIR` above); the default
  `./.zaileys` under `WORKDIR` is wiped with the container. In Compose: `restart: on-failure`,
  `stop_grace_period: 30s`.
- One replica. In Kubernetes use a `Recreate` strategy (or a StatefulSet with one pod), in Swarm
  `update_config.order: stop-first`; rolling updates overlap two processes on one session.
- Terminal QR codes are garbled by `docker logs` and log dashboards. Use `authType: 'pairing'` with
  `phoneNumber`, or `qrTerminal: false` plus the `qr` event rendered somewhere scannable.
- Link once with `docker compose run --rm bot`, stop it, then `docker compose up -d` — never both at once.

## Process managers and restart policy

When the client stops for good — `logged-out`, `forbidden`, `connection-replaced`, or `auth-exhausted` — a
bare bot may have nothing left keeping the event loop alive and exits with code 0. A policy that restarts on
every exit (PM2's default, Docker `always`/`unless-stopped`) then relinks in a loop, and each new process starts
with a fresh `authGuard` budget, so the 5-QR limit no longer protects the number. Make "needs a human" an exit
the manager won't restart, and alert on it:

```ts
import type { DisconnectReasonDomain } from 'zaileys'

const NEEDS_HUMAN: readonly DisconnectReasonDomain[] = ['logged-out', 'forbidden', 'connection-replaced']

client.on('disconnect', ({ reason, willReconnect }) => {
  if (willReconnect || !NEEDS_HUMAN.includes(reason)) return
  console.error(`[${client.sessionId}] stopped: ${reason}; needs attention, not a restart`)
  process.exit(0)
})

client.on('auth-exhausted', ({ kind, attempts }) => {
  console.error(`[${client.sessionId}] no login after ${attempts} ${kind} codes`)
  process.exit(0)
})
```

```yaml
apps:
  - name: shop-bot
    script: dist/bot.js
    exec_mode: fork
    instances: 1
    stop_exit_codes: [0]
    kill_timeout: 15000
    env:
      NODE_ENV: production
      SESSION_DIR: /var/lib/shop-bot
```

```text
[Service]
WorkingDirectory=/opt/shop-bot
ExecStart=/usr/bin/node dist/bot.js
Environment=NODE_ENV=production SESSION_DIR=/var/lib/shop-bot
StateDirectory=shop-bot
User=shopbot
Restart=on-failure
RestartSec=10
TimeoutStopSec=30
```

- PM2: `exec_mode: cluster` or `instances > 1` runs the session twice; `kill_timeout` (default 1.6 s) must
  cover `disconnect()`; `max_memory_restart` kills in-flight conversions — size `media` instead.
- systemd `Restart=on-failure` skips exit 0; `StateDirectory` creates `/var/lib/shop-bot` owned by `User`.

## Graceful shutdown and health checks

zaileys installs no signal handlers. `disconnect()` closes the socket, stops auto-delete, the scheduler, and the
plugin watcher, and closes both stores (the SQLite handle, a pool or Redis client the store created) without
erasing anything. A `pool` or Redis `client` you passed in is yours to close afterwards.

```ts
let stopping = false

async function shutdown(signal: NodeJS.Signals) {
  if (stopping) return
  stopping = true
  setTimeout(() => process.exit(1), 10_000).unref()
  try {
    await client.disconnect()
  } catch (error) {
    console.error(`${signal}: disconnect failed`, error)
  }
  process.exit(0)
}

process.once('SIGTERM', () => void shutdown('SIGTERM'))
process.once('SIGINT', () => void shutdown('SIGINT'))
```

Keep the platform's grace period (`stop_grace_period`, `TimeoutStopSec`, `kill_timeout`) above the timeout.

For a health endpoint, report `client.state` (`connected`, or `reconnecting` as degraded). Use it for readiness
and alerts, not a liveness probe that restarts: `reconnecting` spans backoff (up to 60 s, 5 min when
`rate-limited`) and `qr-pending` needs a human, so restarts only multiply login attempts. An HTTP server also
keeps the process alive after the client stops — exit explicitly as in the restart-policy section.

## Logging

| Channel | Default | Production use |
| --- | --- | --- |
| `statusLog` | `true`: `[zaileys] Connecting…`, `Connected as …`, reconnect and disconnect lines on **stderr**; also filters libsignal's `Closing session:` console noise | Keep on; `false` removes the filter too |
| `logger` | pino, level from `ZAILEYS_DEBUG` (unset → `silent`, `1` → `info`, or a level name) | Set `ZAILEYS_DEBUG=warn` at least: failed credential writes, auto-delete errors, and failed handlers are silent otherwise |

The built-in logger redacts `creds`, key material, `accessToken`, `appSecret`, `verifyToken`, `password`, and
`authorization`. A `logger` you pass replaces it and is handed to Baileys as is — Baileys logs the whole creds
object at `trace` — so keep it at `info` or above, or give your pino logger `redact` paths such as
`['creds', '*.creds', '*.accessToken', '*.appSecret']`.

## Security defaults

| Default | Effect | When it bites |
| --- | --- | --- |
| Media reads inside `.zaileys` and the `FileAuthStore` directory denied | A bot that turns user text into a media path can't send its own `creds.json` | `MEDIA_LOAD_FAILED` `refusing to read … protected directory` for a legitimate file stored there |
| Private-network fetches blocked | Basic SSRF guard for user-supplied URLs | Internal media servers by IP need `allowPrivateNetwork: true` |
| Webhook POSTs require `appSecret` | Unsigned POSTs get `401`; `cloud.allowUnsigned: true` is for local development only | Missing app secret in the deploy env: every message is rejected |
| Secrets redacted in the default logger | Tokens and keys stay out of log shipping | Custom loggers (above) |
| Session files `0600`, dirs `0700` | Other local users can't read the session | A volume owned by another user: `STORE_READ_FAILED` / `STORE_WRITE_FAILED` |
| Plugin hot reload off when `NODE_ENV=production` | Writes to the plugins dir can't execute code | Set `NODE_ENV=production`, or `plugins.watch` is on |

## Runtimes and bundlers

| Runtime | Status | Notes |
| --- | --- | --- |
| Node.js 20+ | Primary, tested | ESM and CJS builds |
| Bun | Runs TypeScript directly | Skips postinstall scripts; zaileys repairs the bundled ffmpeg's execute bit itself |
| Deno 2 | Untested | `import … from 'npm:zaileys'`, `"nodeModulesDir": "auto"`, `--allow-scripts` for `better-sqlite3`; needs net, read/write, env, and run permissions |
| Termux | Untested | `npm install zaileys --legacy-peer-deps`, `pkg install ffmpeg`; `better-sqlite3` needs `pkg install python make clang` |
| Serverless / edge functions | WhatsApp Web: no. Cloud API: yes, on a Node.js runtime | WhatsApp Web needs a long-lived socket and a writable session; edge runtimes lack `node:crypto` |

Bundling the bot into one file (esbuild, tsup, ncc) breaks binary lookup: keep `zaileys`, `@ffmpeg-installer/*`,
`@ffprobe-installer/*`, `better-sqlite3`, and `sharp` external and installed in `node_modules`.

## Hosting a Cloud API server

- **Public HTTPS, raw body**: the signature is an HMAC of the exact bytes, so mount `client.webhook()` before any
  JSON parser and don't let a proxy re-encode bodies: https://zaileys.kejaa.id/recipes/cloud-servers#why-express-needs-the-raw-body
- **Fast responses are built in**: the handler returns `200 OK` right after verifying and parsing, without
  awaiting your handlers, so Meta doesn't retry. Throwing handlers are logged, not returned as `500`.
- **Serverless**: create the client with `autoConnect: false`, start `connect()` once at module load, and
  `await` that same promise in `POST` — sends throw `client not connected` until the token check passes. Hosts
  that freeze the function after the response can cut off replies still running in handlers. Pattern:
  https://zaileys.kejaa.id/cloud/webhook#avoid-a-cold-start-race-on-serverless
- **Memory**: auto-delete doesn't run on the Cloud API; a long-running server on the default memory store grows
  until restart. Use a database store with your own pruning timer.
- **Several numbers on one Meta app**: route by `metadata.phone_number_id` to one client per number, or every
  client handles every message.
