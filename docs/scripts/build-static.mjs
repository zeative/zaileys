// Builds the self-hosted static site: Mintlify export + search index + AI files + a real 404 page.
// The hosted plan's search and 404 don't ship in an export, so we bring our own.
// Usage: node docs/scripts/build-static.mjs [outDir]   (default: docs-dist/)
import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync, mkdirSync, readdirSync, statSync, readFileSync, writeFileSync, copyFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname, relative } from 'node:path'
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

// ------------------------------------------------------------ 1. source checks
// Checks that only need the .mdx and src/ run first, so they fail before the slow export.
step('Checking sources')
run('node', [join(DOCS, 'scripts', 'check-error-codes.mjs')], ROOT)

// ---------------------------------------------------------------- 2. export
step('Exporting the Mintlify site')
const tmp = mkdtempSync(join(tmpdir(), 'zaileys-docs-'))
const zip = join(tmp, 'export.zip')
run('npx', ['-y', 'mint@latest', 'export', '--output', zip], DOCS)

// The output dir is wiped on every build, which would drop the Vercel project link
// and make the next deploy create a stray project named after the folder.
const linkFile = join(OUT, '.vercel', 'project.json')
const savedLink = existsSync(linkFile) ? readFileSync(linkFile) : null

rmSync(OUT, { recursive: true, force: true })
mkdirSync(OUT, { recursive: true })

if (savedLink) {
  mkdirSync(join(OUT, '.vercel'), { recursive: true })
  writeFileSync(linkFile, savedLink)
}
run('unzip', ['-q', zip, '-d', OUT])
rmSync(tmp, { recursive: true, force: true })

// ------------------------------------------------------- 3. search & anchors
// Built after the export on purpose: section anchors come from the headings Mintlify rendered,
// since its slugs can't be predicted from the heading text alone.
step('Building the search index and checking anchors')
run('node', [join(DOCS, 'scripts', 'build-search-index.mjs'), relative(ROOT, OUT)], ROOT)
run('node', [join(DOCS, 'scripts', 'check-search.mjs')], ROOT)
run('node', [join(DOCS, 'scripts', 'check-anchors.mjs'), relative(ROOT, OUT)], ROOT)

// Mintlify's export copies .js but skips .json, so the index has to be placed by hand.
copyFileSync(join(DOCS, 'search-index.json'), join(OUT, 'search-index.json'))

// --------------------------------------------------------------- 4. llms.txt
step('Writing llms.txt and llms-full.txt')
run('node', [join(DOCS, 'scripts', 'build-llms.mjs'), OUT.split('/').pop()], ROOT)

// ------------------------------------------------------------- 5. 404 page
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

// ---------------------------------------------------------- 6. host config
// Ships inside the output because the deployed artifact is this folder itself.
step('Writing vercel.json')
// docs.json redirects are a hosted-plan feature; a static export ships none, so mirror them here.
const docsRedirects = JSON.parse(readFileSync(join(DOCS, 'docs.json'), 'utf8')).redirects ?? []
const VERCEL = {
  $schema: 'https://openapi.vercel.sh/vercel.json',
  trailingSlash: false,
  redirects: docsRedirects.map(({ source, destination, permanent }) => ({
    source,
    destination,
    permanent: permanent !== false,
  })),
  // Mintlify's page menu builds the Markdown URL in the browser as path + '.md', which gives '/.md' on
  // the home page; the export only has '/index.md'.
  rewrites: [{ source: '/.md', destination: '/index.md' }],
  headers: [
    {
      // Next.js asset filenames carry a content hash, so they never go stale.
      source: '/_next/static/(.*)',
      headers: [{ key: 'Cache-Control', value: 'public, max-age=31536000, immutable' }],
    },
    {
      // The search index is rebuilt on every deploy; keep it short-lived.
      source: '/search-index.json',
      headers: [{ key: 'Cache-Control', value: 'public, max-age=600' }],
    },
  ],
}
writeFileSync(join(OUT, 'vercel.json'), `${JSON.stringify(VERCEL, null, 2)}\n`)

const pages = walk(OUT).filter((f) => f.endsWith('.html')).length
console.log(
  `\n✓ static site ready in ${OUT.replace(ROOT + '/', '')} — ${pages} pages, search index, 404, ${docsRedirects.length} redirects, vercel.json\n`,
)
