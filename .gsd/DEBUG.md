# Debug Session: Libsignal "Closing Session" output

## Symptom
User reports an error originating from `libsignal`:
```
Closing session: SessionEntry { ... }
✖  [Internal - Closed] Process Terminated
```

**When:** Occurs when the Baileys socket receives a message (e.g., `!ping`) and updates encryption sessions.
**Expected:** Silent evaluation and reply.
**Actual:** A massive `SessionEntry` JSON configuration payload is logged into the terminal, confusing the user into believing an unhandled compilation error or segfault emerged from `libsignal-node`.

## Resolution
**Root Cause:**
1. `@whiskeysockets/libsignal-node` hardcodes `console.info("Closing session:", session);` at `src/session_record.js:273`. When an internal PreKey or encryption session is gracefully rotated or expired, this log is abruptly pushed into stdout.
2. The user sees this massive object dump, assumes the server crashed, and hits `Ctrl+C` (`SIGINT`).
3. Overriding `SIGINT`, our `zaileys` client cleanup hook catches the exit, closes the Baileys socket gracefully, and outputs `[Internal - Closed] Process Terminated`.

The server **never actually crashed**. `baileys` and `libsignal` were functioning flawlessly.

**Fix:**
I will notify the user explaining that this is not an error but a noisy internal log. If needed, we can monkey-patch Node's `console.info` across Zaileys to suppress `libsignal` logs matching `Closing session:`.
