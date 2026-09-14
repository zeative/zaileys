// Keeps docs/reference/error-codes.mdx in step with the error code unions in src/.
// A code added to src without an entry here is invisible to anyone who hits it.
// Usage: node docs/scripts/check-error-codes.mjs
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const SRC = join(ROOT, 'src')
const PAGE = join(ROOT, 'docs', 'reference', 'error-codes.mdx')

const walk = (dir) =>
  readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    return statSync(path).isDirectory() ? walk(path) : path.endsWith('.ts') ? [path] : []
  })

// `export type XxxErrorCode = 'A' | 'B'` — on one line or spread over several.
const inSource = new Map()
for (const file of walk(SRC)) {
  const text = readFileSync(file, 'utf8')
  for (const m of text.matchAll(/export type (\w*ErrorCode)\s*=\s*([\s\S]*?)(?:\n\n|\nexport |$)/g)) {
    for (const [, code] of m[2].matchAll(/'([A-Z][A-Z0-9_]*)'/g)) {
      inSource.set(code, m[1])
    }
  }
  // ZaileysProviderError pins its only code as a class field rather than a union.
  for (const [, code] of text.matchAll(/readonly code = '([A-Z][A-Z0-9_]*)'/g)) {
    inSource.set(code, 'ZaileysProviderError')
  }
}

const page = readFileSync(PAGE, 'utf8')
const documented = new Set(
  [...page.matchAll(/^### ([A-Z][A-Z0-9_]*)$/gm)].map((m) => m[1]),
)

const undocumented = [...inSource.keys()].filter((c) => !documented.has(c)).sort()
const stale = [...documented].filter((c) => !inSource.has(c)).sort()

if (undocumented.length || stale.length) {
  for (const c of undocumented) console.error(`✗ in src (${inSource.get(c)}) but not documented: ${c}`)
  for (const c of stale) console.error(`✗ documented but gone from src: ${c}`)
  console.error(`\n  add or remove the entry in docs/reference/error-codes.mdx`)
  process.exit(1)
}

console.log(`✓ error codes: ${inSource.size} in src, all documented`)
