// Auto-generates public/llms-full.txt by concatenating all docs content.
// Runs on `prebuild` (and `predev`) so the full dump never drifts from the
// MDX sources. Order follows content/_meta.ts; falls back to alphabetical.
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const contentDir = join(root, 'content')
const SITE = process.env.DOCS_SITE_URL ?? 'https://zeative.github.io/zaileys'

const metaOrder = () => {
  const metaPath = join(contentDir, '_meta.ts')
  if (!existsSync(metaPath)) return []
  const src = readFileSync(metaPath, 'utf8')
  const keys = []
  for (const m of src.matchAll(/^\s*['"]?([\w-]+)['"]?\s*:/gm)) keys.push(m[1])
  return keys
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

const order = metaOrder()
let out =
  '# Zaileys — Full Documentation\n\n> Type-safe, batteries-included WhatsApp bot framework for Node.js and TypeScript built on Baileys. This file concatenates the full documentation for LLM ingestion. Source: ' +
  SITE +
  '\n'

for (const slug of order) {
  const f = join(contentDir, `${slug}.mdx`)
  if (!existsSync(f)) continue
  const url = slug === 'index' ? SITE : `${SITE}/${slug}`
  out += `\n\n---\n\n<!-- Page: ${url} -->\n\n${strip(readFileSync(f, 'utf8'))}\n`
}

writeFileSync(join(root, 'public', 'llms-full.txt'), out)
console.log(`[gen-llms-full] wrote public/llms-full.txt (${out.length} bytes, ${order.length} pages)`)
