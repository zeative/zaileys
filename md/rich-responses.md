# Rich Responses (AIRich)

> Source: https://zeative.github.io/zaileys/rich-responses

# Rich Responses (AIRich)

Write ordinary **markdown**, pass `{ rich: true }` to `.text()`, and Zaileys renders it as a
Meta-AI-style rich card on WhatsApp — syntax-highlighted code, tables, image galleries, inline
links and citations, LaTeX formulas, plus `:::` directive blocks for products, reels, posts,
suggestions and more.

There is **no separate `aiRich()` method**. Rich rendering is just a flag on the regular text
builder you already know from [Sending Messages](/sending-messages):

```typescript

const client = new Client()

await client.send('628xxx@s.whatsapp.net').text('**Hello** from *zaileys*', { rich: true })
```

The same `content` string is parsed by a small markdown engine (`parseRichMarkdown`) into a list
of typed parts (text, code, table, image, video, product, reels, post, tip, suggest), then encoded
into the WhatsApp rich-response payload.

  AIRich uses a reverse-engineered WhatsApp rich-response format. It is **experimental** and may
  break when WhatsApp changes its payload. Plain `.text()` (without `rich: true`) is completely
  unaffected and always safe.

## The `.text()` signature

```typescript
text(content: string, opts?: TextOptions): MessageBuilder

type TextOptions = {
  rich?: boolean
  title?: string
  footer?: string
  sources?: Array<[profileUrl: string, url: string, text: string]>
}
```

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `rich` | `boolean` | `false` | When `true`, parse `content` as rich markdown. When omitted/`false`, send `content` as a normal text message. |
| `title` | `string` | `''` | Disclaimer / header label shown above the rich card (e.g. a bot name). |
| `footer` | `string` | `''` | Footer text appended as the last block of the card. |
| `sources` | `Array<[profileUrl, url, text]>` | `[]` | Citation source chips. Each tuple is `[faviconUrl, linkUrl, displayName]`. |

  When `rich` is `false` or omitted, `title`, `footer` and `sources` are ignored — they only apply
  to the rich renderer.

### Full example

