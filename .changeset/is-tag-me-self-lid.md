---
'zaileys': patch
---

`msg.isTagMe` is now `true` when a mention carries the bot's LID and could not be mapped to its phone number, for example after a resolver timeout. Before, the `mention` event fired for such a message but `isTagMe` stayed `false`.
