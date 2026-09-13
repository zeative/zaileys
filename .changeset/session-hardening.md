---
'zaileys': minor
---

Security hardening — sessions, authorization, and denial of service.

**Sessions are no longer destroyed by transient failures.** Six independent paths could silently
erase stored credentials; all are closed.

- Only an explicit logout erases credentials. `bad-session` (500), `connection-replaced` (440) and
  `forbidden` (403) no longer wipe: baileys uses 500 as its catch-all for unknown stream and
  WebSocket errors, and 440 means the credentials are valid and in use elsewhere. Restore the old
  behaviour per-reason with `session: { clearAuthOn: [...] }`.
- `connect()` now loads credentials **before** creating the socket. Previously the socket started on
  an empty object, so `routingInfo` was lost on every connect and a slow store (Postgres, Redis,
  Convex, cold start) could make the client register as a brand new device and overwrite a valid
  session. A failed credential read now aborts the connect instead of continuing unauthenticated.
- `RedisMessageStore.clear()` and `ConvexMessageStore.clear()` are scoped to their own keys. Both
  defaulted to the `zaileys` namespace shared with the auth store, so clearing chat history logged
  the bot out.
- The key store handed to baileys no longer exposes a `clear()` that erases credentials.
- A QR for an already-registered session, or a credentials update that would de-register one, is
  refused instead of replacing the session.
- Erasing now quarantines first: `AuthCredsStore` gains optional `backupCreds()` / `readBackupCreds()`,
  implemented by every bundled adapter. Credential writes are `fsync`ed before rename and a corrupt
  `creds.json` recovers from the newest snapshot.

**Authorization**

- `citation.banned()` / `citation.authors()` received an unresolved `@lid` while `senderId` was
  resolved to a phone number, so a ban list written as documented never matched. Identity
  comparisons are now namespace-aware everywhere (`citation`, group admin checks, call allow lists);
  a LID never satisfies an entry written as a phone number.
- Self-only protocol messages (`HISTORY_SYNC_NOTIFICATION`, `APP_STATE_SYNC_KEY_SHARE`,
  `LID_MIGRATION_MAPPING_SYNC`, `PEER_DATA_OPERATION_REQUEST_RESPONSE_MESSAGE`) from a remote sender
  are dropped. The guard existed but never inspected the protocol type.
- `MessageContext` gains `verified`. A quoted context rebuilt from the sender's own `contextInfo`
  is `verified: false` — its text, author and `isFromMe` are a claim, not proof.

**Denial of service** — each reachable from a single inbound message

- Removed quadratic scans in link extraction, inline-entity parsing and markdown tables. A 60 KB
  message previously froze the event loop for ~6.5s per pass.
- Mention resolution is capped per message, batched, and cached instead of fanning out unbounded.
- Images are rejected by declared dimensions before decoding, media reads are byte-capped, and
  ffmpeg/ffprobe children now time out, get killed, and run with bounded concurrency.
- Every cache keyed by remote input is now size- and TTL-bounded; presence timers are cancelled on
  disconnect.

**Credential exposure**

- Media loading refuses paths resolving inside the auth directory, so a bot echoing user input can
  no longer be made to send its own `creds.json`. Local paths otherwise keep working; opt into
  strict mode with `loadMedia(src, { allowLocalPaths: false })` (not yet exposed as a `Client` option).
- Private, loopback and link-local addresses are blocked for media fetches by default.
- Credential files and directories are created `0600` / `0700`.
- Redis connection errors no longer echo the password; pino redacts credentials and tokens; the
  Cloud API access token is only sent to Meta's own media origins.
- `sessionId` is validated, so it cannot escape the auth directory into a recursive delete.

**Breaking-ish defaults** (each has an escape hatch)

- Webhook POSTs without a verified signature are refused. Set `cloud.allowUnsigned: true` for local
  development, or configure `appSecret` (recommended).
- Plugin hot-reload (`plugins.watch`) defaults off when `NODE_ENV === 'production'`.
- `sessionId` must match `/^[A-Za-z0-9_-]{1,64}$/`.

**Load, deployment and multi-tenancy**

- `PostgresAuthStore`, `PostgresMessageStore`, `SqliteAuthStore` and `SqliteMessageStore` accept
  `tablePrefix`, so several sessions can share one database. Without it the original table names are
  used, so existing data needs no migration.
- Inbound backpressure: messages waiting on LID resolution are bounded (`maxPendingResolutions`,
  default 256) behind a weighted queue (`maxQueuedResolutions`, default 20000). In-flight lookups are
  shared, queued messages resolve only their sender, and overflow is shed and logged — never delivered
  with an unresolved identity. A 4k mention-bomb burst dropped from ~1 GB to ~190 MB peak heap; a slow
  resolver case from 436 MB to 113 MB with every message still delivered.
- `connect()` works again after `disconnect()`: stores closed by `disconnect()` are reopened through a new
  optional `reopen()` implemented by every bundled adapter.
- ffmpeg/ffprobe: a bundled binary left non-executable by a skipped postinstall (pnpm 10, bun) is
  repaired or replaced by the one on `PATH`; `FFMPEG_PATH`/`FFPROBE_PATH` are honoured; ffprobe no longer
  switches binaries depending on job order.
- The ffmpeg job queue is bounded (64 waiting, 120 s wait) and hands slots over without overshooting the
  concurrency limit. Worst-case video latency p95 fell from 366 s to 96 s.
- New `media` client option: `maxBytes`, `allowLocalPaths`, `allowPrivateNetwork`, `deniedDirs`,
  `maxImagePixels`, `maxConcurrentFfmpeg`, `maxQueuedFfmpeg`, `ffmpegQueueTimeoutMs`. A `FileAuthStore`
  directory, including a custom `basePath`, is always protected from media reads.
- Convex `pruneMessages` parses the full chat jid, so `chatFilter` and `maxPerChat` see the right chat.
- Animated stickers work on ffmpeg 7+ again: the pipeline no longer passes `-vsync`, which those versions
  reject (exit 8). `-fps_mode` was not a replacement because the bundled ffmpeg 4.4 lacks it; the `fps`
  filter already fixes the rate, and output was verified byte-identical without the option on ffmpeg
  4.x and 9.0 for constant and variable frame rate inputs.
