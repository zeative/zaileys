// Ranking regression test for docs/search.js: asserts the expected page ranks #1 for each query.
// Runs the real scoring code — search.js is loaded with a stub DOM and its `search()` exposed.
// Usage: node docs/scripts/check-search.mjs
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import vm from 'node:vm'

const DOCS = join(dirname(fileURLToPath(import.meta.url)), '..')

const source = readFileSync(join(DOCS, 'search.js'), 'utf8')
// The scoring lives inside an IIFE with no exports; reach it by injecting a hook before the tail.
const ANCHOR = '  loadIndex()\n})()'
if (!source.includes(ANCHOR)) {
  console.error('✗ search.js tail changed — update ANCHOR in this script')
  process.exit(1)
}
const patched = source.replace(
  ANCHOR,
  '  globalThis.__zs = { search, setData: (d) => { if (d.stop) STOP = new Set(d.stop); data = d } }\n})()',
)

const noop = () => {}
const el = () => ({
  style: {}, classList: { add: noop, remove: noop, toggle: noop }, dataset: {},
  appendChild: noop, addEventListener: noop, querySelector: () => el(), querySelectorAll: () => [],
  setAttribute: noop, remove: noop, focus: noop,
})
const sandbox = {
  console,
  fetch: () => Promise.reject(new Error('no network in test')),
  localStorage: { getItem: () => null, setItem: noop, removeItem: noop },
  document: {
    createElement: el, head: el(), body: el(), documentElement: { style: {} },
    addEventListener: noop, querySelector: () => null, querySelectorAll: () => [], activeElement: null,
  },
}
sandbox.globalThis = sandbox
sandbox.window = sandbox
vm.createContext(sandbox)
vm.runInContext(patched, sandbox)

const { search, setData } = sandbox.__zs
setData(JSON.parse(readFileSync(join(DOCS, 'search-index.json'), 'utf8')))

// [query, slug that must rank #1 — or a list when more than one answer is defensible,
//  optional heading anchor the top result must deep-link to]
const CASES = [
  ['quickstart', 'quickstart'],
  ['send image', 'messaging/media'],
  ['pairing code', 'whatsapp-web'],
  ['changelog', 'releases/changelog'],
  ["what's new", 'releases/changelog'],
  ['release notes', 'releases/changelog'],
  ['versioning', 'releases/versioning'],
  ['semver', 'releases/versioning'],
  ['support policy', 'releases/versioning'],
  ['which node version', ['releases/versioning', 'installation']],
  ['pin version', 'releases/versioning'],
  ['migrate from v3', 'releases/migration'],
  ['upgrade guide', 'releases/migration'],
  ['breaking changes', ['releases/migration', 'releases/changelog']],
  ['commands', ['bots/commands', 'reference/commands']],
  ['plugins', 'bots/plugins'],
  ['broadcast', 'bots/broadcast-and-schedule'],
  ['storage', 'data/storage'],
  ['cloud api setup', 'cloud/setup'],
  ['webhook', 'cloud/webhook'],
  ['troubleshooting', 'reference/troubleshooting'],
  ['glossary', 'reference/glossary'],
  ['feature matrix', 'feature-matrix'],
  ['kirim foto', 'messaging/media'],
  ['jadwal siaran', 'bots/broadcast-and-schedule'],
  // Identifiers: typed exactly as they appear in code, and the section that explains them.
  ['FFMPEG_PATH', 'installation', 'ffmpeg-comes-bundled'],
  ['clearAuthOn', 'whatsapp-web', 'when-the-saved-session-is-deleted'],
  ['tablePrefix', ['reference/storage', 'data/storage']],
  ['maxConcurrentFfmpeg', ['data/server-sizing', 'reference/client-options']],
  ['allowUnsigned', ['cloud/setup', 'cloud/webhook', 'reference/client-options']],
  ['commandPrefix', 'bots/commands'],
  ['QUEUE_FULL', 'reference/error-codes', 'queue_full'],
  ['STORE_NOT_AVAILABLE', 'reference/error-codes', 'store_not_available'],
  ['server sizing', 'data/server-sizing'],
  ['how much ram', 'data/server-sizing'],
  ['animated sticker', 'installation', 'animated-stickers'],
]

let failed = 0
for (const [query, expected, anchor] of CASES) {
  const hits = search(query)
  const top = hits[0]?.doc?.u?.replace(/^\//, '') ?? '(no results)'
  const want = (Array.isArray(expected) ? expected : [expected]).map((e) => (e === 'index' ? '' : e))
  if (!want.includes(top)) {
    failed++
    const runners = hits.slice(0, 3).map((h) => h.doc.u).join(', ')
    console.error(`✗ "${query}" → ${top || '/'} (want ${expected}) — top 3: ${runners}`)
  } else if (anchor && hits[0].section?.a !== anchor) {
    failed++
    console.error(`✗ "${query}" → ${top}#${hits[0].section?.a ?? '(page top)'} (want #${anchor})`)
  }
}

if (failed) {
  console.error(`\n✗ ${failed}/${CASES.length} queries rank wrong`)
  process.exit(1)
}
console.log(`✓ search ranking: ${CASES.length}/${CASES.length} queries put the right page first`)
