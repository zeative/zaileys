import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
// @ts-expect-error -- plain ESM script without type declarations
import { checkRepo, checkSkill } from '../../scripts/check-skill.mjs'

type Issue = { rule: string; file: string; line?: number; message: string }

const dirs: string[] = []
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true })
})

const tree = (files: Record<string, string>): string => {
  const root = mkdtempSync(join(tmpdir(), 'check-skill-'))
  dirs.push(root)
  for (const [path, content] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true })
    writeFileSync(join(root, path), content)
  }
  return root
}

const DESCRIPTION =
  'Builds, extends, debugs, reviews, upgrades, and deploys WhatsApp bots with the zaileys library. Use when a project imports zaileys or the user asks for a WhatsApp bot in TypeScript or JavaScript.'

const skillMd = (body = '# zaileys\n\nSee [providers](references/providers.md).\n', front = `name: zaileys\ndescription: ${DESCRIPTION}`) =>
  `---\n${front}\n---\n\n${body}`

const validSkill = (extra: Record<string, string> = {}) =>
  tree({
    'zaileys/SKILL.md': skillMd(),
    'zaileys/references/providers.md': '# Providers\n\nWhatsApp Web and the Cloud API.\n',
    ...extra,
  })

const rules = (issues: Issue[]) => issues.map((i) => i.rule)

describe('checkSkill', () => {
  it('accepts a well-formed skill', () => {
    expect(checkSkill(join(validSkill(), 'zaileys'))).toEqual([])
  })

  it('requires SKILL.md', () => {
    const root = tree({ 'zaileys/references/providers.md': '# Providers\n' })
    expect(rules(checkSkill(join(root, 'zaileys')))).toContain('skill-md')
  })

  it('rejects frontmatter keys outside the Agent Skills spec', () => {
    const root = tree({
      'zaileys/SKILL.md': skillMd(undefined, `name: zaileys\ndescription: ${DESCRIPTION}\nversion: 4.15.1\ntriggers: [wa]`),
      'zaileys/references/providers.md': '# Providers\n',
    })
    const issues = checkSkill(join(root, 'zaileys')).filter((i: Issue) => i.rule === 'frontmatter-key')
    expect(issues.map((i: Issue) => i.message).join('\n')).toMatch(/version[\s\S]*triggers/)
  })

  it('accepts optional spec keys including a nested metadata map', () => {
    const root = tree({
      'zaileys/SKILL.md': skillMd(
        undefined,
        `name: zaileys\ndescription: ${DESCRIPTION}\nlicense: MIT\ncompatibility: Node.js 20 or newer\nmetadata:\n  author: zeative`,
      ),
      'zaileys/references/providers.md': '# Providers\n',
    })
    expect(checkSkill(join(root, 'zaileys'))).toEqual([])
  })

  it('requires name to match the folder and the naming pattern', () => {
    const root = tree({
      'zaileys/SKILL.md': skillMd(undefined, `name: Zaileys_Skill\ndescription: ${DESCRIPTION}`),
      'zaileys/references/providers.md': '# Providers\n',
    })
    expect(rules(checkSkill(join(root, 'zaileys')))).toEqual(expect.arrayContaining(['name-format', 'name-folder']))
  })

  it('reads a folded block-scalar description', () => {
    const root = tree({
      'zaileys/SKILL.md': skillMd(undefined, `name: zaileys\ndescription: >-\n  Builds WhatsApp bots with zaileys.\n  Use when a project imports zaileys.`),
      'zaileys/references/providers.md': '# Providers\n',
    })
    expect(checkSkill(join(root, 'zaileys'))).toEqual([])
  })

  it('limits the description to 1024 characters', () => {
    const root = tree({
      'zaileys/SKILL.md': skillMd(undefined, `name: zaileys\ndescription: Builds WhatsApp bots. ${'Use when working with zaileys. '.repeat(40)}`),
      'zaileys/references/providers.md': '# Providers\n',
    })
    expect(rules(checkSkill(join(root, 'zaileys')))).toContain('description-length')
  })

  it('requires a third-person description', () => {
    const root = tree({
      'zaileys/SKILL.md': skillMd(undefined, 'name: zaileys\ndescription: I help you build WhatsApp bots with zaileys.'),
      'zaileys/references/providers.md': '# Providers\n',
    })
    expect(rules(checkSkill(join(root, 'zaileys')))).toContain('description-person')
  })

  it('keeps the SKILL.md body under 500 lines', () => {
    const root = tree({
      'zaileys/SKILL.md': skillMd(`# zaileys\n${'line\n'.repeat(500)}See [providers](references/providers.md).\n`),
      'zaileys/references/providers.md': '# Providers\n',
    })
    expect(rules(checkSkill(join(root, 'zaileys')))).toContain('body-length')
  })

  it('requires a table of contents in other files over 100 lines', () => {
    const long = `# Messaging\n\n${'text\n'.repeat(120)}`
    const withToc = `# Messaging\n\n## Contents\n\n- [Text](#text)\n\n${'text\n'.repeat(120)}`
    const missing = validSkill({ 'zaileys/references/messaging.md': long })
    const present = validSkill({ 'zaileys/references/messaging.md': withToc })
    expect(rules(checkSkill(join(missing, 'zaileys')))).toEqual(['toc'])
    expect(checkSkill(join(present, 'zaileys'))).toEqual([])
  })

  it('rejects links that leave the skill folder', () => {
    const root = validSkill({ 'zaileys/SKILL.md': skillMd('# zaileys\n\nSee [docs](../../docs/index.mdx).\n') })
    expect(rules(checkSkill(join(root, 'zaileys')))).toContain('link-escape')
  })

  it('reports SKILL.md links to files that do not exist', () => {
    const root = validSkill({ 'zaileys/SKILL.md': skillMd('# zaileys\n\nSee [errors](references/errors.md).\n') })
    const issue = checkSkill(join(root, 'zaileys')).find((i: Issue) => i.rule === 'link-missing')
    expect(issue).toMatchObject({ file: 'SKILL.md', line: 8 })
  })

  it('keeps references one level deep: only SKILL.md links to other skill files', () => {
    const root = validSkill({
      'zaileys/references/providers.md': '# Providers\n\nSee [errors](errors.md) and [the site](https://zaileys.kejaa.id/providers) and [below](#web).\n',
      'zaileys/references/errors.md': '# Errors\n',
    })
    const issues = checkSkill(join(root, 'zaileys'))
    expect(issues).toEqual([expect.objectContaining({ rule: 'link-depth', file: 'references/providers.md' })])
  })

  it('ignores link-like text inside code blocks', () => {
    const root = validSkill({
      'zaileys/references/providers.md': '# Providers\n\n```ts\nconst x = arr[0](other.md)\n```\n',
    })
    expect(checkSkill(join(root, 'zaileys'))).toEqual([])
  })

  it('uses `client`, not the v3 `wa` name, outside the migration reference', () => {
    const code = "```ts\nwa.on('text', (msg) => msg.reply('hi'))\n```\n"
    const root = validSkill({
      'zaileys/references/providers.md': `# Providers\n\n${code}`,
      'zaileys/references/migration.md': `# Migration\n\n${code}`,
    })
    expect(checkSkill(join(root, 'zaileys'))).toEqual([expect.objectContaining({ rule: 'terminology', file: 'references/providers.md' })])
  })

  it('rejects pinned zaileys versions outside the migration reference', () => {
    const root = validSkill({
      'zaileys/references/providers.md': '# Providers\n\nRun `npm install zaileys@4.15.1`.\n',
      'zaileys/assets/templates/web/package.json': '{ "dependencies": { "zaileys": "4.15.1" } }\n',
      'zaileys/references/migration.md': '# Migration\n\n`command` became `message` in 4.12.0: `npm install zaileys@4.12.0`.\n',
    })
    const issues = checkSkill(join(root, 'zaileys')).filter((i: Issue) => i.rule === 'pinned-version')
    expect(issues.map((i: Issue) => i.file).sort()).toEqual(['assets/templates/web/package.json', 'references/providers.md'])
  })

  it('allows major-range dependencies in templates', () => {
    const root = validSkill({ 'zaileys/assets/templates/web/package.json': '{ "dependencies": { "zaileys": "^4" } }\n' })
    expect(checkSkill(join(root, 'zaileys'))).toEqual([])
  })
})

