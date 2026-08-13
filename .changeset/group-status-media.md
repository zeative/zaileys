---
'zaileys': patch
---

Group status now supports media. `client.send(groupJid).groupStatus({ image, caption })` posts a photo, video, or voice note, and `groupStatus(ctx)` reposts an existing media message. Verified live — image and video both receive delivery receipts.

Media inside a `groupStatusMessageV2` envelope was previously dropped by the server with no error: baileys derives the stanza's `mediatype` attribute from the raw message (`getMediaType`, which does not unwrap the envelope) *before* it calls `patchMessageBeforeSending`, so a nested media status ships without the attribute and never reaches anyone. zaileys now relays the media at the top level so the attribute is set, then wraps it into the envelope inside the patch hook. A user-supplied `patchMessageBeforeSending` still runs, composed after the wrap.

Media is always re-uploaded — a status cannot reuse another message's media pointers, so only the text repost path is cheap.
