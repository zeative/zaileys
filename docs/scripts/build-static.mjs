// Builds the self-hosted static site: Mintlify export + Pagefind search + a real 404 page.
// The hosted plan's search and 404 don't ship in an export, so we add our own here.
// Usage: node docs/scripts/build-static.mjs [outDir]   (default: docs-dist/)
import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync, mkdirSync, readdirSync, statSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const DOCS = join(ROOT, 'docs')
const OUT = process.argv[2] ? join(ROOT, process.argv[2]) : join(ROOT, 'docs-dist')

const run = (cmd, args, cwd) => execFileSync(cmd, args, { cwd, stdio: 'inherit' })
const step = (msg) => console.log(`\n▸ ${msg}`)

const walk = (dir) =>
  readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    return statSync(path).isDirectory() ? walk(path) : [path]
  })

// ---------------------------------------------------------------- 1. export
step('Exporting the Mintlify site')
const tmp = mkdtempSync(join(tmpdir(), 'zaileys-docs-'))
const zip = join(tmp, 'export.zip')
run('npx', ['-y', 'mint@latest', 'export', '--output', zip], DOCS)

rmSync(OUT, { recursive: true, force: true })
mkdirSync(OUT, { recursive: true })
run('unzip', ['-q', zip, '-d', OUT])
rmSync(tmp, { recursive: true, force: true })

// A stale index would be served alongside the fresh one.
for (const dir of ['pagefind', '_pagefind']) rmSync(join(OUT, dir), { recursive: true, force: true })

// ------------------------------------------------------- 2. search index
step('Building the Pagefind search index')
run('npx', ['-y', 'pagefind@1', '--site', OUT, '--output-subdir', '_pagefind'])

// --------------------------------------------------------- 3. search UI
// Written here rather than kept in docs/: Mintlify auto-loads any .js in the
// content directory, which would hijack the working search in `mint dev` too.
const SEARCH_JS = String.raw`(() => {
  const OPEN_KEYS = new Set(['k', 'K'])
  let modal, ui, lastFocused

  const build = () => {
    modal = document.createElement('div')
    modal.id = 'zaileys-search'
    modal.hidden = true
    modal.setAttribute('role', 'dialog')
    modal.setAttribute('aria-modal', 'true')
    modal.setAttribute('aria-label', 'Search the documentation')
    modal.innerHTML = '<div class="zs-backdrop"></div><div class="zs-panel"><div id="zaileys-search-ui"></div></div>'
    document.body.appendChild(modal)
    modal.querySelector('.zs-backdrop').addEventListener('click', close)
    ui = new window.PagefindUI({
      element: '#zaileys-search-ui',
      showImages: false,
      showSubResults: true,
      resetStyles: false,
      translations: { placeholder: 'Search the docs', zero_results: 'No page matches [SEARCH_TERM]' },
    })
  }

  const open = () => {
    if (!window.PagefindUI) return
    if (!modal) build()
    lastFocused = document.activeElement
    modal.hidden = false
    document.documentElement.style.overflow = 'hidden'
    const input = modal.querySelector('input')
    if (input) { input.focus(); input.select() }
  }

  const close = () => {
    if (!modal || modal.hidden) return
    modal.hidden = true
    document.documentElement.style.overflow = ''
    // Dialogs hand focus back to whatever opened them.
    if (lastFocused && lastFocused.focus) lastFocused.focus()
  }

  // Capture phase: the built-in button opens a dead "run mint login" dialog in an export.
  document.addEventListener(
    'click',
    (event) => {
      const trigger = event.target.closest && event.target.closest('#search-bar-entry, #search-bar-entry-mobile')
      if (!trigger) return
      event.preventDefault()
      event.stopImmediatePropagation()
      open()
    },
    true,
  )

  document.addEventListener('keydown', (event) => {
    if ((event.metaKey || event.ctrlKey) && OPEN_KEYS.has(event.key)) {
      event.preventDefault()
      open()
    } else if (event.key === 'Escape') {
      close()
    }
  })

  // Follow a result: the site is a SPA, so let it navigate, then close.
  document.addEventListener('click', (event) => {
    if (modal && !modal.hidden && event.target.closest('#zaileys-search a')) setTimeout(close, 0)
  })
})()`

