// Builds docs/search-index.json from the .mdx sources using BM25F weights.
// Field-length normalisation is precomputed here so the browser only sums numbers.
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const DOCS = join(dirname(fileURLToPath(import.meta.url)), '..')
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
  for (const raw of String(text).split(/[^A-Za-z0-9_]+/)) {
    if (!raw) continue
    const lower = raw.toLowerCase()
    if (lower.length > 1 && !STOP.has(lower)) out.push(stem(lower))
    const parts = raw.split(/(?<=[a-z0-9])(?=[A-Z])/)
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
      try { v = JSON.parse(f[2].replace(/'/g, '"')) } catch { v = [] }
    }
    meta[f[1]] = v
  }
  return [meta, raw.slice(m[0].length)]
}

const clean = (t) =>
  t.replace(/```[\s\S]*?```/g, ' ').replace(/^import .*$/gm, ' ').replace(/<[^>]+>/g, ' ')
   .replace(/\{\/\*[\s\S]*?\*\/\}/g, ' ').replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
   .replace(/[*_`#|>]+/g, ' ').replace(/\s+/g, ' ').trim()

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
      const text = h[2].replace(/[`*]/g, '').trim()
      cur = { t: text, a: slugify(text), lines: [] }
    } else if (cur) cur.lines.push(line)
  }
  if (cur) secs.push(cur)

  const text = {
    title: meta.title ?? slug,
    sidebar: meta.sidebarTitle ?? '',
    keywords: (Array.isArray(meta.keywords) ? meta.keywords : []).join(' '),
    heading: secs.map((s) => s.t).join(' '),
    description: meta.description ?? '',
    body: clean(body),
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
      i: meta.icon ?? '',
      tab: place.tab,
      ti: place.tabIndex,
      g: place.group,
      secs: secs.map((s) => ({ t: s.t, a: s.a, x: clean(s.lines.join('\n')).slice(0, SNIPPET) })),
    },
    tf,
    len,
  })
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
writeFileSync(out, JSON.stringify({ v: 3, N: docs.length, k1: 1.2, hiBoost: 3, df, docs }))
const kb = Math.round(readFileSync(out).length / 1024)
console.log(`✓ BM25F index (split fields): ${docs.length} pages, ${Object.keys(df).length} terms, ${docs.reduce((n, d) => n + d.secs.length, 0)} sections, ${kb} KB`)
