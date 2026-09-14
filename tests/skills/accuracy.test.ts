import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
// @ts-expect-error -- plain ESM script without type declarations
import { checkDocsLinks, checkErrorCodes, checkSnippets } from '../../scripts/check-skill.mjs'

type Issue = { rule: string; file: string; line?: number; message: string }

const dirs: string[] = []
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true })
})

const tree = (files: Record<string, string>): string => {
  const root = mkdtempSync(join(tmpdir(), 'check-skill-accuracy-'))
  dirs.push(root)
  for (const [path, content] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true })
    writeFileSync(join(root, path), content)
  }
  return root
}

describe('checkErrorCodes', () => {
  const src = {
    'src/builder/errors.ts': "export type BuilderErrorCode =\n  | 'MEDIA_LOAD_FAILED'\n  | 'SEND_FAILED'\n",
    'src/cloud/errors.ts':
      "export type CloudErrorCode = 'AUTH' | 'RATE_LIMITED'\nexport class ZaileysProviderError extends Error {\n  readonly code = 'UNSUPPORTED_ON_CLOUD'\n}\n",
  }

  it('passes when errors.md names every code from src', () => {
    const root = tree({
      ...src,
      'skill/references/errors.md': '# Errors\n\n`MEDIA_LOAD_FAILED`, `SEND_FAILED`, `AUTH`, `RATE_LIMITED`, `UNSUPPORTED_ON_CLOUD`\n',
    })
    expect(checkErrorCodes(join(root, 'skill'), join(root, 'src'))).toEqual([])
  })

  it('lists each code missing from errors.md', () => {
    const root = tree({ ...src, 'skill/references/errors.md': '# Errors\n\n`SEND_FAILED` and `AUTH`\n' })
    const missing = checkErrorCodes(join(root, 'skill'), join(root, 'src')).map((i: Issue) => i.message)
    expect(missing).toEqual([
      expect.stringContaining('MEDIA_LOAD_FAILED'),
      expect.stringContaining('RATE_LIMITED'),
      expect.stringContaining('UNSUPPORTED_ON_CLOUD'),
    ])
  })

  it('does not count a code that only appears inside a longer name', () => {
    const root = tree({ ...src, 'skill/references/errors.md': '# Errors\n\n`MEDIA_LOAD_FAILED` `SEND_FAILED` `AUTH_EXPIRED` `RATE_LIMITED` `UNSUPPORTED_ON_CLOUD`\n' })
    expect(checkErrorCodes(join(root, 'skill'), join(root, 'src')).map((i: Issue) => i.message)).toEqual([expect.stringContaining('AUTH')])
  })
})

describe('checkDocsLinks', () => {
  const docs = {
    'docs/index.mdx': '---\ntitle: Home\n---\n\n## Get started\n',
    'docs/cloud/webhook.mdx': '---\ntitle: Webhook\n---\n\n## Why Express needs the raw body\n\n### `invalid signature` (401)\n',
    'docs/bots/index.mdx': '---\ntitle: Bots\n---\n',
  }

  it('accepts pages, section anchors, the home page, and the llms files', () => {
    const root = tree({
      ...docs,
      'skill/SKILL.md':
        'See https://zaileys.kejaa.id, [webhook](https://zaileys.kejaa.id/cloud/webhook#why-express-needs-the-raw-body), ' +
        '<https://zaileys.kejaa.id/cloud/webhook#invalid-signature-401>, https://zaileys.kejaa.id/bots, https://zaileys.kejaa.id/llms-full.txt.\n',
    })
    expect(checkDocsLinks(join(root, 'skill'), join(root, 'docs'))).toEqual([])
  })

  it('reports a page that does not exist', () => {
    const root = tree({ ...docs, 'skill/references/cloud-api.md': '# Cloud\n\nSee https://zaileys.kejaa.id/cloud/webhooks.\n' })
    expect(checkDocsLinks(join(root, 'skill'), join(root, 'docs'))).toEqual([
      expect.objectContaining({ rule: 'docs-page', file: 'references/cloud-api.md', line: 3 }),
    ])
  })

  it('accepts explicit heading ids', () => {
    const root = tree({ ...docs, 'docs/bots/index.mdx': '---\ntitle: Bots\n---\n\n## Use `client.use()` {#middleware}\n', 'skill/SKILL.md': 'https://zaileys.kejaa.id/bots#middleware\n' })
    expect(checkDocsLinks(join(root, 'skill'), join(root, 'docs'))).toEqual([])
  })

  it('rejects anchors to headings whose rendered id cannot be predicted', () => {
    const root = tree({ ...docs, 'docs/bots/index.mdx': "---\ntitle: Bots\n---\n\n## Run `client.use()` first\n", 'skill/SKILL.md': 'https://zaileys.kejaa.id/bots#run-clientuse-first\n' })
    expect(checkDocsLinks(join(root, 'skill'), join(root, 'docs'))).toEqual([expect.objectContaining({ rule: 'docs-anchor-unstable', line: 1 })])
  })

  it('reports an anchor that matches no heading', () => {
    const root = tree({ ...docs, 'skill/SKILL.md': 'https://zaileys.kejaa.id/cloud/webhook#raw-body\n' })
    expect(checkDocsLinks(join(root, 'skill'), join(root, 'docs'))).toEqual([expect.objectContaining({ rule: 'docs-anchor', line: 1 })])
  })
})

describe('checkSnippets', () => {
  it('type-checks ts blocks and template files against src, reporting the skill file and line', { timeout: 120_000 }, () => {
    const root = tree({
      'skill/SKILL.md': [
        '# zaileys',
        '',
        '```ts',
        "import { Client } from 'zaileys'",
        "const bot = new Client({ sessionId: 'shop' })",
        "bot.on('text', async (m) => { await m.reply('hi') })",
        '```',
        '',
        'Uses the ambient `client` and `msg`:',
        '',
        '```ts',
        "await client.send(msg.roomId ?? msg.senderId).text('pong')",
        '```',
        '',
        '<!-- snippet-check: skip — v3 API shown for contrast -->',
        '```ts',
        "wa.on('messages', (ctx) => ctx.reply('old'))",
        '```',
        '',
        '```ts',
        "client.on('messages.upsert', () => {})",
        '```',
        '',
      ].join('\n'),
      'skill/assets/templates/web/src/bot.ts': "import { Client } from 'zaileys'\nimport { greet } from './greet.js'\n\nconst client = new Client({ authDir: './auth' })\ngreet(client)\n",
      'skill/assets/templates/web/src/greet.ts': "import type { Client } from 'zaileys'\n\nexport const greet = (client: Client) => client.on('connect', () => console.log('up'))\n",
    })
    const issues = checkSnippets(join(root, 'skill'))
    expect(issues).toEqual([
      expect.objectContaining({ rule: 'snippet', file: 'SKILL.md', line: 21 }),
      expect.objectContaining({ rule: 'snippet', file: 'assets/templates/web/src/bot.ts', line: 4 }),
    ])
  })

  it('requires a reason on skip markers', { timeout: 120_000 }, () => {
    const root = tree({ 'skill/SKILL.md': '<!-- snippet-check: skip -->\n```ts\nwa.on()\n```\n' })
    expect(checkSnippets(join(root, 'skill'))).toEqual([expect.objectContaining({ rule: 'snippet-skip', line: 1 })])
  })
})
