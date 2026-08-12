---
'zaileys': minor
---

Add group status support. `client.send(groupJid).groupStatus(text, { backgroundColor, font })` posts a group status, and `groupStatus(message)` reposts an existing text message as one. Groups only: a non-`@g.us` recipient rejects with `INVALID_RECIPIENT`.

Verified against a live WhatsApp session: a text group status sends to an ordinary `@g.us` group and renders, including the background colour. Note that `backgroundColor` accepts both a hex string and a raw ARGB integer — baileys' own `assertColor` silently returns `undefined` for numeric input, so zaileys parses colours itself.

**Text only.** Reposting an image, video, or voice note rejects with `INVALID_OPTIONS`. Eight variants were relayed against a live session and none rendered, while that same session posted a media `status@broadcast` that did render — so the limitation is the group-status envelope, not the media pipeline, and text in the same envelope works. A status that silently vanishes is worse than a clear error, so it is blocked.

Two pre-existing bugs are fixed alongside it.

**Behaviour change — inbound group statuses now fire events.** `groupStatusMessage` and `groupStatusMessageV2` were missing from the decoder's wrapper list, so every inbound group status was silently dropped: no `message`, no `text`, no `image`. They now decode to their inner content, so `chatType` reflects what the status contains rather than the envelope. Handlers that route commands off `message`/`text` will start seeing group status posts. Use the new `ctx.isGroupStatus` flag to skip them:

```typescript
client.on('message', (ctx) => {
  if (ctx.isGroupStatus) return
})
```

`ctx.isGroupStatus` is distinct from the existing `ctx.isGroupStatusMention`, which means someone mentioned this group in *their* status. This decode path is covered by unit fixtures; it has not been exercised against a real WhatsApp-generated group status, because the WhatsApp client used for testing offers no way to post one.

**Relay path now applies message modifiers.** `.mentions()`, `.mentionAll()`, and `.disappearing()` were silently dropped for every relay-based content type — `buttons`, `list`, `carousel`, `template`, `groupInvite`, and AIRich. They are now applied to the message, and relayed messages carry a `messageSecret` for parity with the normal send path.
