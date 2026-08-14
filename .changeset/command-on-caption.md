---
"zaileys": patch
---

Commands now fire when they arrive as a media caption.

The dispatcher listened to the `text` event, which deliberately excludes captions — so a photo
captioned `!sticker` never reached the handler, even though `ctx.text` would have carried it. It now
listens to `message`, which is the same stream with captions included. Plain text commands are
unaffected, and a command still runs exactly once.
