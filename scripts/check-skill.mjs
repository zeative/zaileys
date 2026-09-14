// Guards the zaileys Agent Skill: spec-only frontmatter, context budgets, one-level links, portable wording, and
// a repo root that is the plugin. Runs in CI via `pnpm skill:check`; exits 1 with one line per problem.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const SPEC_KEYS = new Set(['name', 'description', 'license', 'compatibility', 'metadata', 'allowed-tools'])
const NAME_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/
const MAX_DESCRIPTION = 1024
const MAX_BODY_LINES = 500
const TOC_AFTER_LINES = 100
const TOC_HEADING = /^#{2,3}\s+(contents|table of contents)\s*$/i
// Version history lives only here, so it may mention old APIs and exact versions.
const HISTORY_FILE = 'references/migration.md'
const FIRST_OR_SECOND_PERSON = /^(i|you|we)\b|\b(i|me|my|we|our|us)\b/i
const V3_NAME = /\bwa\.(on|send|button|reaction|edit|delete|forward|presence|inject)\b/
const PINNED_INSTALL = /\bzaileys@\d+\.\d+\.\d+/
const PINNED_DEPENDENCY = /"zaileys"\s*:\s*"[~^]?\d+\.\d+\.\d+"/
const ROOT_COMPONENTS = ['.mcp.json', 'agents', 'commands', 'hooks']
const TEXT_FILE = /\.(md|mdx|json|ts|mts|js|mjs|cjs|txt|ya?ml|sh)$|(^|\/)(Dockerfile|\.env\.example)$/

const walk = (dir, base = dir) =>
  readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) return name === 'node_modules' ? [] : walk(path, base)
    return [relative(base, path).split(sep).join('/')]
  })

const issue = (rule, file, message, line) => (line === undefined ? { rule, file, message } : { rule, file, line, message })

