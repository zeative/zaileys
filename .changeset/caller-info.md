---
'zaileys': patch
---

`call-incoming` now carries a `caller` object with details WhatsApp puts on the raw call stanza but baileys discards: `platform` (`iphone`/`android`/…), `appVersion`, `name`, `countryCode`, `phoneJid` (useful because `from` is often a `@lid`), `networkMedium`, and `screen` dimensions on video calls. Every field is optional and `caller` is omitted when WhatsApp sends nothing.

This is **not** an IP address. A live capture of raw call stanzas found no `ip4`/`ip6`/host/port/ICE-candidate field: messages are relayed through WhatsApp's servers so a sender's IP never reaches you, and the `<te relay_name=…>` entries in a call offer are WhatsApp's own relay servers ranked by the caller's latency, not the caller's address. The fields above are still a meaningful device fingerprint — treat them as personal data.
