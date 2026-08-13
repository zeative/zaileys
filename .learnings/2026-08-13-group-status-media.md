# Media group status: the `mediatype` attribute, and how I nearly missed it

## The technical finding

A media message nested inside `groupStatusMessageV2` is **silently dropped by the WhatsApp server** —
relay returns a message id, no error, and the message never reaches a single group member.

Root cause, in `node_modules/baileys/lib/Socket/messages-send.js`:

```
line 469   const mediaType = getMediaType(message)      // reads the RAW message
line 471   extraAttrs['mediatype'] = mediaType          // lands on the `enc` node
line 372   const patched = await patchMessageBeforeSending(message, jids)   // runs AFTER
```

`getMediaType` does not unwrap `groupStatusMessageV2`, so the stanza ships without `mediatype` and the
server discards it. Text is unaffected — it needs no media classification.

**The fix exploits the ordering.** Relay the media at the **top level** so `getMediaType` sees it, then
wrap it into the envelope inside `patchMessageBeforeSending`, which runs after the attribute is
computed but before encryption. Both the attribute and the envelope end up correct.

Proof: identical send, before and after.

```
before   SENT MEDIA  → 0 acks
after    SENT MEDIA  → 3 delivery acks
```

## The process lessons — these cost far more than the fix

**1. Delivery receipts are a machine-readable success signal. Use them first.**
I asked a human to look at a phone screen ~15 times across this investigation. The whole time,
`message-receipt.update` would have told me instantly that media was never delivered while text was
delivered and read. One 30-line script replaced every one of those round trips. *Before asking a human
to observe, ask what the protocol already reports.*

**2. Absence of rendering is not proof of impossibility.**
I wrote "WhatsApp never renders a media group status" into the source, the docs, and a changeset that
shipped to npm — inferred purely from my own failures. A user screenshot of another bot doing it
refuted it. *Failing to reproduce something proves the approach is wrong, not that the thing is
impossible.* Especially when a counter-example exists in the wild.

**3. Run the cheap control experiment first, not twelfth.**
For a dozen rounds I compared media-in-envelope against nothing. When I finally posted a plain
`status@broadcast` media status as a control, it also failed — revealing my `statusJidList` was
`['@s.whatsapp.net']` (a broken jid from `sock.user` being null) so *nothing* had been reaching anyone.
Every conclusion built before that control was worthless. *Establish that the harness works before
trusting any negative result from it.*

**4. Popularity is not verification.**
~675 GitHub repos contain the `groupStatusMessageV2` + media pattern. I treated the volume as
corroboration. Most were forks; the code fails as written. Running one of them verbatim proved it in
minutes — that should have been step one, not step ten.

**5. I gave up three times; the user's insistence is the only reason this was solved.**
Each "it can't be done" was a plausible, evidence-backed stopping point. All three were wrong. When a
user says a thing demonstrably works, that report outranks my inability to reproduce it.

## zaileys specifics worth remembering

- `sock.user` is **null** on the zaileys socket. Read the own jid from `client.creds.me.id`
  (`6287833764462:23@s.whatsapp.net`) and strip the `:device` suffix for a PN jid.
- `statusJidList` must contain **real recipient phone numbers**. Empty or self-only sends without error
  and reaches nobody — a silent no-op that invalidates any test built on it.
- Media for a status cannot reuse another message's pointers; it must be downloaded and re-uploaded.
  The "copy pointers, 172 bytes" trick only works for text.
- `ignoreMe` defaults to **true**, so own messages never reach the decoder. Any self-echo test must set
  `ignoreMe: false` or it measures nothing.
