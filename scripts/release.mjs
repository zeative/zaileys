#!/usr/bin/env node
// Local, GH-Actions-free release: derive the bump + changelog from conventional
// commits since the last `zaileys@*` tag, then version -> build -> publish -> tag -> push.
// Usage: node scripts/release.mjs [--dry-run] [--patch|--minor|--major] [--no-publish] [--no-push]
import { execSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const args = new Set(process.argv.slice(2))
const dryRun = args.has('--dry-run')
const noPublish = args.has('--no-publish')
const noPush = args.has('--no-push')
const forced = args.has('--major') ? 'major' : args.has('--minor') ? 'minor' : args.has('--patch') ? 'patch' : null

const sh = (cmd, opts = {}) => execSync(cmd, { cwd: ROOT, encoding: 'utf8', stdio: opts.capture ? 'pipe' : 'inherit', ...opts })
const out = (cmd) => sh(cmd, { capture: true }).trim()
const die = (msg) => { console.error(`\n✖ ${msg}`); process.exit(1) }

const lastTag = (() => {
  try { return out('git describe --tags --abbrev=0 --match "zaileys@*"') } catch { return null }
})()

const range = lastTag ? `${lastTag}..HEAD` : 'HEAD'
const subjects = out(`git log ${range} --pretty=format:%s%x00%b%x1e`)
  .split('\x1e').map((s) => s.trim()).filter(Boolean)
  .map((block) => { const [subject, body = ''] = block.split('\x00'); return { subject, body } })

if (subjects.length === 0) die(`No commits since ${lastTag ?? 'repo start'} — nothing to release.`)

const RE = /^(\w+)(?:\(([^)]+)\))?(!)?:\s*(.+)$/
const major = [], minor = [], patch = []
for (const { subject, body } of subjects) {
  const m = RE.exec(subject)
  if (!m) continue
  const [, type, , bang, desc] = m
  const breaking = bang === '!' || /BREAKING CHANGE/.test(body)
  const line = desc.trim()
  if (breaking) major.push(line)
  else if (type === 'feat') minor.push(line)
  else if (type === 'fix' || type === 'perf') patch.push(line)
}

const bump = forced ?? (major.length ? 'major' : minor.length ? 'minor' : patch.length ? 'patch' : null)
if (!bump) die('No feat/fix/perf/breaking commits since last release — nothing to publish (chore/docs only).')

const pkgPath = join(ROOT, 'package.json')
const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'))
const [maj, min, pat] = pkg.version.split('.').map(Number)
const next = bump === 'major' ? `${maj + 1}.0.0` : bump === 'minor' ? `${maj}.${min + 1}.0` : `${maj}.${min}.${pat + 1}`

const section = (title, items) => (items.length ? `### ${title}\n\n${items.map((i) => `- ${i}`).join('\n')}\n\n` : '')
const entry = `## ${next}\n\n` +
  section('Major Changes', major) + section('Minor Changes', minor) + section('Patch Changes', patch)

console.log(`\nRelease: ${pkg.version} -> ${next} (${bump}) from ${subjects.length} commits since ${lastTag ?? 'start'}\n`)
console.log(entry)

if (dryRun) { console.log('--dry-run: no changes written.'); process.exit(0) }

pkg.version = next
writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n')

const clog = readFileSync(join(ROOT, 'CHANGELOG.md'), 'utf8')
const header = '# zaileys\n\n'
const rest = clog.startsWith(header) ? clog.slice(header.length) : clog
writeFileSync(join(ROOT, 'CHANGELOG.md'), header + entry + rest)

sh('pnpm build')
if (!noPublish) sh('npm publish')

sh('git add package.json CHANGELOG.md')
sh(`git commit -m "chore: release v${next}" --no-verify`)
sh(`git tag zaileys@${next}`)
if (!noPush) {
  const branch = out('git rev-parse --abbrev-ref HEAD')
  sh(`git push origin ${branch} --follow-tags`)
  sh(`git push origin ${branch}:main`)
}
console.log(`\n✔ Released zaileys@${next}`)
