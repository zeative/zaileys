---
'zaileys': minor
---

Redesign `htmlApp()` as an inline card for WhatsApp Android, based on on-device measurements: the card runs offline
with no network, links, or storage, so it no longer pretends to offer a webview fallback or trusted sources.

- New options: `title`, `height`, `device`, `fallback`, `maxBytes` (default 256 KB). A non-Android `device` sends
  `fallback` as plain text, or throws `INVALID_RECIPIENT` without it, so no empty bubble is sent.
- New helpers `html`, `htmlJson`, `escapeHtml`, `rawHtml`, and `SafeHtml` escape interpolated values so user data
  cannot inject script into a card.
- Removed from 4.15: `buildHtmlAppContent`, `HtmlAppDevice`, the `AIRichPart` re-export, and the options `text`,
  `footer`, `fallbackUrl`, `fallbackButtonText`, `trustedSources`, and `bypassDownload`. The follow-up edit that
  skipped WhatsApp's Download prompt is gone because it reloaded the card every time the keyboard opened.
