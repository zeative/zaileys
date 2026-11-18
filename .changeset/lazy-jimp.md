---
'zaileys': patch
---

`import 'zaileys'` no longer loads `jimp` up front, which cut about 90 ms from startup (from ~360 ms to ~270 ms on Node 22, of which baileys itself takes ~260 ms). Jimp now loads the first time an image is processed without `sharp` installed.
