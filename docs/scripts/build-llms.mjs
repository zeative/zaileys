// Writes llms.txt (index) and llms-full.txt (every page) into the built site.
// Mintlify generates these on its hosted plan, but a static export ships neither.
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const DOCS = join(dirname(fileURLToPath(import.meta.url)), '..')
const OUT = process.argv[2] ? join(DOCS, '..', process.argv[2]) : join(DOCS, '..', 'docs-dist')
const SITE = 'https://zaileys.kejaa.id'

const order = []
const nav = JSON.parse(readFileSync(join(DOCS, 'docs.json'), 'utf8')).navigation
for (const tab of nav.tabs) {
  for (const group of tab.groups ?? []) {
    for (const page of group.pages ?? []) order.push({ page, tab: tab.tab, group: group.group })
  }
}

const frontmatter = (raw) => {
  const m = /^---\n([\s\S]*?)\n---/.exec(raw)
  if (!m) return [{}, raw]
  const meta = {}
  for (const line of m[1].split('\n')) {
    const f = /^(\w+):\s*(.*)$/.exec(line)
    if (f) meta[f[1]] = f[2].trim().replace(/^["']|["']$/g, '')
  }
  return [meta, raw.slice(m[0].length)]
}

const index = ['# Zaileys documentation', '', 'A type-safe WhatsApp framework for Node.js and TypeScript.', '']
const full = ['# Zaileys documentation — full text', '', `Source: ${SITE}`, '']
let lastTab = null

for (const { page, tab, group } of order) {
  const file = join(DOCS, `${page}.mdx`)
  if (!statSync(file, { throwIfNoEntry: false })) continue
  const [meta, body] = frontmatter(readFileSync(file, 'utf8'))
  const url = `${SITE}${page === 'index' ? '/' : `/${page}`}`
  const title = meta.title ?? page

  if (tab !== lastTab) {
    index.push(`## ${tab}`, '')
    lastTab = tab
  }
  index.push(`- [${title}](${url})${meta.description ? `: ${meta.description}` : ''}`)

  full.push(`\n\n---\n\n# ${title}`, `URL: ${url}`, `Section: ${tab} › ${group}`, '')
  // Strip MDX imports; the prose and code are what a model needs.
  full.push(body.replace(/^import .*$/gm, '').replace(/\n{3,}/g, '\n\n').trim())
}

writeFileSync(join(OUT, 'llms.txt'), `${index.join('\n')}\n`)
writeFileSync(join(OUT, 'llms-full.txt'), `${full.join('\n')}\n`)
const kb = (f) => Math.round(readFileSync(join(OUT, f)).length / 1024)
console.log(`  llms.txt (${kb('llms.txt')} KB), llms-full.txt (${kb('llms-full.txt')} KB)`)
