# Debug Session: WhatsApp Stale Session Errors

## Symptom
If the `zaileys` server is turned off for a prolonged period (e.g., a week) and then restarted, the existing authentication (`useAuthState`) credentials fail to connect cleanly. The user experiences varying errors (likely 401 Unauthorized, 403, or 405 Conflicts) and is forced to manually delete the `.session` directory to re-trigger the QR code pairing process.

**When:** The server is restarted after a long period of inactivity using an old, previously valid authentication state.
**Expected:** The client should automatically detect that the session is expired/invalid, automatically purge the old credentials, and immediately fetch a new QR code without requiring manual folder deletion by the user.
**Actual:** The client gets stuck in error loops or crashes instead of self-healing the authentication state.

## Evidence
- If WhatsApp Web is inactive for 14 days (or less if the linked device is revoked from the phone), the session is cryptographically invalidated by the WhatsApp servers.
- When Baileys attempts to connect with an invalidated session, it receives specific `DisconnectReason` codes (e.g., `loggedOut`, `connectionClosed`).
- If `src/Listener/connection.ts` does not explicitly trap the `loggedOut` reason and call `removeAuthCreds()`, the bot will infinitely retry connecting with the dead credentials, requiring manual user intervention.

## Hypotheses

| # | Hypothesis | Likelihood | Status |
|---|------------|------------|--------|
| 1 | The `connection.ts` handler incorrectly handles `DisconnectReason.loggedOut` or 401 errors by either ignoring them or attempting to `reload()` infinitely instead of purging the session natively so a new QR can spawn. | 85% | UNTESTED |
| 2 | `removeAuthCreds` in `src/Utils/index.ts` does not cleanly wipe the `.session/{name}` LMDB environment, meaning old broken data persists even if the framework tries to heal it. | 40% | UNTESTED |
