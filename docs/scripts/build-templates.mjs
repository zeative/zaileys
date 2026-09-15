// Generates the Templates tab from docs/templates/source: one page per card (live preview + a copy-once bot.ts),
// the gallery index, and the tab in docs.json. `--check` fails when a generated file is out of date.
import { readdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const DOCS = join(dirname(fileURLToPath(import.meta.url)), '..')
const SOURCE = join(DOCS, 'templates', 'source')
const CHECK = process.argv.includes('--check')
// Rules only, no writes: safe while several templates are being written at once.
const VALIDATE = process.argv.includes('--validate')
const MAX_BYTES = 256 * 1024
const DATA = '/*DATA*/null'
const CATEGORIES = [
  { id: 'games', title: 'Games', blurb: 'Quick games people play right inside the chat.' },
  { id: 'music', title: 'Music & sound', blurb: 'Players and instruments that make sound with Web Audio, no files needed.' },
  { id: 'fun', title: 'Just for fun', blurb: 'Greetings, dice, and pickers that make a chat livelier.' },
  { id: 'business', title: 'Business', blurb: 'Receipts, tickets, cards, and orders customers keep in the chat.' },
  { id: 'calculators', title: 'Calculators', blurb: 'Small tools that use the phone keyboard.' },
  { id: 'data', title: 'Data & charts', blurb: 'Charts, results, and timers drawn on a canvas.' },
]
const INPUTS = { tap: 'Tap', keyboard: 'Phone keyboard', swipe: 'Swipe', none: 'None, display only' }

const problems = []
const fail = (id, message) => problems.push(`${id}: ${message}`)

const templates = readdirSync(SOURCE)
  .filter((f) => f.endsWith('.json'))
  .sort()
  .map((file) => {
    const meta = JSON.parse(readFileSync(join(SOURCE, file), 'utf8'))
    const id = file.replace(/\.json$/, '')
    const htmlPath = join(SOURCE, `${id}.html`)
    if (meta.id !== id) fail(id, `"id" must be "${id}"`)
    if (!existsSync(htmlPath)) fail(id, 'missing the .html source')
    const markup = existsSync(htmlPath) ? readFileSync(htmlPath, 'utf8').trim() : ''

    // The markup is pasted into a template literal, so these would break or alter the copied code.
    if (/[`\\]|\$\{/.test(markup)) fail(id, 'the card may not contain backticks, backslashes, or "${"')
    // The card has no network, links, or storage on WhatsApp; a template that relies on them only works in the preview.
    if (/\b(fetch|XMLHttpRequest|WebSocket|EventSource|localStorage|sessionStorage|indexedDB)\b|<a\s|window\.open|<form/i.test(markup)) {
      fail(id, 'the card uses network, storage, links, or forms, which WhatsApp blocks')
    }
    if (/https?:\/\//.test(markup)) fail(id, 'the card loads or links an external URL; inline it as data: instead')
    if (!CATEGORIES.some((c) => c.id === meta.category)) fail(id, `unknown category "${meta.category}"`)
    if (!Number.isInteger(meta.height) || meta.height < 1 || meta.height > 4096) fail(id, '"height" must be 1–4096')
    if (!/^[a-z0-9]+$/.test(meta.command ?? '')) fail(id, '"command" must be lowercase letters and digits')
    if (!meta.title || !meta.description || !meta.fallback || !meta.icon || !meta.emoji) {
      fail(id, 'title, description, fallback, icon, and emoji are required')
    }
    for (const input of meta.inputs ?? []) if (!INPUTS[input]) fail(id, `unknown input "${input}"`)
    const hasData = meta.sample !== undefined
    if (hasData !== markup.includes(DATA)) fail(id, `use ${DATA} in the card exactly when "sample" is set`)

    const previewMarkup = markup.replace(DATA, JSON.stringify(meta.sample ?? null).replace(/</g, '\\u003c'))
    const bytes = Buffer.byteLength(previewMarkup, 'utf8')
    if (bytes > MAX_BYTES) fail(id, `${bytes} bytes, over the 256 KB htmlApp() default`)
    return { ...meta, id, markup, previewMarkup, bytes }
  })

const kb = (bytes) => `${(bytes / 1024).toFixed(1)} KB`
const q = (s) => JSON.stringify(s)
const indent = (text, pad) => text.split('\n').map((l) => (l ? pad + l : l)).join('\n')

const botFile = (t) => {
  const dataLine = t.sample === undefined ? '' : `const data = ${JSON.stringify(t.sample, null, 2)}\n\n`
  const card = t.sample === undefined ? t.markup : t.markup.replace(DATA, '${htmlJson(data)}')
  const imports = t.sample === undefined ? 'Client, html' : 'Client, html, htmlJson'
  return `import { ${imports} } from 'zaileys'

const client = new Client({ commandPrefix: '!' })

${dataLine}const card = html\`
${card}
\`

client.command('${t.command}', async (ctx) => {
  await ctx.send().htmlApp(card, {
    title: ${q(t.title)},
    height: ${t.height},
    device: ctx.senderDevice,
    fallback: ${q(t.fallback)},
  })
})
`
}

const page = (t) => {
  const category = CATEGORIES.find((c) => c.id === t.category)
  const tested = t.tested ? `WhatsApp Android — ${t.tested.device}, ${t.tested.date}` : 'Not yet tested on a phone'
  const inputs = (t.inputs ?? ['none']).map((i) => INPUTS[i]).join(', ')
  return `---
title: ${q(t.title)}
description: ${q(t.description)}
icon: ${q(t.icon)}
keywords: ${JSON.stringify(['htmlApp template', t.title.toLowerCase(), category.title.toLowerCase(), 'whatsapp html card'])}
---

{/* Generated by docs/scripts/build-templates.mjs from docs/templates/source/${t.id}.html. Edit the source, then run pnpm docs:templates. */}

import { HtmlAppPreview } from "/snippets/html-app-preview.jsx"

<HtmlAppPreview title=${q(t.title)} height={${t.height}} doc="${Buffer.from(t.previewMarkup, 'utf8').toString('base64')}" />

## Send it

Copy this into \`bot.ts\` and run it. From WhatsApp Android, send \`!${t.command}\` to the bot.

\`\`\`ts bot.ts
${botFile(t)}\`\`\`

| | |
| --- | --- |
| Height | ${t.height} px |
| Size | ${kb(t.bytes)} |
| Input | ${inputs} |
| Tested | ${tested} |

The card works only on WhatsApp Android, with no network or storage. Other devices get the \`fallback\` text. See [HTML apps](/messaging/html-app) for every option and limit.
`
}

const index = () => `---
title: "HTML app templates"
sidebarTitle: "All templates"
description: "Ready-made htmlApp cards — games, music, greetings, business cards, calculators, and charts — each with a live preview and one file to copy."
icon: "layout-template"
keywords: ["htmlApp templates", "html card templates", "whatsapp mini game", "whatsapp receipt card", "copy paste bot"]
---

{/* Generated by docs/scripts/build-templates.mjs. Edit docs/templates/source, then run pnpm docs:templates. */}

import { TemplateGrid } from "/snippets/template-gallery.jsx"

Each template is a complete \`bot.ts\`: copy it, run it, and send the command from WhatsApp Android. The preview on every page runs the real card with the same limits WhatsApp applies — no network, no storage, no scrolling, and the card's exact height.

<Warning>
  \`htmlApp()\` is an experimental WhatsApp format that renders only on WhatsApp Android. Read [HTML apps](/messaging/html-app) before you rely on it.
</Warning>

${CATEGORIES.map((c) => {
  const items = templates.filter((t) => t.category === c.id)
  if (!items.length) return ''
  return `## ${c.title}

${c.blurb}

<TemplateGrid items={${JSON.stringify(items.map((t) => ({ href: `/templates/${t.id}`, title: t.title, emoji: t.emoji, category: t.category, description: t.description, height: t.height, inputs: (t.inputs ?? ['none']).map((i) => INPUTS[i]).join(', ') })))}} />
`
})
  .filter(Boolean)
  .join('\n')}`

if (VALIDATE) {
  if (problems.length) {
    console.error(`✗ ${problems.length} template problem(s):\n  ${problems.join('\n  ')}`)
    process.exit(1)
  }
  console.log(`✓ templates: ${templates.length} valid (${templates.map((t) => `${t.id} ${(t.bytes / 1024).toFixed(1)} KB`).join(', ')})`)
  process.exit(0)
}

const outputs = new Map()
if (!problems.length) {
  for (const t of templates) outputs.set(join(DOCS, 'templates', `${t.id}.mdx`), page(t))
  outputs.set(join(DOCS, 'templates', 'index.mdx'), index())

  const docsPath = join(DOCS, 'docs.json')
  const docs = JSON.parse(readFileSync(docsPath, 'utf8'))
  const tab = {
    tab: 'Templates',
    icon: 'layout-template',
    groups: [
      { group: 'Start here', pages: ['templates/index'] },
      ...CATEGORIES.map((c) => ({ group: c.title, pages: templates.filter((t) => t.category === c.id).map((t) => `templates/${t.id}`) })).filter(
        (g) => g.pages.length,
      ),
    ],
  }
  const tabs = docs.navigation.tabs.filter((t) => t.tab !== 'Templates')
  const at = tabs.findIndex((t) => t.tab === 'Recipes') + 1
  tabs.splice(at > 0 ? at : tabs.length, 0, tab)
  docs.navigation.tabs = tabs
  docs.redirects = (docs.redirects ?? []).filter((r) => r.source !== '/templates')
  docs.redirects.push({ source: '/templates', destination: '/templates/index', permanent: false })
  outputs.set(docsPath, JSON.stringify(docs, null, 2) + '\n')
}

if (problems.length) {
  console.error(`✗ ${problems.length} template problem(s):\n  ${problems.join('\n  ')}`)
  process.exit(1)
}

const stale = [...outputs].filter(([path, content]) => !existsSync(path) || readFileSync(path, 'utf8') !== content)
if (CHECK) {
  if (stale.length) {
    console.error(`✗ out of date, run pnpm docs:templates:\n  ${stale.map(([p]) => p.replace(DOCS + '/', 'docs/')).join('\n  ')}`)
    process.exit(1)
  }
  console.log(`✓ templates: ${templates.length} up to date`)
} else {
  for (const [path, content] of stale) writeFileSync(path, content)
  console.log(`✓ templates: ${templates.length} generated, ${stale.length} file(s) written`)
}
