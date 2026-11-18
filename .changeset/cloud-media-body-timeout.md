---
'zaileys': patch
---

`downloadMedia()` on the Cloud API provider no longer hangs when Meta's CDN stops sending partway through a file: the 60-second deadline now covers the whole body. A response without `content-length` is read in chunks and abandoned as soon as it passes the 128 MB cap, instead of being buffered in full first.
