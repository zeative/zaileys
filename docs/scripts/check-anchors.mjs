// Fails when a link's #fragment matches no heading id on the page it points at.
// Checks against the ids Mintlify actually rendered, not a re-implemented slugifier: Mintlify keeps
// some punctuation and turns ' into ’ ("won't" → "won’t"), which no hand-written slug rule predicted.
// `mint broken-links` checks pages only, never fragments.
// Usage: node docs/scripts/check-anchors.mjs [outDir]   (default: docs-dist/, run after the export)
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs'
import { join, dirname, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const DOCS = join(ROOT, 'docs')
const OUT = join(ROOT, process.argv[2] ?? 'docs-dist')

if (!existsSync(OUT)) {
  console.error(`✗ ${relative(ROOT, OUT)} not found — run the static export first`)
  process.exit(1)
}

const walk = (dir, ext) =>
  readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) return ['node_modules', 'scripts', '_next'].includes(name) ? [] : walk(path, ext)
    return path.endsWith(ext) ? [path] : []
  })

const idsCache = new Map()
const idsOf = (page) => {
  if (idsCache.has(page)) return idsCache.get(page)
  const file = [join(OUT, page, 'index.html'), join(OUT, `${page}.html`)].find((f) => existsSync(f))
  const ids = file
    ? new Set([...readFileSync(file, 'utf8').matchAll(/\bid="([^"]+)"/g)].map((m) => decode(m[1])))
    : null
  idsCache.set(page, ids)
  return ids
}

const decode = (s) => {
  const text = s.replace(/&#x27;|&#39;/g, "'").replace(/&amp;/g, '&').replace(/&quot;/g, '"')
  try { return decodeURIComponent(text) } catch { return text }
}

const broken = []
let checked = 0
for (const file of walk(DOCS, '.mdx')) {
  const page = relative(DOCS, file).slice(0, -'.mdx'.length)
  const lines = readFileSync(file, 'utf8').split('\n')
  let fenced = false
  lines.forEach((line, i) => {
    if (/^\s*```/.test(line)) fenced = !fenced
    if (fenced) return
    for (const m of line.matchAll(/(?:\]\(|href=")(\/[^)"#\s]*|)#([^)"\s]+)[)"]/g)) {
      const target = m[1] === '' ? page : m[1] === '/' ? 'index' : m[1].replace(/^\/|\/$/g, '')
      const fragment = decode(m[2])
      const ids = idsOf(target)
      checked++
      if (!ids) broken.push(`${relative(ROOT, file)}:${i + 1}  ${m[1] || '(this page)'}#${m[2]}  — page not built`)
      else if (!ids.has(fragment)) {
        // Suggest the rendered id a curly-quote or punctuation rewrite most likely produced.
        const loose = (s) => s.replace(/[’'‘:…/]/g, '')
        const hint = [...ids].find((id) => loose(id) === loose(fragment))
        broken.push(`${relative(ROOT, file)}:${i + 1}  ${m[1] || '(this page)'}#${m[2]}${hint ? `  → rendered as #${hint}` : ''}`)
      }
    }
  })
}

if (broken.length) {
  for (const b of broken) console.error(`✗ ${b}`)
  console.error(`\n✗ ${broken.length} of ${checked} anchor links point at no heading`)
  process.exit(1)
}
console.log(`✓ anchors: ${checked} links, all land on a rendered heading`)