// Just enough YAML for skill frontmatter: top-level scalars, quoted strings, block scalars, and one nested map.
const parseFrontmatter = (text) => {
  const match = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/)
  if (!match) return null
  const lines = match[1].split(/\r?\n/)
  const data = {}
  for (let i = 0; i < lines.length; i++) {
    const top = lines[i].match(/^([A-Za-z][\w-]*):\s*(.*)$/)
    if (!top) continue
    const [, key, raw] = top
    const nested = []
    while (i + 1 < lines.length && (/^\s+\S/.test(lines[i + 1]) || lines[i + 1].trim() === '')) nested.push(lines[++i])
    if (/^[>|][+-]?$/.test(raw)) {
      const parts = nested.map((l) => l.trim())
      data[key] = raw.startsWith('>') ? parts.filter(Boolean).join(' ') : parts.join('\n').trim()
    } else if (raw === '' && nested.length) {
      data[key] = Object.fromEntries(nested.filter((l) => l.trim()).map((l) => l.trim().split(/:\s*/, 2)))
    } else {
      data[key] = [raw, ...nested.map((l) => l.trim())].join(' ').trim().replace(/^(['"])([\s\S]*)\1$/, '$2')
    }
  }
  return { data, bodyStart: match[0].split('\n').length - 1 }
}

// Markdown links outside fenced code blocks, with 1-based line numbers.
const markdownLinks = (text) => {
  const links = []
  let fenced = false
  text.split('\n').forEach((line, index) => {
    if (/^\s*(```|~~~)/.test(line)) fenced = !fenced
    if (fenced) return
    for (const m of line.replace(/`[^`]*`/g, '').matchAll(/\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g)) {
      links.push({ target: m[1], line: index + 1 })
    }
  })
  return links
}

const isExternal = (target) => /^[a-z][a-z0-9+.-]*:/i.test(target) || target.startsWith('#')

export function checkSkill(skillDir) {
  const issues = []
  const skillFile = join(skillDir, 'SKILL.md')
  if (!existsSync(skillFile)) return [issue('skill-md', 'SKILL.md', 'SKILL.md is missing')]

  const skillText = readFileSync(skillFile, 'utf8')
  const front = parseFrontmatter(skillText)
  if (!front) {
    issues.push(issue('frontmatter', 'SKILL.md', 'SKILL.md must start with --- frontmatter ---'))
  } else {
    const { data, bodyStart } = front
    for (const key of Object.keys(data).filter((k) => !SPEC_KEYS.has(k))) {
      issues.push(issue('frontmatter-key', 'SKILL.md', `frontmatter key "${key}" is not in the Agent Skills spec`))
    }
    const name = data.name ?? ''
    if (!NAME_PATTERN.test(name) || name.length > 64) {
      issues.push(issue('name-format', 'SKILL.md', `name "${name}" must be 1-64 lowercase letters, digits, and single hyphens`))
    }
    const folder = skillDir.split(sep).filter(Boolean).pop()
    if (name !== folder) issues.push(issue('name-folder', 'SKILL.md', `name "${name}" must match the folder "${folder}"`))

    const description = typeof data.description === 'string' ? data.description : ''
    if (!description) issues.push(issue('description', 'SKILL.md', 'description is required'))
    if (description.length > MAX_DESCRIPTION) {
      issues.push(issue('description-length', 'SKILL.md', `description is ${description.length} characters; the limit is ${MAX_DESCRIPTION}`))
    }
    // The description is injected into the system prompt, where first or second person reads as a conflicting voice.
    if (FIRST_OR_SECOND_PERSON.test(description)) {
      issues.push(issue('description-person', 'SKILL.md', 'description must be written in the third person ("Builds…", "Use when…")'))
    }

    const bodyLines = skillText.split('\n').length - bodyStart
    if (bodyLines >= MAX_BODY_LINES) {
      issues.push(issue('body-length', 'SKILL.md', `SKILL.md body is ${bodyLines} lines; keep it under ${MAX_BODY_LINES} and move detail to references`))
    }
  }

  const files = walk(skillDir)
  for (const file of files) {
    if (!TEXT_FILE.test(file)) continue
    const text = readFileSync(join(skillDir, file), 'utf8')
    const lines = text.split('\n')
    const isMarkdown = file.endsWith('.md')

    if (isMarkdown && file !== 'SKILL.md' && lines.length > TOC_AFTER_LINES && !lines.slice(0, 40).some((l) => TOC_HEADING.test(l))) {
      issues.push(issue('toc', file, `${lines.length} lines without a "## Contents" section near the top`))
    }

    if (isMarkdown) {
      for (const { target, line } of markdownLinks(text)) {
        if (isExternal(target)) continue
        const path = target.split('#')[0]
        const absolute = resolve(skillDir, dirname(file), path)
        if (path.split('/').includes('..') || !absolute.startsWith(resolve(skillDir) + sep)) {
          issues.push(issue('link-escape', file, `link "${target}" leaves the skill folder`, line))
        } else if (file !== 'SKILL.md') {
          // Nested references get partially read (head -100), so every file must be reachable from SKILL.md directly.
          issues.push(issue('link-depth', file, `link "${target}": only SKILL.md may link to other skill files`, line))
        } else if (!existsSync(absolute)) {
          issues.push(issue('link-missing', file, `link "${target}" points to a file that does not exist`, line))
        }
      }
    }

    if (file === HISTORY_FILE) continue
    lines.forEach((text, index) => {
      if (V3_NAME.test(text)) {
        issues.push(issue('terminology', file, 'use `client` (v4) instead of the v3 `wa` instance', index + 1))
      }
      if (PINNED_INSTALL.test(text) || PINNED_DEPENDENCY.test(text)) {
        issues.push(issue('pinned-version', file, 'pinned zaileys version; use a major range (^4) or no version', index + 1))
      }
    })
  }
  return issues
}

const readJson = (path) => {
  try {
    return JSON.parse(readFileSync(path, 'utf8'))
  } catch {
    return undefined
  }
}

export function checkRepo(root) {
  const issues = []
  const skillsDir = join(root, 'skills')
  const skills = existsSync(skillsDir) ? readdirSync(skillsDir).filter((n) => statSync(join(skillsDir, n)).isDirectory()) : []
  if (skills.length !== 1) {
    issues.push(issue('one-skill', 'skills', `expected exactly one skill, found ${skills.length}: ${skills.join(', ') || 'none'}`))
  }
  for (const name of skills) {
    for (const found of checkSkill(join(skillsDir, name))) {
      issues.push({ ...found, file: `skills/${name}/${found.file}` })
    }
  }

  const pluginPath = '.claude-plugin/plugin.json'
  const marketPath = '.claude-plugin/marketplace.json'
  const plugin = readJson(join(root, pluginPath))
  const market = readJson(join(root, marketPath))
  if (!plugin) issues.push(issue('manifest', pluginPath, 'missing or invalid JSON'))
  if (!market) issues.push(issue('manifest', marketPath, 'missing or invalid JSON'))
  // A pinned version freezes installed copies: Claude Code only updates a plugin when its version string changes.
  if (plugin && 'version' in plugin) issues.push(issue('manifest-version', pluginPath, 'remove "version" so updates follow the git commit'))
  for (const entry of market?.plugins ?? []) {
    if ('version' in entry) issues.push(issue('manifest-version', marketPath, `remove "version" from "${entry.name}"`))
    if (entry.name === plugin?.name && entry.source !== './') {
      issues.push(issue('manifest-source', marketPath, `"${entry.name}" must use "source": "./" so the repo root is the plugin`))
    }
  }

  for (const component of ROOT_COMPONENTS) {
    if (existsSync(join(root, component))) {
      issues.push(issue('root-components', component, 'the repo root is the plugin, so this would ship to every user'))
    }
  }
  return issues
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = resolve(process.argv[2] ?? join(dirname(fileURLToPath(import.meta.url)), '..'))
  const issues = checkRepo(root)
  for (const i of issues) console.log(`${i.file}${i.line ? `:${i.line}` : ''}  [${i.rule}] ${i.message}`)
  console.log(issues.length ? `\n✗ ${issues.length} skill problem(s)` : '✓ skill checks passed')
  process.exit(issues.length ? 1 : 0)
}