```typescript
await client.send('628xxx@s.whatsapp.net').text(
  [
    '*Daily brief* ☕',
    '',
    'Repo: [GitHub](https://github.com/zeative/zaileys)',
    'A citation: [](https://github.com/zeative/zaileys)',
    '',
    '```ts',
    "const client = new Client()",
    '```',
    '',
    '| Feature | Status |',
    '|---|---|',
    '| Buttons | Ready |',
    '| AIRich  | Experimental |',
  ].join('\n'),
  {
    rich: true,
    title: '📰 zaileys Daily',
    footer: '💡 Dibuat dengan zaileys — github.com/zeative/zaileys',
    sources: [
      ['https://avatars.githubusercontent.com/u/9919?s=64', 'https://github.com/zeative/zaileys', 'zaileys on GitHub'],
    ],
  },
)
```

## Supported markdown

These are detected automatically — no directive needed. The parser walks the string line by line,
so most block features must start on **their own line**.

| Markdown | Renders as |
| --- | --- |
| `*bold*`, `_italic_`, plain paragraphs | a text block |
| `[label](url)` | inline hyperlink |
| `[](url)` (empty label) | numbered citation |
| `[expr\|w\|h]<url>` | LaTeX formula (see below) |
| ` ```lang … ``` ` | syntax-highlighted code block |
| `\| a \| b \|` followed by `\|---\|` | table |
| `![alt](url)` on its own line | image (consecutive image lines → gallery) |

### Text, bold, italic & links

Consecutive non-block lines are joined into a single text block. Inline markup is extracted from the
text, so links and citations render as tappable chips.

```typescript
await client.send(jid).text(
  [
    '*Tech Brief — Monday* ☕',
    '',
    'Daily roundup from [zaileys](https://github.com/zeative/zaileys).',
    'Data monitored automatically. [](https://github.com/zeative/zaileys)',
  ].join('\n'),
  { rich: true, title: '📰 zaileys Daily' },
)
```

- `[zaileys](https://…)` → a hyperlink chip labelled `zaileys`.
- `[](https://…)` → a citation (empty label). Citations are auto-numbered in order of appearance.

  Escape a literal `[` with a backslash (`\[`) if you do not want it treated as the start of a
  link/citation/LaTeX entity.

### LaTeX formulas

WhatsApp cannot render raw LaTeX, so AIRich uses a **pre-rendered formula image**. The syntax is a
link-like entity using angle brackets `<…>` instead of parentheses:

```text
[expression|width|height|fontHeight|padding]<imageUrl>
```

Only `expression` and `imageUrl` are required; the trailing fields are optional sizing hints.

| Field | Default | Notes |
| --- | --- | --- |
| `expression` | `image` | The LaTeX source text (shown as alt/label). |
| `width` | `100` | Rendered image width. |
| `height` | `100` | Rendered image height. |
| `fontHeight` | `83.33` | Font height hint. |
| `padding` | `15` | Padding hint. |

```typescript
await client.send(jid).text(
  "Today's formula: [E = mc^2|160|44]<https://latex.codecogs.com/png.image?E%20%3D%20mc%5E2>",
  { rich: true, title: '🧮 zaileys' },
)
```

  The `<url>` must point to an already-rendered formula image (e.g. a CodeCogs PNG). Zaileys does
  not render LaTeX itself — it only references the image you supply.

### Code blocks

Fenced code blocks become syntax-highlighted cards. Provide a language after the opening fence; if
omitted, `plaintext` is used. JavaScript/TypeScript (`js`, `ts`, `javascript`, `typescript`) get
keyword, string, number, comment and method-call highlighting.

````typescript
await client.send(jid).text(
  [
    '```typescript',
    "import { Client } from 'zaileys'",
    '',
    'const client = new Client()',
    '',
    "client.on('text', async (msg) => {",
    "  await client.send(msg.senderId).text('hi')",
    '})',
    '```',
  ].join('\n'),
  { rich: true },
)
````

### Tables

A table is a line containing `|` immediately followed by a separator row (`|---|`, dashes/colons).
The first row is the header; remaining rows are the body. Ragged rows are padded to the widest row.

```typescript
await client.send(jid).text(
  [
    '| Repo | Stars | Δ 24h |',
    '|---|---|---|',
    '| zaileys | 12.4k | +318 |',
    '| baileys | 15.1k | +92 |',
    '| venom | 6.2k | +11 |',
  ].join('\n'),
  { rich: true, title: '📊 Trending repos' },
)
```

### Images & galleries

An `![alt](url)` line on its own becomes an image. **Consecutive** image lines collapse into a
single swipeable gallery.

```typescript
await client.send(jid).text(
  [
    '*Release gallery* — swipe through the screenshots.',
    '',
    '![shot](https://placehold.co/600x800/png)',
    '![shot](https://placehold.co/512x512/png)',
  ].join('\n'),
  { rich: true, title: '🖼️ zaileys v4', footer: '#zaileys' },
)
```

  You can also produce images via the `:::image` directive (below). Inline `![](…)` is the
  shorthand; the directive is handy when you want to group images explicitly inside a directive
  flow.

## Directive blocks

For primitives that have no native markdown form, use a `:::name … :::` fence. The opening line is
`:::name` (alone on its line), followed by body lines, closed by a bare `:::`.

```text
:::name
body line 1
body line 2
:::
```

Body items are read as a list — each line may optionally start with `-` or `*`. The available
directives are: `suggest`, `tip`, `image`, `video`, `product`, `reels`, `post`.

Most directives use an **inline field syntax** inside each item: `key: value` pairs separated by
`|`. Keys are case-insensitive. Unknown keys are ignored.

### `:::suggest` — follow-up prompt pills

Each item is split on `|` into individual suggestion pills. You can put all pills on one line or use
multiple lines.

```typescript
await client.send(jid).text(
  [
    'Anything else?',
    '',
    ':::suggest',
    'See changelog | Upgrade guide | Compare v3 vs v4',
    ':::',
  ].join('\n'),
  { rich: true },
)
```

### `:::tip` — callout text

A single highlighted metadata text block. Multiple body lines are joined with newlines.

```typescript
await client.send(jid).text(
  [
    ':::tip',
    'Tap an image to open the full preview',
    ':::',
  ].join('\n'),
  { rich: true },
)
```

### `:::image` — image / gallery

One URL per body line. A single URL → one image; multiple URLs → a gallery. (Equivalent to inline
`![](url)` lines.)

```typescript
await client.send(jid).text(
  [
    ':::image',
    'https://placehold.co/600x800/png',
    'https://placehold.co/512x512/png',
    ':::',
  ].join('\n'),
  { rich: true },
)
```

### `:::video` — video clip(s)

Each body line is `url | duration`. The URL is required; the duration (seconds) is read from the
**first** item's second field and applied to the block. Multiple URLs become multiple clips.

```typescript
await client.send(jid).text(
  [
    ':::video',
    'https://example.com/clip.mp4 | 10',
    ':::',
  ].join('\n'),
  { rich: true, title: '🎬 zaileys' },
)
```

| Field | Type | Notes |
| --- | --- | --- |
| (first, unkeyed) | `string` | Video URL (required). |
| (second, unkeyed) | `number` | Duration in seconds, read from the first item only. Defaults to `0`. |

### `:::product` — product card(s)

Each item is a product. One item → a single card; multiple items → a horizontal scroll carousel.

```typescript
await client.send(jid).text(
  [
    'Community merch 🛍️',
    '',
    ':::product',
    '- title: Sticker Pack | price: Rp35.000 | sale: Rp25.000 | brand: zaileys | image: https://placehold.co/512x512/png | url: https://github.com/zeative/zaileys',
    '- title: Hoodie Dev | price: Rp320.000 | sale: Rp275.000 | brand: zaileys | image: https://placehold.co/600x800/png | url: https://github.com/zeative/zaileys',
    ':::',
  ].join('\n'),
  { rich: true, title: '🛍️ zaileys Store' },
)
```

| Field | Type | Notes |
| --- | --- | --- |
| `title` | `string` | **Required** — item is skipped if missing/empty. |
| `price` | `string` | Regular price. |
| `sale` / `saleprice` | `string` | Sale price (`sale` and `saleprice` both map to it). |
| `brand` | `string` | Brand label. |
| `url` | `string` | Product link. |
| `image` | `string` | Main product image URL. |
| `icon` | `string` | Additional/secondary image URL. |

### `:::reels` — reels carousel

Each item is a reel. Always rendered as a horizontal scroll.

```typescript
await client.send(jid).text(
  [
    'Trending in the community 👇',
    '',
    ':::reels',
    '- user: zeative | title: nativeFlow buttons demo | url: https://example.com/clip.mp4 | thumb: https://placehold.co/512x512/png | views: 12400 | likes: 980 | verified: true',
    '- user: zeative | title: AIRich rich response | url: https://example.com/clip.mp4 | thumb: https://placehold.co/600x800/png | views: 8800 | likes: 740 | verified: true',
    ':::',
  ].join('\n'),
  { rich: true, title: '🔥 Trending' },
)
```

| Field | Type | Notes |
| --- | --- | --- |
| `user` / `username` | `string` | Creator handle (both keys map to `username`). |
| `title` | `string` | Reel title. |
| `profile` | `string` | Creator avatar / profile URL. |
| `thumb` | `string` | Thumbnail URL. |
| `url` | `string` | Video URL. |
| `likes` | `number` | Like count. |
| `shares` | `number` | Share count. |
| `views` | `number` | View count. |
| `source` | `string` | Source app label (defaults to `IG`). |
| `verified` | `boolean` | `true`/`1`/`yes` → verified badge. |

### `:::post` — social post card(s)

Each item is a post. Always rendered as a horizontal scroll (a single item still renders fine).

```typescript
await client.send(jid).text(
  [
    ':::post',
    '- user: zeative | title: zaileys v4 is out | caption: Buttons, carousel, AIRich — all built-in. | thumb: https://placehold.co/512x512/png | likes: 1500 | comments: 132 | verified: true | source: GITHUB',
    ':::',
  ].join('\n'),
  { rich: true, title: '📣 Announcements' },
)
```

| Field | Type | Notes |
| --- | --- | --- |
| `user` / `username` | `string` | Author handle (both keys map to `username`). |
| `title` | `string` | Post title. |
| `subtitle` | `string` | Subtitle / secondary line. |
| `profile` | `string` | Author avatar URL. |
| `thumb` | `string` | Thumbnail URL. |
| `caption` | `string` | Post caption. |
| `likes` | `number` | Like count. |
| `comments` | `number` | Comment count. |
| `shares` | `number` | Share count. |
| `url` | `string` | Post link. |
| `source` | `string` | Source app label (defaults to `INSTAGRAM`). |
| `footer` | `string` | Footer label. |
| `icon` | `string` | Footer icon URL. |
| `verified` | `boolean` | `true`/`1`/`yes` → verified badge. |

  For `reels` and `post`, numeric fields (`likes`, `views`, `comments`, `shares`) must parse as
  numbers — non-numeric values are dropped. Boolean fields accept `true`, `1`, or `yes`.

## Putting it all together

Markdown and directives can be freely interleaved; they render in source order. This mirrors the
`examples/airich-bot.ts` showcase:

```typescript
const md = [
  '*Galeri rilis v4* — geser untuk lihat tangkapan layar & klip.',
  '',
  '![shot](https://placehold.co/600x800/png)',
  '![shot](https://placehold.co/512x512/png)',
  '',
  ':::video',
  'https://example.com/clip.mp4 | 10',
  ':::',
  '',
  ':::tip',
  'Ketuk gambar untuk pratinjau penuh',
  ':::',
  '',
  ':::suggest',
  'Lihat changelog | Cara upgrade | Bandingkan v3 vs v4',
  ':::',
].join('\n')

await client.send(jid).text(md, { rich: true, title: '🖼️ zaileys v4', footer: '#zaileys' })
```

## Rich replies

The same engine powers context replies. `msg.reply(content, opts?)` accepts the identical
`TextOptions`, so `{ rich, title, footer, sources }` work there too. See [Events](/events) for the
full message context API.

```typescript
client.on('text', async (msg) => {
  if (msg.text.trim().toLowerCase() === 'rich') {
    await msg.reply(
      [
        '*Rich reply example* ✨',
        '',
        '```ts',
        'const x = 1',
        '```',
        '',
        ':::suggest',
        'Again | Close',
        ':::',
      ].join('\n'),
      { rich: true, title: '🤖 zaileys' },
    )
  }
})
```

## Tips & gotchas

  Rich content is sent as a forwarded bot message payload. It cannot be combined with regular text
  styling on the same builder call — pick `rich: true` *or* a plain string, not both.

- **Empty content throws.** `text('', { rich: true })` (or content that parses to no parts) raises
  a builder error. Always supply at least one renderable block.
- **Block features need their own line.** Code fences, table separators, image lines and `:::`
  directive markers must each start on a fresh line, exactly as shown.
- **Directive items support `-`/`*` bullets.** Leading `-` or `*` on each item line is stripped, so
  both `- title: …` and `title: …` work.
- **`product` requires `title`.** Items without a `title` are silently dropped.
- **Field keys are case-insensitive** and split on `|`. Unrecognized keys are ignored, so adding a
  typo will simply have no effect rather than erroring.

## See also

- [Sending Messages](/sending-messages) — the `.text()` builder and other content types.
- [Interactive Messages](/interactive) — buttons, lists, carousels, and native flows.
- [Events](/events) — the message context (`msg.reply`, `msg.react`, etc.).
