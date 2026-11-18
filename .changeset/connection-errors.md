---
'zaileys': minor
---

Connection-lifecycle failures now throw `ZaileysConnectionError` with a stable `code`, exported from `'zaileys'` with its `ConnectionErrorCode` type: `INVALID_OPTIONS` (invalid `sessionId`, pairing without or with a malformed `phoneNumber`, out-of-range `reconnect` options, an empty QR string), `CREDS_READ_FAILED`, `CONNECT_ABORTED`, `CONNECTION_CLOSED`, `SESSION_PROTECTED` (on the `error` event), `STORE_NOT_REOPENABLE`, `PAIRING_FAILED`, and `INVALID_STATE`. Messages are unchanged and the class extends `Error`, so `instanceof Error` and message matching keep working. Store failures during the credential read still surface as `ZaileysStoreError`; any other `readCreds()` failure becomes `ZaileysConnectionError` `CREDS_READ_FAILED` (`failed to read stored credentials; aborting connect to protect the session`) with the original on `cause`.
