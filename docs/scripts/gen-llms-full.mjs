// Auto-generates public/llms-full.txt (concatenated dump) AND per-page
// public/md/<slug>.md files used by the in-page "Copy for LLM" button.
// Runs on `prebuild`/`predev` so output never drifts from the MDX sources.
// Order follows content/_meta.tsx; non-page keys are skipped via existsSync.
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const contentDir = join(root, 'content')
const mdDir = join(root, 'public', 'md')
const SITE = process.env.DOCS_SITE_URL ?? 'https://zeative.github.io/zaileys'

const metaOrder = () => {
  const metaPath = join(contentDir, '_meta.tsx')
  if (!existsSync(metaPath)) return []
  const src = readFileSync(metaPath, 'utf8')
  const keys = []
  for (const m of src.matchAll(/^\s*['"]?([\w-]+)['"]?\s*:\s*item\(/gm)) keys.push(m[1])
  return keys
}

const titleOf = (raw, slug) => {
  const fm = raw.match(/^---\n([\s\S]*?)\n---/)
  if (fm) {
    const t = fm[1].match(/^title:\s*(.+)$/m)
    if (t) return t[1].trim().replace(/^['"]|['"]$/g, '')
  }
  const h1 = raw.match(/^#\s+(.+)$/m)
  return h1 ? h1[1].trim() : slug
}

const strip = (s) =>
  s
    .replace(/^---\n[\s\S]*?\n---\n/, '')
    .split('\n')
    .filter((l) => !/^\s*import\s.+from\s/.test(l))
    .join('\n')
    .replace(/<\/?(Callout|Steps|Tabs\.Tab|Tabs)(\s[^>]*)?>/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()

let order = metaOrder()
if (order.length === 0) {
  order = readdirSync(contentDir)
    .filter((f) => f.endsWith('.mdx'))
    .map((f) => f.replace(/\.mdx$/, ''))
    .sort()
}

mkdirSync(mdDir, { recursive: true })

let out =
  '# Zaileys — Full Documentation\n\n> Type-safe, batteries-included WhatsApp bot framework for Node.js and TypeScript built on Baileys. This file concatenates the full documentation for LLM ingestion. Source: ' +
  SITE +
  '\n'

let pages = 0
for (const slug of order) {
  const f = join(contentDir, `${slug}.mdx`)
  if (!existsSync(f)) continue
  const raw = readFileSync(f, 'utf8')
  const url = slug === 'index' ? SITE : `${SITE}/${slug}`
  const body = strip(raw)
  const title = titleOf(raw, slug)
  out += `\n\n---\n\n<!-- Page: ${url} -->\n\n${body}\n`
  writeFileSync(join(mdDir, `${slug}.md`), `# ${title}\n\n> Source: ${url}\n\n${body}\n`)
  pages++
}

writeFileSync(join(root, 'public', 'llms-full.txt'), out)
console.log(`[gen-llms-full] wrote llms-full.txt + ${pages} public/md/*.md (${out.length} bytes)`)
