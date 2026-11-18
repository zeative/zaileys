---
'zaileys': minor
---

Add `ctx.ask(question, options?)` and `client.waitForMessage(options)` for multi-step conversations: ask a question and `await` the same user's next message in that chat, with a `timeout` (default 60 seconds), a `filter`, and an optional `timeoutMessage`. A message that answers a wait is not run as a command, and `ASK_TIMEOUT` or `ASK_CANCELLED` ends a command quietly instead of reporting a handler failure. Waits are bounded to one per chat and sender and 1,000 per client (`ASK_LIMIT`), and `disconnect()` cancels them all.
