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
