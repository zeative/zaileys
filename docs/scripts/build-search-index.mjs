// Builds docs/search-index.json from the .mdx sources using BM25F weights.
// Field-length normalisation is precomputed here so the browser only sums numbers.
import { readFileSync, writeFileSync, readdirSync, statSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const DOCS = join(dirname(fileURLToPath(import.meta.url)), '..')
// Optional: the built site. Given it, every section anchor is taken from the rendered heading.
const HTML = process.argv[2] ? join(DOCS, '..', process.argv[2]) : null
const SNIPPET = 200

// Two signals, kept apart on purpose: "this page is ABOUT the term" (title/keywords/heading)
// versus "the term appears in the prose". Merging them lets a page that merely repeats a word
// outrank the page named after it, because BM25 saturation flattens one big combined number.
const FIELDS = {
  title: { boost: 6, b: 0.2, group: 'hi' },
  sidebar: { boost: 4, b: 0.2, group: 'hi' },
  keywords: { boost: 5, b: 0.3, group: 'hi' },
  heading: { boost: 3, b: 0.4, group: 'hi' },
  description: { boost: 2, b: 0.3, group: 'bo' },
  body: { boost: 1, b: 0.75, group: 'bo' },
}

const STOP = new Set('the a an and or of to in for on is are was were be been with you your it its this that as at by from can could will would should do does did if then than so not no but out up down more most any all each other some such only own same very just now here there when where which who what how why'.split(' '))

const stem = (w) => {
  if (w.length > 5 && w.endsWith('ies')) return `${w.slice(0, -3)}y`
  if (w.length > 4 && w.endsWith('es')) return w.slice(0, -2)
  if (w.length > 3 && w.endsWith('s') && !w.endsWith('ss')) return w.slice(0, -1)
  if (w.length > 5 && w.endsWith('ing')) return w.slice(0, -3)
  if (w.length > 4 && w.endsWith('ed')) return w.slice(0, -2)
  return w
}

// "sendTemplate" also indexes as send + template, so two-word queries find it.
const tokenize = (text) => {
  const out = []
  for (const token of String(text).split(/[^A-Za-z0-9_]+/)) {
    const raw = token.replace(/^_+|_+$/g, '')
    if (!raw) continue
    const lower = raw.toLowerCase()
    if (lower.length > 1 && !STOP.has(lower)) out.push(stem(lower))
    // FFMPEG_PATH and clearAuthOn also index their parts, so "ffmpeg path" finds them too.
    const parts = raw.split(/_+|(?<=[a-z0-9])(?=[A-Z])/)
    if (parts.length > 1) {
      for (const part of parts) {
        const p = part.toLowerCase()
        if (p.length > 1 && !STOP.has(p)) out.push(stem(p))
      }
    }
  }
  return out
}

const slugify = (t) => t.toLowerCase().replace(/`/g, '').replace(/[^\w\s-]/g, '').trim().replace(/\s+/g, '-')

const placeOf = new Map()
const nav = JSON.parse(readFileSync(join(DOCS, 'docs.json'), 'utf8')).navigation
nav.tabs.forEach((tab, tabIndex) => {
  // A tab may list pages directly instead of grouping them; treat the tab as its own group.
  for (const group of tab.groups ?? [{ group: tab.tab, pages: tab.pages }]) {
    for (const page of group.pages ?? []) placeOf.set(page, { tab: tab.tab, tabIndex, group: group.group })
  }
})

const walk = (dir) =>
  readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) return name === 'node_modules' || name === 'scripts' ? [] : walk(path)
    return path.endsWith('.mdx') ? [path] : []
  })

const frontmatter = (raw) => {
  const m = /^---\n([\s\S]*?)\n---/.exec(raw)
  if (!m) return [{}, raw]
  const meta = {}
  for (const line of m[1].split('\n')) {
    const f = /^(\w+):\s*(.*)$/.exec(line)
    if (!f) continue
    let v = f[2].trim().replace(/^["']|["']$/g, '')
    if (v.startsWith('[')) {
      // Parse as-is first: swapping quotes blindly corrupts any item holding an apostrophe.
      try {
        v = JSON.parse(f[2].trim())
      } catch {
        try { v = JSON.parse(f[2].trim().replace(/'/g, '"')) } catch { v = [] }
      }
      if (!v.length) {
        console.error(`\u2717 keywords failed to parse: ${f[2].trim()}`)
        process.exit(1)
      }
    }
    meta[f[1]] = v
  }
  return [meta, raw.slice(m[0].length)]
}

// Option and field names live in JSX attributes (<ParamField body="media.maxBytes">), which clean()
// strips with the tags — yet they're what people search for on a reference page.
const fieldNames = (t) =>
  [...t.matchAll(/<(?:ParamField|ResponseField)\b[^>]*?\b(?:body|name|path|query)="([^"]+)"/g)].map((m) => m[1])

// Identifiers a section defines or mentions: field names and inline code that looks like a name.
const identifiers = (t) => {
  const fenced = [...t.matchAll(/```[\s\S]*?```/g)].map((m) => m[0])
  const names = [
    ...fieldNames(t),
    ...[...t.replace(/```[\s\S]*?```/g, ' ').matchAll(/`([A-Za-z_][\w.]*(?:\(\))?)`/g)].map((m) => m[1]),
    // Environment variables inside code blocks, such as FFMPEG_PATH=… in a shell example.
    ...fenced.flatMap((block) => block.match(/\b[A-Z][A-Z0-9]*_[A-Z0-9_]+\b/g) ?? []),
  ]
  const out = new Set()
  for (const name of names) {
    const segments = name.replace(/\(\)$/, '').split('.')
    segments.forEach((segment, i) => {
      // Keep segments that are names in their own right; `session` in `session.clearAuthOn` is not.
      const named = /[A-Z_]/.test(segment) || (i === segments.length - 1 && segments.length > 1)
      const id = segment.replace(/^_+|_+$/g, '').toLowerCase()
      if (named && id.length > 2) out.add(id)
    })
  }
  return [...out].join(' ')
}

const clean = (t) =>
  t.replace(/```[\s\S]*?```/g, ' ').replace(/^import .*$/gm, ' ').replace(/<[^>]+>/g, ' ')
   .replace(/\{\/\*[\s\S]*?\*\/\}/g, ' ').replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
   .replace(/[*`#|>]+/g, ' ').replace(/\s+/g, ' ').trim()

// Pass 1: collect raw term frequencies per field.
const raw = []
for (const file of walk(DOCS).sort()) {
  const slug = file.slice(DOCS.length + 1, -'.mdx'.length)
  const place = placeOf.get(slug)
  if (!place) continue
  const [meta, body] = frontmatter(readFileSync(file, 'utf8'))

  const secs = []
  let cur = null
  for (const line of body.split('\n')) {
    const h = /^(#{2,3})\s+(.*)$/.exec(line)
    if (h) {
      if (cur) secs.push(cur)
      const explicit = /\s*\{#([\w-]+)\}\s*$/.exec(h[2])
      const text = h[2].replace(/\s*\{#[\w-]+\}\s*$/, '').replace(/[`*]/g, '').trim()
      cur = { t: text, a: explicit ? explicit[1] : slugify(text), lines: [] }
    } else if (cur) cur.lines.push(line)
  }
  if (cur) secs.push(cur)

  const text = {
    title: meta.title ?? slug,
    sidebar: meta.sidebarTitle ?? '',
    keywords: (Array.isArray(meta.keywords) ? meta.keywords : []).join(' '),
    heading: secs.map((s) => s.t).join(' '),
    description: meta.description ?? '',
    body: `${clean(body)} ${fieldNames(body).join(' ')}`,
  }

  const tf = {}
  const len = {}
  for (const field of Object.keys(FIELDS)) {
    const tokens = tokenize(text[field])
    len[field] = tokens.length || 1
    for (const term of tokens) {
      tf[term] = tf[term] || {}
      tf[term][field] = (tf[term][field] || 0) + 1
    }
  }

  raw.push({
    meta: {
      u: slug === 'index' ? '/' : `/${slug}`,
      t: text.title,
      s: text.sidebar,
      d: text.description,
      // Raw keywords, so a typed phrase the author declared can win outright.
      kw: text.keywords.toLowerCase(),
      i: meta.icon ?? '',
      tab: place.tab,
      ti: place.tabIndex,
      g: place.group,
      secs: secs.map((s) => {
        const raw = s.lines.join('\n')
        const ids = identifiers(raw)
        return { t: s.t, a: s.a, x: clean(raw).slice(0, SNIPPET), ...(ids ? { k: ids } : {}) }
      }),
    },
    tf,
    len,
  })
}

// Mintlify's slugs keep some punctuation and curl apostrophes ("won't" → "won’t", "client.use()" →
// "client-use"), so a local slugify can't predict them and search deep links would land at the page
// top. With the built site at hand, take each anchor from the heading Mintlify actually rendered.
if (HTML) {
  const entities = { amp: '&', lt: '<', gt: '>', quot: '"', '#x27': "'", '#39': "'" }
  const decode = (t) => t.replace(/&(amp|lt|gt|quot|#x27|#39);/g, (_, e) => entities[e])
  const norm = (t) =>
    decode(t).replace(/\u200b/g, '').replace(/[’‘]/g, "'").replace(/[“”]/g, '"').replace(/[`*]/g, '')
      .replace(/\s+/g, ' ').trim().toLowerCase()
  const unresolved = []
  for (const doc of raw) {
    const page = doc.meta.u === '/' ? 'index' : doc.meta.u.slice(1)
    const file = [join(HTML, page, 'index.html'), join(HTML, `${page}.html`)].find((f) => existsSync(f))
    if (!file) {
      unresolved.push(`${doc.meta.u} — page not in the built site`)
      continue
    }
    const byText = new Map()
    for (const m of readFileSync(file, 'utf8').matchAll(/<h([2-6])\b[^>]*\bid="([^"]+)"[^>]*>([\s\S]*?)<\/h\1>/g)) {
      if (m[2].startsWith('_R_')) continue // Mintlify's own UI headings: "On this page", card titles
      const key = norm(m[3].replace(/<[^>]+>/g, ''))
      byText.set(key, [...(byText.get(key) ?? []), decode(m[2])])
    }
    const seen = new Map()
    for (const sec of doc.meta.secs) {
      const key = norm(sec.t)
      const nth = seen.get(key) ?? 0
      seen.set(key, nth + 1)
      const id = byText.get(key)?.[nth]
      if (id) sec.a = id
      else unresolved.push(`${doc.meta.u} — "${sec.t}"`)
    }
  }
  if (unresolved.length) {
    for (const u of unresolved) console.error(`✗ no rendered heading for ${u}`)
    process.exit(1)
  }
}

// Average field lengths drive BM25F normalisation.
const avg = {}
for (const field of Object.keys(FIELDS)) {
  avg[field] = raw.reduce((sum, d) => sum + d.len[field], 0) / raw.length
}

// Pass 2: collapse each term into one precomputed, field-normalised weight per document.
const df = {}
const docs = raw.map((doc) => {
  const w = {}
  for (const [term, byField] of Object.entries(doc.tf)) {
    let hi = 0
    let bo = 0
    for (const [field, count] of Object.entries(byField)) {
      const { boost, b, group } = FIELDS[field]
      const weighted = (boost * count) / (1 - b + (b * doc.len[field]) / avg[field])
      if (group === 'hi') hi += weighted
      else bo += weighted
    }
    w[term] = [Math.round(hi * 10) / 10, Math.round(bo * 10) / 10]
    df[term] = (df[term] || 0) + 1
  }
  return { ...doc.meta, w }
})

// A page missing from docs.json is skipped above, which would drop it from search silently.
const onDisk = new Set(walk(DOCS).map((f) => f.slice(DOCS.length + 1, -'.mdx'.length)))
const orphaned = [...onDisk].filter((s) => !placeOf.has(s))
const missing = [...placeOf.keys()].filter((s) => !onDisk.has(s))
if (orphaned.length || missing.length) {
  if (orphaned.length) console.error(`✗ not in docs.json navigation: ${orphaned.join(', ')}`)
  if (missing.length) console.error(`✗ in docs.json but no .mdx file: ${missing.join(', ')}`)
  process.exit(1)
}

const out = join(DOCS, 'search-index.json')
// Ship the stop list: if the query tokenizer used a different one, a word dropped at index
// time could still be searched for and collide with a camelCase stem ("what" <- WhatsApp).
writeFileSync(out, JSON.stringify({ v: 4, N: docs.length, k1: 1.2, hiBoost: 3, stop: [...STOP], df, docs }))
const kb = Math.round(readFileSync(out).length / 1024)
console.log(`✓ BM25F index (split fields): ${docs.length} pages, ${Object.keys(df).length} terms, ${docs.reduce((n, d) => n + d.secs.length, 0)} sections, ${kb} KB`)
