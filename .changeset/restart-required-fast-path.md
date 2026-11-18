---
'zaileys': patch
---

After you scan a QR code or enter a pairing code, the client now reconnects immediately on WhatsApp's `restart-required` (515) close instead of waiting through the 3-second minimum backoff. Only the first 515 after each successful open takes this fast path, so a server that keeps sending 515 still gets the usual backoff.
