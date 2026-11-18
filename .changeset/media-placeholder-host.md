---
'zaileys': patch
---

Downloading some received stickers, voice notes and images no longer fails with `ENOTFOUND a.whatsapp.net`. These messages carry an unresolvable placeholder host in their `url`, and baileys 7.0.0-rc14 built the download on it. zaileys now sends them to the default media host, matching the fix merged upstream in WhiskeySockets/Baileys#2900, which has not been released yet. This covers `msg.download()`, `msg.stream()` and `groupStatus()` reposts.
