# Debug Session: 405 Connection Closed

## Symptom
The Baileys WhatsApp client is failing to connect and throws a "405 - Closed" connection failure immediately upon initialization with a warning that the session may be used by another device/instance.

**When:** During connection initialization (`bun dev` running `examples/test.ts`) after migrating `jetdb` to `lmdb`.
**Expected:** The client connects successfully and restores the session.
**Actual:** The client throws a 405 Connection Closed error.

## Evidence
- The Auth config (`src/Auth/state.ts`) was recently migrated to use LMDB.
- `jetdb` previously used `BufferJSON` from `baileys` to serialize and deserialize the keys and creds properly, converting buffers to and from base64 strings or arrays in JSON.
- `lmdb` uses `msgpack` by default. It's highly probable the deserialized keys/creds format does not match what Baileys expects (e.g. nested Buffers being restored as `Uint8Array` rather than `Buffer`, or `proto` properties missing).

## Resolution

**Root Cause:** WhatsApp periodically deprecates old Web API versions. The connection configuration in `src/Config/socket.ts` neglected to fetch or provide a dynamic `version` param arrays to `makeWASocket`, causing Baileys to fallback to a hardcoded version. WhatsApp actively refused this outdated version by immediately firing a `405 Connection Closed` exception on any new pairing attempts.
**Fix:** Modified `src/Auth/creds.ts` to asynchronously call `fetchLatestBaileysVersion()` and feed the retrieved `{ version }` property dynamically into the socket configuration `makeWASocket({...config, version })`. Also verified and fixed the LMDB transition encoding by tightly coupling `BufferJSON.replacer` and `reviver`.
**Verified:** Ran `bun dev` after purging old sessions and successfully generated standard WhatsApp pairing QR codes instead of connection closures.
**Regression Check:** Verified compilation via `pnpm build` assuring type compatibility isn't compromised.
