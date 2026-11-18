---
'zaileys': patch
---

A plugin event method (`text`, `image`, `pollVote`, …) that returns a rejected promise is now logged as `plugin: event handler failed` instead of becoming an unhandled rejection that could crash the bot.
