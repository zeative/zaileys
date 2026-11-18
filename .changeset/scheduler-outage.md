---
'zaileys': patch
---

A scheduled message that comes due while the connection is closed is no longer dropped. Sends on a closed connection don't count toward the five retry attempts, so the job stays pending and fires when the client reconnects. Disconnecting while a scheduled send is in flight no longer leaves a retry timer running.
