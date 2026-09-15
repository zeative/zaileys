// Search and sharing metadata for the static export: a 1200×630 Open Graph image per page in the site's own look (satori
// lays out, resvg rasterizes, no browser), correct canonical/og:url, JSON-LD, sitemap.xml with image entries, robots.txt.
// Pages come from docs.json, so a new page gets all of it on the next build.
// Usage: node docs/scripts/build-seo.mjs <outDir>
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Resvg } from '@resvg/resvg-js'
import satori from 'satori'
import sharp from 'sharp'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const DOCS = join(ROOT, 'docs')
const OUT = process.argv[2] ? join(ROOT, process.argv[2]) : join(ROOT, 'docs-dist')
const require = createRequire(import.meta.url)
const pkgDir = (name) => dirname(require.resolve(`${name}/package.json`))

const docs = JSON.parse(readFileSync(join(DOCS, 'docs.json'), 'utf8'))
const SITE = (docs.seo?.metatags?.canonical ?? 'https://zaileys.kejaa.id').replace(/\/$/, '')
const HOST = SITE.replace(/^https?:\/\//, '')

const font = (pkg, file) => readFileSync(join(pkgDir(`@fontsource/${pkg}`), 'files', file))
const fonts = [
  { name: 'Geist', weight: 400, data: font('geist', 'geist-latin-400-normal.woff') },
  { name: 'Geist', weight: 500, data: font('geist', 'geist-latin-500-normal.woff') },
  { name: 'Geist', weight: 600, data: font('geist', 'geist-latin-600-normal.woff') },
  { name: 'Geist Mono', weight: 400, data: font('geist-mono', 'geist-mono-latin-400-normal.woff') },
  { name: 'Geist Mono', weight: 500, data: font('geist-mono', 'geist-mono-latin-500-normal.woff') },
  { name: 'Inter', weight: 700, data: font('inter', 'inter-latin-700-normal.woff') },
]

const pages = docs.navigation.tabs.flatMap((tab) =>
  (tab.groups ?? [{ group: tab.tab, pages: tab.pages ?? [] }]).flatMap((group) =>
    (group.pages ?? []).map((slug) => ({ slug, tab: tab.tab, group: group.group })),
  ),
)

const frontmatter = (slug) => {
  const block = /^---\n([\s\S]*?)\n---/.exec(readFileSync(join(DOCS, `${slug}.mdx`), 'utf8'))?.[1] ?? ''
  const meta = {}
  for (const line of block.split('\n')) {
    const m = /^(\w+):\s*(.*)$/.exec(line)
    if (m && !m[2].startsWith('[')) meta[m[1]] = m[2].trim().replace(/^["']|["']$/g, '')
  }
  return meta
}

// satori rejects a div with several children unless it is a flex container, so every node gets display: flex.
const h = (type, style, ...children) => {
  const kids = children.flat().filter((c) => c !== null && c !== undefined)
  return { type, props: { style: { display: 'flex', ...style }, ...(kids.length ? { children: kids.length === 1 ? kids[0] : kids } : {}) } }
}
const img = (src, style) => ({ type: 'img', props: { src, style } })
const svgUri = (svg) => `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`

// The logo SVG nests a PNG mark next to its wordmark; resvg can't reach an image inside an image, so both are rebuilt.
const logoMark = /href="(data:image\/png;base64,[^"]+)"/.exec(readFileSync(join(DOCS, 'logo', 'dark.svg'), 'utf8'))[1]
const ICONS = join(pkgDir('lucide-static'), 'icons')
const icon = (name, color, size) => {
  const file = [join(ICONS, `${name}.svg`), join(ICONS, 'book-open.svg')].find((f) => existsSync(f))
  const svg = readFileSync(file, 'utf8')
    .replace(/currentColor/g, color)
    .replace(/width="24"/, `width="${size}"`)
    .replace(/height="24"/, `height="${size}"`)
    .replace(/stroke-width="2"/, 'stroke-width="1.6"')
  return svgUri(svg)
}

const CATEGORY_GRADIENTS = {
  games: ['#7c5cff', '#ff4f8b'],
  music: ['#b44cff', '#38b6ff'],
  fun: ['#ffc93c', '#ff4f8b'],
  business: ['#2ed8a7', '#38b6ff'],
  calculators: ['#ff8a3d', '#ffc93c'],
  data: ['#38b6ff', '#7c5cff'],
}

// Grid, glows, and the halo behind the icon are drawn once; per-page layers only carry text and icons.
const backgroundJpegBase = new Resvg(
  `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
<defs>
  <pattern id="grid" width="44" height="44" patternUnits="userSpaceOnUse"><path d="M44 0H0V44" fill="none" stroke="#ffffff" stroke-opacity="0.07" stroke-width="1"/></pattern>
  <radialGradient id="fade" cx="330" cy="0" r="820" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#fff"/><stop offset="0.35" stop-color="#fff" stop-opacity="0.85"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient>
  <mask id="m"><rect width="1200" height="630" fill="url(#fade)"/></mask>
  <radialGradient id="glow" cx="260" cy="0" r="620" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#237F2A" stop-opacity="0.55"/><stop offset="0.55" stop-color="#237F2A" stop-opacity="0.16"/><stop offset="1" stop-color="#237F2A" stop-opacity="0"/></radialGradient>
  <radialGradient id="glow2" cx="1120" cy="700" r="520" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#7ED957" stop-opacity="0.14"/><stop offset="1" stop-color="#7ED957" stop-opacity="0"/></radialGradient>
  <radialGradient id="art" cx="1016" cy="350" r="230" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#237F2A" stop-opacity="0.28"/><stop offset="1" stop-color="#237F2A" stop-opacity="0"/></radialGradient>
</defs>
<rect width="1200" height="630" fill="#0B0D10"/>
<rect width="1200" height="630" fill="url(#grid)" mask="url(#m)"/>
<rect width="1200" height="630" fill="url(#glow)"/>
<rect width="1200" height="630" fill="url(#glow2)"/>
<rect width="1200" height="630" fill="url(#art)"/>
</svg>`,
  { font: { loadSystemFonts: false } },
)
  .render()
  .asPng()

const artBox = { width: 240, height: 240, borderRadius: 48, alignItems: 'center', justifyContent: 'center' }
const steelBox = {
  ...artBox,
  border: '1px solid rgba(154,165,177,0.35)',
  backgroundImage: 'linear-gradient(180deg, rgba(255,255,255,0.08), rgba(255,255,255,0.015))',
}

const art = (page, meta) => {
  if (page.slug === 'index') return h('div', steelBox, img(logoMark, { width: 172, height: 172 }))
  const template = page.slug.startsWith('templates/') && join(DOCS, 'templates', 'source', `${page.slug.slice(10)}.json`)
  if (template && existsSync(template)) {
    const t = JSON.parse(readFileSync(template, 'utf8'))
    const [from, to] = CATEGORY_GRADIENTS[t.category] ?? CATEGORY_GRADIENTS.games
    return h('div', { ...artBox, backgroundImage: `linear-gradient(135deg, ${from}, ${to})` }, img(icon(t.icon, '#ffffff', 132), { width: 132, height: 132 }))
  }
  return h('div', steelBox, img(icon(meta.icon ?? 'book-open', '#7ED957', 128), { width: 128, height: 128 }))
}

const card = (page) => {
  const meta = frontmatter(page.slug)
  const home = page.slug === 'index'
  const title = home ? 'Zaileys' : (meta.title ?? page.slug)
  const eyebrow = home ? 'Documentation' : page.group === page.tab ? page.tab : page.group
  const path = home ? '' : `/${page.slug}`
  return h(
    'div',
    { position: 'relative', width: 1200, height: 630, fontFamily: 'Geist', color: '#f8fafc' },
    h(
      'div',
      { flexDirection: 'column', position: 'absolute', left: 64, right: 64, top: 56, bottom: 48 },
      h(
        'div',
        { alignItems: 'center', justifyContent: 'space-between' },
        h(
          'div',
          { alignItems: 'center', gap: 14 },
          img(logoMark, { width: 50, height: 50 }),
          h('div', { fontFamily: 'Inter', fontWeight: 700, fontSize: 32, letterSpacing: -0.6, backgroundImage: 'linear-gradient(180deg, #F8FAFC, #9AA5B1)', backgroundClip: 'text', color: 'transparent' }, 'Zaileys'),
        ),
        h(
          'div',
          { fontSize: 22, fontWeight: 500, color: '#cbd5e1', padding: '9px 20px', borderRadius: 999, border: '1px solid rgba(154,165,177,0.35)', backgroundImage: 'linear-gradient(180deg, rgba(255,255,255,0.07), rgba(255,255,255,0.01))' },
          home ? 'Docs' : page.tab,
        ),
      ),
      h(
        'div',
        { flex: 1, alignItems: 'center', gap: 56 },
        h(
          'div',
          { flexDirection: 'column', flex: 1, minWidth: 0 },
          h('div', { fontSize: 28, fontWeight: 600, color: '#7ED957', marginBottom: 16 }, eyebrow),
          h(
            'div',
            { display: 'block', fontSize: title.length > 34 ? 62 : 76, lineHeight: 1.06, fontWeight: 600, letterSpacing: -2, backgroundImage: 'linear-gradient(180deg, #f8fafc 0%, #9aa5b1 100%)', backgroundClip: 'text', color: 'transparent', lineClamp: 2, paddingBottom: 6 },
            title,
          ),
          meta.description ? h('div', { display: 'block', marginTop: 18, fontSize: 29, lineHeight: 1.38, color: '#9aa5b1', lineClamp: 2 }, meta.description) : null,
        ),
        art(page, meta),
      ),
      h('div', { height: 1, backgroundImage: 'linear-gradient(90deg, rgba(154,165,177,0), #9aa5b1 25%, #e2e8f0 50%, #9aa5b1 75%, rgba(154,165,177,0))', opacity: 0.55 }),
      h(
        'div',
        { justifyContent: 'space-between', alignItems: 'center', paddingTop: 22, fontFamily: 'Geist Mono', fontSize: 23, color: '#8b95a1' },
        h(
          'div',
          { alignItems: 'center' },
          h('div', { width: 10, height: 10, borderRadius: 5, backgroundColor: '#7ED957', marginRight: 14 }),
          h('span', { color: '#e2e8f0', fontWeight: 500 }, HOST),
          path ? h('span', {}, path) : null,
        ),
        h('div', {}, 'TypeScript WhatsApp bots'),
      ),
    ),
  )
}

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

// Mintlify's export writes canonical and og:url for its internal route (/src/_props/…) and one site-wide og:image.
const setTag = (html, pattern, next) => (pattern.test(html) ? html.replace(pattern, next) : html.replace('</head>', `${next}</head>`))
const setMeta = (html, attr, key, value) =>
  setTag(html, new RegExp(`<meta ${attr}="${key}" content="[^"]*"\\s*/?>`), `<meta ${attr}="${key}" content="${esc(value)}"/>`)

const started = Date.now()
mkdirSync(join(OUT, 'og'), { recursive: true })
const entries = []
const missing = []
for (const page of pages) {
  const meta = frontmatter(page.slug)
  const svg = await satori(card(page), { width: 1200, height: 630, fonts })
  const layer = new Resvg(svg, { fitTo: { mode: 'width', value: 1200 }, font: { loadSystemFonts: false } }).render().asPng()
  const file = `${page.slug.replace(/\//g, '-')}.jpg`
  // JPEG keeps the gradients smooth; a palette PNG bands them.
  const jpeg = await sharp(backgroundJpegBase).composite([{ input: layer }]).jpeg({ quality: 88, mozjpeg: true, chromaSubsampling: '4:4:4' }).toBuffer()
  writeFileSync(join(OUT, 'og', file), jpeg)

  const home = page.slug === 'index'
  const url = home ? `${SITE}/` : `${SITE}/${page.slug}`
  const image = `${SITE}/og/${file}`
  const title = home ? docs.name : `${meta.title ?? page.slug} - ${docs.name}`
  const htmlPaths = (home ? [join(OUT, 'index.html'), join(OUT, 'index', 'index.html')] : [join(OUT, page.slug, 'index.html'), join(OUT, `${page.slug}.html`)]).filter((p) => existsSync(p))
  if (!htmlPaths.length) {
    missing.push(page.slug)
    continue
  }
  const jsonLd = JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    name: meta.title ?? docs.name,
    description: meta.description,
    url,
    inLanguage: 'en',
    isPartOf: { '@type': 'WebSite', name: docs.name, url: `${SITE}/` },
    primaryImageOfPage: { '@type': 'ImageObject', url: image, width: 1200, height: 630 },
  }).replace(/</g, '\\u003c')
  for (const htmlPath of htmlPaths) {
    let html = readFileSync(htmlPath, 'utf8')
    html = setMeta(html, 'property', 'og:image', image)
    html = setMeta(html, 'property', 'og:image:alt', title)
    html = setMeta(html, 'name', 'twitter:image', image)
    html = setMeta(html, 'property', 'og:url', url)
    html = setTag(html, /<link rel="canonical" href="[^"]*"\s*\/?>/, `<link rel="canonical" href="${esc(url)}"/>`)
    // Lets Google show the large image in Search and Discover.
    html = setMeta(html, 'name', 'robots', 'index, follow, max-image-preview:large')
    html = setTag(html, /<script type="application\/ld\+json" data-zaileys-seo>[\s\S]*?<\/script>/, `<script type="application/ld+json" data-zaileys-seo>${jsonLd}</script>`)
    writeFileSync(htmlPath, html)
  }
  entries.push({ url, image, title })
}

if (missing.length) {
  console.error(`✗ seo: no exported page for ${missing.join(', ')}`)
  process.exit(1)
}

// The export ships no sitemap; the image entries are how Google Images learns which picture belongs to which page.
writeFileSync(
  join(OUT, 'sitemap.xml'),
  `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">
${entries.map((e) => `  <url>\n    <loc>${esc(e.url)}</loc>\n    <image:image>\n      <image:loc>${esc(e.image)}</image:loc>\n    </image:image>\n  </url>`).join('\n')}
</urlset>
`,
)
writeFileSync(join(OUT, 'robots.txt'), `User-agent: *\nAllow: /\n\nSitemap: ${SITE}/sitemap.xml\n`)
console.log(`✓ seo: ${entries.length} pages with og images, canonical URLs and JSON-LD; sitemap.xml and robots.txt (${((Date.now() - started) / 1000).toFixed(1)}s)`)
