---
'zaileys': minor
---

Add `htmlApp({ bypassDownload })`, on by default, so cards render without WhatsApp's "can't verify the security
of this media" Download prompt again, as they did in 4.15.

A card has to be marked as a forwarded bot message to render at all, and that same marking is what puts it behind
the recipient's unknown-sender check, so the prompt cannot be avoided from the envelope itself. Zaileys instead
follows the card with an identical edit, which WhatsApp renders straight away. The cost is one extra relay per
card, and the card reloads whenever the recipient opens the keyboard — pass `bypassDownload: false` for pages
that keep state, such as games and counters.
