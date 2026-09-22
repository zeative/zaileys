---
'zaileys': minor
---

Emit `message-status` on a linked device, not just on the Cloud provider, so outbound messages report `sent`,
`delivered`, `read`, and `failed` on both transports.

`messages.update` already carried Baileys' numeric ack, but the pipeline only decoded it into `edit`, `delete`, and
`poll-vote`. A linked-device bot could therefore never learn whether a message it sent arrived — the highest state a
consumer could observe was its own "accepted".

The payload is `CloudStatusEvent`, unchanged, so a consumer does not need to know which transport a channel uses;
`conversationId` and `error` stay Cloud-only and are simply absent on a linked device. Receipts for messages the bot
did not send are ignored, and `PENDING` is not reported as a receipt, since it would move a timeline backwards from
an ack already seen.

One mapping is worth naming: `SERVER_ACK` is `sent`, not `delivered`. It means the message reached WhatsApp and
nothing more — reading it as delivered makes a UI claim a message is on someone's phone when it is not.
