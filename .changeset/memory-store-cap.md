---
'zaileys': minor
---

`MemoryMessageStore`, the default message store, now keeps at most 10,000 messages and drops the oldest first. Before, a busy bot could fill its heap long before the 30-day auto-delete window pruned anything: our VPS benchmark ran out of memory at a 96 MB heap and now peaks at 68 MB. Set the limit with `new MemoryMessageStore({ maxMessages })`, or pass `Infinity` for the old unbounded behaviour.