describe('checkRepo', () => {
  const plugin = '{ "name": "zaileys-official", "description": "zaileys skill" }\n'
  const market = '{ "name": "zeative", "owner": { "name": "zeative" }, "plugins": [{ "name": "zaileys-official", "source": "./" }] }\n'

  const repo = (extra: Record<string, string> = {}) =>
    tree({
      'skills/zaileys/SKILL.md': skillMd(),
      'skills/zaileys/references/providers.md': '# Providers\n',
      '.claude-plugin/plugin.json': plugin,
      '.claude-plugin/marketplace.json': market,
      ...extra,
    })

  it('accepts a repo whose root is the plugin with one skill', () => {
    expect(checkRepo(repo())).toEqual([])
  })

  it('allows exactly one skill', () => {
    const root = repo({ 'skills/zaileys-debug/SKILL.md': skillMd(undefined, `name: zaileys-debug\ndescription: ${DESCRIPTION}`) })
    expect(rules(checkRepo(root))).toContain('one-skill')
  })

  it('rejects a pinned version in either manifest', () => {
    const root = repo({
      '.claude-plugin/plugin.json': '{ "name": "zaileys-official", "version": "4.2.0" }\n',
      '.claude-plugin/marketplace.json':
        '{ "name": "zeative", "plugins": [{ "name": "zaileys-official", "source": "./", "version": "4.2.0" }] }\n',
    })
    expect(checkRepo(root).filter((i: Issue) => i.rule === 'manifest-version')).toHaveLength(2)
  })

  it('requires the marketplace entry to use the repo root as source', () => {
    const root = repo({
      '.claude-plugin/marketplace.json': '{ "name": "zeative", "plugins": [{ "name": "zaileys-official", "source": "./plugins/zaileys-official" }] }\n',
    })
    expect(rules(checkRepo(root))).toContain('manifest-source')
  })

  it('keeps other plugin component paths out of the repo root', () => {
    const root = repo({ 'hooks/hooks.json': '{}\n', '.mcp.json': '{}\n' })
    expect(checkRepo(root).filter((i: Issue) => i.rule === 'root-components').map((i: Issue) => i.file).sort()).toEqual([
      '.mcp.json',
      'hooks',
    ])
  })

  it('prefixes skill issues with the skill path', () => {
    const root = repo({ 'skills/zaileys/SKILL.md': skillMd('# zaileys\n\nSee [errors](references/errors.md).\n') })
    expect(checkRepo(root)).toEqual([expect.objectContaining({ rule: 'link-missing', file: 'skills/zaileys/SKILL.md' })])
  })
})
