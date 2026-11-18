---
'zaileys': minor
---

Commands are now protected against per-sender floods: by default one sender may run 20 commands per minute across every chat, and further commands emit `command-blocked` with the new reason `'flood'` and `retryIn` instead of running. Tune it with `commandFlood: { maxCommands, windowMs, notice }`, where `notice` is replied at most once per window, or pass `commandFlood: false` to disable it.
