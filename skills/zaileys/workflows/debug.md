# Workflow: debug a zaileys bot

Goal: find the cause from evidence, fix it at the source, and prove the fix — not a retry, a longer timeout, or
a disabled safety check.

```text
- [ ] 1. Get the exact symptom
- [ ] 2. Classify it
- [ ] 3. Confirm the cause in the code
- [ ] 4. Fix the cause
- [ ] 5. Verify and explain
```

## 1. Get the exact symptom

Collect before guessing: the full error (class, `code`, message, and `cause` chain), the `[zaileys] …` status
lines around it, the provider, the installed version (`node_modules/zaileys/package.json`), and when it
started (after a deploy, an upgrade, a restart, a new number). If the user has no error, have them run with
`ZAILEYS_DEBUG=1` and add `client.on('error', …)`: failed handlers, failed commands, and failed automatic
connects are silent by default.

Run the doctor on the project; many causes show up as a config smell:

```bash
node <this skill's directory>/scripts/doctor.mjs . --json
```

## 2. Classify it

Look the code or message up in the errors reference, then place it:

| Class of problem | Typical signals | Usual root cause |
| --- | --- | --- |
| Login and session | QR every restart, `logged-out`, `connection-replaced`, `auth-exhausted`, "session looks invalid" | Session not persisted (cwd, container without volume, changed `sessionId`), two processes on one session, login loop |
| Bot doesn't reply | No error, handler never runs | Wrong event (`text` vs captions/buttons), testing from the bot's own account, handler threw silently, Cloud webhook not subscribed to `messages` |
| Send fails | `ZaileysBuilderError` codes, `username "…" not found`, `client not connected` | `msg.chatId` as destination, sending before `connect`, bad media source, provider can't send that content |
| Cloud webhook | `401 invalid signature`, `401 webhook requires appSecret`, `403` on verification | Parsed body instead of raw, missing/wrong app secret, verify token mismatch |
| Meta refused | `(code 131047)`, `132000`, `131026`, `190` in the cause | 24-hour window closed, template parameters, recipient can't receive, expired token |
| Crash or memory | Unhandled rejection exit, OOM, ffmpeg queue errors, `sticker() conversion failed` | Async handler without try/catch, in-memory history on a small server, too many ffmpeg jobs, ffmpeg without libwebp |
| Stores | `STORE_NOT_AVAILABLE`, `STORE_WRITE_FAILED` | Driver package not installed, database unreachable, read-only disk |

## 3. Confirm the cause in the code

Find the line that produces the symptom (`grep` for the call in the stack trace, the handler, the client
options) and check it against the installed type definitions. State the cause in one sentence you can point
to in the code before changing anything. If two causes are plausible, check the cheaper one first and say
which evidence would tell them apart.

## 4. Fix the cause

Fixes that look like solutions but make things worse:

- Retrying or reconnecting in a loop, or calling `connect()` from a `disconnect` handler — more login attempts
  get numbers restricted.
- Turning off `authGuard`/`operationGuard`, or setting `allowUnsigned: true` in production.
- Deleting the session folder for problems that aren't session corruption — the user has to link again.
- Catching and ignoring the error so the symptom disappears.
- Retrying a `131047` send — only an approved template or a new customer message opens the window.

Make the smallest change that removes the cause, in the project's style.

## 5. Verify and explain

Run `npx tsc --noEmit` and the doctor again. Describe how the user confirms the fix in their environment (the
log line they should now see, the message to send), what they must do themselves (redeploy, re-link once,
re-subscribe the webhook), and — briefly — why it happened so it doesn't come back.
