---
'zaileys': minor
---

Add group status support. `client.send(groupJid).groupStatus(text, { backgroundColor, font })` posts a group status, and `groupStatus(message)` reposts an existing message (text, image, video, voice note) by copying its media pointers — nothing is downloaded or re-uploaded, so reposting a large video costs the same as reposting a line of text. Groups only: a non-`@g.us` recipient rejects with `INVALID_RECIPIENT`.

Two pre-existing bugs are fixed alongside it.

**Behaviour change — inbound group statuses now fire events.** `groupStatusMessage` and `groupStatusMessageV2` were missing from the decoder's wrapper list, so every inbound group status was silently dropped: no `message`, no `text`, no `image`. They now decode to their inner content, so `chatType` reflects what the status actually contains (`text`, `image`, …) rather than the envelope. Handlers that route commands off `message`/`text` will start seeing group status posts, including the ones your own bot sends and receives back. Use the new `ctx.isGroupStatus` flag to skip them:

```typescript
client.on('message', (ctx) => {
  if (ctx.isGroupStatus) return
})
```

`ctx.isGroupStatus` is distinct from the existing `ctx.isGroupStatusMention`, which means someone mentioned this group in *their* status.

**Relay path now applies message modifiers.** `.mentions()`, `.mentionAll()`, and `.disappearing()` were silently dropped for every relay-based content type — `buttons`, `list`, `carousel`, `template`, `groupInvite`, and AIRich. They are now applied to the message, and relayed messages carry a `messageSecret` for parity with the normal send path.
