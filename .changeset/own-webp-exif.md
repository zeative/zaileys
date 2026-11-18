---
'zaileys': patch
---

Replace the `node-webpmux` dependency (560 KB, including a WebAssembly build of libwebp) with a small built-in WebP container writer that embeds sticker-pack metadata. Static stickers come out byte for byte the same as before. Animated stickers now keep the alpha flag their encoder set, where node-webpmux cleared it. Corrupt or truncated WebP input is rejected with `Sticker creation failed: …` as before.