const SEARCH_CSS = `#zaileys-search[hidden]{display:none}
#zaileys-search{position:fixed;inset:0;z-index:1000}
#zaileys-search .zs-backdrop{position:absolute;inset:0;background:rgba(3,5,8,.6);backdrop-filter:blur(2px)}
#zaileys-search .zs-panel{position:relative;margin:8vh auto 0;max-width:640px;width:calc(100% - 2rem);
  background:var(--zs-bg,#fff);border:1px solid var(--zs-border,#e5e7eb);border-radius:14px;padding:14px;
  box-shadow:0 24px 60px rgba(0,0,0,.35);max-height:76vh;overflow:auto}
html.dark #zaileys-search .zs-panel{--zs-bg:#0d1013;--zs-border:#23282f}
html.dark #zaileys-search{--pagefind-ui-text:#e6e9ee;--pagefind-ui-background:#0d1013;--pagefind-ui-border:#23282f}
#zaileys-search{--pagefind-ui-primary:#237f2a;--pagefind-ui-font:inherit;--pagefind-ui-border-radius:10px}`

step('Injecting search into every page')
const INJECT = [
  `<link rel="stylesheet" href="/_pagefind/pagefind-ui.css">`,
  `<style>${SEARCH_CSS}</style>`,
  `<script src="/_pagefind/pagefind-ui.js"></script>`,
  `<script src="/zaileys-search.js" defer></script>`,
].join('')

writeFileSync(join(OUT, 'zaileys-search.js'), SEARCH_JS)

let injected = 0
for (const file of walk(OUT)) {
  if (!file.endsWith('.html')) continue
  const html = readFileSync(file, 'utf8')
  if (!html.includes('</body>') || html.includes('/zaileys-search.js')) continue
  writeFileSync(file, html.replace('</body>', `${INJECT}</body>`))
  injected++
}
console.log(`  injected into ${injected} pages`)

// ------------------------------------------------------------- 4. 404 page
// The export ships no 404, so a missing URL would return a bare server error.
step('Writing 404.html')
const NOT_FOUND = `<!doctype html>
<html lang="en" class="dark">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Page not found — Zaileys</title>
    <link rel="icon" href="/favicon.png">
    <style>
      :root{color-scheme:dark}
      body{margin:0;min-height:100vh;display:grid;place-items:center;background:#0b0d10;color:#e6e9ee;
        font-family:Geist,ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;text-align:center;padding:24px}
      .code{font-size:72px;font-weight:700;letter-spacing:-2px;color:#7ed957;margin:0}
      h1{font-size:22px;font-weight:600;margin:8px 0 12px}
      p{color:#aab2bd;max-width:38rem;line-height:1.6;margin:0 auto 24px}
      a{color:#7ed957}
      .row{display:flex;gap:12px;flex-wrap:wrap;justify-content:center}
      .row a{display:inline-block;padding:9px 14px;border:1px solid #23282f;border-radius:10px;text-decoration:none;color:#e6e9ee}
      .row a:hover{border-color:#3a424c}
    </style>
  </head>
  <body>
    <main>
      <p class="code">404</p>
      <h1>Page not found</h1>
      <p>This page doesn't exist, or it moved when the docs were rebuilt.</p>
      <div class="row">
        <a href="/">Introduction</a>
        <a href="/quickstart">Quickstart</a>
        <a href="/reference/troubleshooting">Troubleshooting</a>
      </div>
    </main>
  </body>
</html>
`
writeFileSync(join(OUT, '404.html'), NOT_FOUND)

// ---------------------------------------------------------- 5. host config
// Ships inside the output because the deployed artifact is this folder itself.
step('Writing vercel.json')
const VERCEL = {
  $schema: 'https://openapi.vercel.sh/vercel.json',
  trailingSlash: false,
  headers: [
    {
      // Next.js asset filenames carry a content hash, so they never go stale.
      source: '/_next/static/(.*)',
      headers: [{ key: 'Cache-Control', value: 'public, max-age=31536000, immutable' }],
    },
    {
      // The search index is rebuilt on every deploy; keep it short-lived.
      source: '/_pagefind/(.*)',
      headers: [{ key: 'Cache-Control', value: 'public, max-age=3600' }],
    },
  ],
}
writeFileSync(join(OUT, 'vercel.json'), `${JSON.stringify(VERCEL, null, 2)}\n`)

const pages = walk(OUT).filter((f) => f.endsWith('.html')).length
console.log(`\n✓ static site ready in ${OUT.replace(ROOT + '/', '')} — ${pages} pages, search index, 404, vercel.json\n`)
