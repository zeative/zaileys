---
'zaileys': patch
---

Command cooldowns now hold for their full length: a `cooldown: 86400` command can no longer be run again after one hour. Each client keeps its own cooldowns, so two clients in one process no longer block a sender on each other's commands. `checkGuards()` accepts an optional `cooldowns` tracker (`new CooldownTracker()`) for code that runs guards outside a client.
