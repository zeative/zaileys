---
'zaileys': patch
---

Remove three runtime dependencies that zaileys never imported: `async-mutex` (baileys ships its own), `nanospinner`, and `valibot`. Installs are smaller and nothing changes at runtime.
