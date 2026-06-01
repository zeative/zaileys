import type { AIRichPart, AIRichPost, AIRichProduct, AIRichReel } from './airich.js'

const DIRECTIVE_OPEN = /^:::([a-zA-Z]+)\s*$/
const DIRECTIVE_CLOSE = /^:::\s*$/
const CODE_FENCE = /^```(\w*)\s*$/
const IMAGE_LINE = /^!\[[^\]]*\]\(([^)]+)\)\s*$/
const TABLE_SEP = /^\s*\|?\s*:?-{2,}[\s|:-]*$/

const splitPipes = (line: string): string[] => line.split('|').map((s) => s.trim())

const parseFields = (line: string): Record<string, string> => {
  const out: Record<string, string> = {}
  for (const part of splitPipes(line)) {
    const idx = part.indexOf(':')
    if (idx === -1) continue
    const key = part.slice(0, idx).trim().toLowerCase()
    const val = part.slice(idx + 1).trim()
    if (key.length > 0) out[key] = val
  }
  return out
}

const num = (v: string | undefined): number | undefined => {
  if (v === undefined || v.trim().length === 0) return undefined
  const n = Number(v)
  return Number.isNaN(n) ? undefined : n
}

const bool = (v: string | undefined): boolean => v === 'true' || v === '1' || v === 'yes'

const splitRow = (line: string): string[] => {
  let s = line.trim()
  if (s.startsWith('|')) s = s.slice(1)
  if (s.endsWith('|')) s = s.slice(0, -1)
  return s.split('|').map((c) => c.trim())
}

const toProduct = (line: string): AIRichProduct | null => {
  const f = parseFields(line)
  const title = f['title']
  if (title === undefined || title.length === 0) return null
  const p: AIRichProduct = { title }
  if (f['price']) p.price = f['price']
  if (f['sale']) p.salePrice = f['sale']
  if (f['saleprice']) p.salePrice = f['saleprice']
  if (f['brand']) p.brand = f['brand']
  if (f['url']) p.url = f['url']
  if (f['image']) p.image = f['image']
  if (f['icon']) p.icon = f['icon']
  return p
}

const toReel = (line: string): AIRichReel => {
  const f = parseFields(line)
  const r: AIRichReel = {}
  if (f['user']) r.username = f['user']
  if (f['username']) r.username = f['username']
  if (f['title']) r.title = f['title']
  if (f['profile']) r.profileUrl = f['profile']
  if (f['thumb']) r.thumbnail = f['thumb']
  if (f['url']) r.url = f['url']
  const likes = num(f['likes'])
  if (likes !== undefined) r.likes = likes
  const shares = num(f['shares'])
  if (shares !== undefined) r.shares = shares
  const views = num(f['views'])
  if (views !== undefined) r.views = views
  if (f['source']) r.source = f['source']
  if ('verified' in f) r.verified = bool(f['verified'])
  return r
}

const toPost = (line: string): AIRichPost => {
  const f = parseFields(line)
  const p: AIRichPost = {}
  if (f['user']) p.username = f['user']
  if (f['username']) p.username = f['username']
  if (f['title']) p.title = f['title']
  if (f['subtitle']) p.subtitle = f['subtitle']
  if (f['profile']) p.profileUrl = f['profile']
  if (f['thumb']) p.thumbnail = f['thumb']
  if (f['caption']) p.caption = f['caption']
  const likes = num(f['likes'])
  if (likes !== undefined) p.likes = likes
  const comments = num(f['comments'])
  if (comments !== undefined) p.comments = comments
  const shares = num(f['shares'])
  if (shares !== undefined) p.shares = shares
  if (f['url']) p.url = f['url']
  if (f['source']) p.source = f['source']
  if (f['footer']) p.footer = f['footer']
  if (f['icon']) p.icon = f['icon']
  if ('verified' in f) p.verified = bool(f['verified'])
  return p
}

const buildDirective = (name: string, body: string[]): AIRichPart | null => {
  const items = body.map((l) => l.replace(/^[-*]\s*/, '').trim()).filter((l) => l.length > 0)
  if (name === 'suggest') {
    const prompts = items.flatMap((l) => splitPipes(l)).filter((s) => s.length > 0)
    return prompts.length > 0 ? { type: 'suggest', prompts } : null
  }
  if (name === 'tip') {
    return items.length > 0 ? { type: 'tip', text: items.join('\n') } : null
  }
  if (name === 'image') {
    return items.length > 0 ? { type: 'image', url: items.length === 1 ? items[0]! : items } : null
  }
  if (name === 'video') {
    if (items.length === 0) return null
    const urls = items.map((l) => splitPipes(l)[0] ?? '').filter((u) => u.length > 0)
    if (urls.length === 0) return null
    const duration = num(splitPipes(items[0]!)[1])
    const part: AIRichPart = { type: 'video', url: urls.length === 1 ? urls[0]! : urls }
    if (duration !== undefined) part.duration = duration
    return part
  }
  if (name === 'product') {
    const products = items.map(toProduct).filter((p): p is AIRichProduct => p !== null)
    return products.length > 0 ? { type: 'product', products: products.length === 1 ? products[0]! : products } : null
  }
  if (name === 'reels') {
    const reels = items.map(toReel)
    return reels.length > 0 ? { type: 'reels', reels } : null
  }
  if (name === 'post') {
    const posts = items.map(toPost)
    return posts.length > 0 ? { type: 'post', posts } : null
  }
  return null
}

/**
 * Parse a markdown string into {@link AIRichPart}s for an AIRich message.
 *
 * Block-level segmenter (not full CommonMark): recognizes fenced code blocks,
 * GitHub-style tables, image lines (`![alt](url)`), and `:::name` container
 * directives, with everything else grouped into text parts. Inline hyperlinks
 * (`[label](url)`), citations (`[](url)`), and LaTeX (`[expr]<imageUrl>`) are
 * handled downstream by the text part's entity extractor.
 *
 * Directives: `:::suggest`, `:::tip`, `:::image`, `:::video`, `:::product`,
 * `:::reels`, `:::post` — each closed by a line containing only `:::`. List-style
 * directives (`product`/`reels`/`post`) take one `- key: value | key: value` item
 * per line; `suggest`/`image`/`video` take one value per line (pipe-splittable).
 */
export const parseRichMarkdown = (md: string): AIRichPart[] => {
  const lines = md.replace(/\r\n/g, '\n').split('\n')
  const parts: AIRichPart[] = []
  let textBuf: string[] = []
  const flushText = (): void => {
    const joined = textBuf.join('\n').trim()
    if (joined.length > 0) parts.push({ type: 'text', text: joined })
    textBuf = []
  }

  let i = 0
  while (i < lines.length) {
    const line = lines[i]!

    const directive = DIRECTIVE_OPEN.exec(line)
    if (directive) {
      flushText()
      const body: string[] = []
      i++
      while (i < lines.length && !DIRECTIVE_CLOSE.test(lines[i]!)) {
        body.push(lines[i]!)
        i++
      }
      i++
      const part = buildDirective(directive[1]!.toLowerCase(), body)
      if (part) parts.push(part)
      continue
    }

    const fence = CODE_FENCE.exec(line)
    if (fence) {
      flushText()
      const code: string[] = []
      i++
      while (i < lines.length && !CODE_FENCE.test(lines[i]!)) {
        code.push(lines[i]!)
        i++
      }
      i++
      const language = fence[1] && fence[1].length > 0 ? fence[1] : undefined
      parts.push(language ? { type: 'code', language, content: code.join('\n') } : { type: 'code', content: code.join('\n') })
      continue
    }

    const next = lines[i + 1]
    if (line.includes('|') && next !== undefined && next.includes('|') && TABLE_SEP.test(next)) {
      flushText()
      const rows: string[][] = [splitRow(line)]
      i += 2
      while (i < lines.length && lines[i]!.includes('|') && lines[i]!.trim().length > 0) {
        rows.push(splitRow(lines[i]!))
        i++
      }
      parts.push({ type: 'table', rows })
      continue
    }

    const image = IMAGE_LINE.exec(line)
    if (image) {
      flushText()
      const urls: string[] = [image[1]!]
      i++
      while (i < lines.length) {
        const m = IMAGE_LINE.exec(lines[i]!)
        if (!m) break
        urls.push(m[1]!)
        i++
      }
      parts.push({ type: 'image', url: urls.length === 1 ? urls[0]! : urls })
      continue
    }

    textBuf.push(line)
    i++
  }
  flushText()
  return parts
}
