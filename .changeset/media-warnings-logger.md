---
'zaileys': patch
---

Media warnings ("sharp is not installed…", and the fallback sticker duration) now go through the client's logger instead of `console.warn`, so they respect your log level and format and no longer print raw ANSI color codes.
