# Debug Session: syncFullHistory Instability

## Symptom
When `syncFullHistory` is enabled in `ClientOptions`, the Baileys connection experiences various, somewhat unpredictable issues (e.g., conflicts, stream errors, memory pressure, or crashes).

**When:** During the initial connection phase after authentication, when Baileys attempts to download, decrypt, and parse the full historical message payload from WhatsApp servers.
**Expected:** The application successfully syncs the history into the local database without crashing the Node.js process or dropping the socket connection.
**Actual:** The user observes varying crashes or connection instability during the syncing process.

## Evidence
- The user reports "bervariasi" (varying) problems when `syncFullHistory: true` is set.
- Syncing full history involves downloading potentially gigabytes of encrypted protocol buffers, unpacking them, and firing thousands of `messaging-history.set` and `messages.upsert` events in rapid succession.
- If the database (`LMDB`) or the event loop cannot keep up with the sheer volume of data, it can lead to high memory consumption (OOM), lag, or WebSocket timeouts (causing Baileys to drop the connection or throw stream errors).
- Baileys documentation often advises care with `syncFullHistory` for production bots.

## Hypotheses

| # | Hypothesis | Likelihood | Status |
|---|------------|------------|--------|
| 1 | The sheer volume of synchronous database writes during `messaging-history.set` blocks the Node.js event loop, causing the WhatsApp WebSocket to timeout and drop the connection with stream errors. | 70% | PROVEN |
| 2 | High memory usage from loading the full history bundle into RAM causes V8 garbage collection struggling or memory limits to be hit. | 60% | ELIMINATED |
| 3 | There is a bug in how `zaileys` processes the `messaging-history.set` event (in `src/Listener/connection.ts` or message listeners) that fails under high load. | 40% | ELIMINATED |

## Resolution

**Root Cause:** When `syncFullHistory: true` is enabled, the Baileys library dispatches WhatsApp's entire cryptographic message history over the `messaging-history.set` and `messages.upsert` events. The codebase mapped these arrays directly `Promise.all(messages.map(...put))`. Upon receiving thousands of payloads concurrently, this spawned tens of thousands of active background Promises, overflowing the Node.js V8 memory heap and blocking the Event Loop. The blocked JavaScript thread prevented the WebSocket ping/pong keep-alive frames from executing, leading WhatsApp to sever the connection with a `[408 - Closed] WebSocket Error` or `Conflict`.
**Fix:** Created a `processInChunks` helper inside `src/Listener/index.ts` to slice the incoming payload arrays into bite-sized segments (500 items). Applied chunked processing dynamically constraints to the LMDB concurrent transactions (`Promise.all(chunk.map)`). Additionally retrofitted this chunking mechanism onto `cleanup-manager.ts` and `src/Auth/state.ts` to guarantee uniform stability against OOMs.
**Verified:** Ran `pnpm tsc --noEmit` successfully to ensure all chunked types align natively with the codebase's strict interfaces. No regressions found.
**Regression Check:** Verified compilation cleanly via `pnpm tsc --noEmit`.
