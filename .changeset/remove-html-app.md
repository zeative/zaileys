---
'zaileys': minor
---

Remove `htmlApp()` and everything behind it: `buildHtmlAppContent`, `HtmlAppOptions`, `HtmlAppDevice`,
`AI_RICH_HTML_PRIMITIVE`, the `html` AI rich part and the identical-edit relay that skipped the download
prompt. The `AIRichPart` type is no longer re-exported. `cta_url` buttons keep `landing_page_url`.
