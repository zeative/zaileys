import { createRequire } from 'node:module'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = resolve(__dirname, '..', '..')
const read = (rel: string) => readFileSync(resolve(root, rel), 'utf8')
const has = (rel: string) => existsSync(resolve(root, rel))

describe('Phase 8 SC#1 — test gate (≥1000 cases) + coverage thresholds + TEST-03', () => {
  it('vitest config enforces ≥80% lines and branches thresholds', () => {
    const cfg = read('vitest.config.ts')
    expect(cfg).toMatch(/thresholds\s*:/)
    expect(cfg).toMatch(/lines\s*:\s*80/)
    expect(cfg).toMatch(/branches\s*:\s*80/)
  })

  it('TEST-03: command parser unit test file exists with ≥30 it() cases', () => {
    expect(has('tests/command/parser.test.ts')).toBe(true)
    const src = read('tests/command/parser.test.ts')
    const count = (src.match(/\bit\(/g) ?? []).length
    expect(count).toBeGreaterThanOrEqual(30)
  })

  it('aggregate suite spans unit + integration + e2e include globs', () => {
    const cfg = read('vitest.config.ts')
    expect(cfg).toMatch(/tests\/\*\*\/\*\.test\.ts/)
    expect(cfg).toMatch(/src\/\*\*\/\*\.test\.ts/)
    expect(cfg).toMatch(/e2e\.test\.ts/)
  })
})

describe('Phase 8 SC#2 — CI + release workflows (GitHub-only, no npm publish)', () => {
  it('ci.yml exists with lint/typecheck/test/build/coverage/audit steps', () => {
    expect(has('.github/workflows/ci.yml')).toBe(true)
    const ci = read('.github/workflows/ci.yml')
    expect(ci).toMatch(/audit:comments/)
    expect(ci).toMatch(/audit:any/)
    expect(ci).toMatch(/pnpm typecheck/)
    expect(ci).toMatch(/pnpm build/)
    expect(ci).toMatch(/--coverage/)
    expect(ci).toMatch(/pnpm size/)
  })

  it('release.yml triggers on tag push and creates a GitHub Release', () => {
    expect(has('.github/workflows/release.yml')).toBe(true)
    const rel = read('.github/workflows/release.yml')
    expect(rel).toMatch(/tags\s*:/)
    expect(rel).toMatch(/v\*/)
    expect(rel).toMatch(/action-gh-release/)
  })

  it('release.yml contains NO npm publish, changeset publish, or NPM_TOKEN', () => {
    const rel = read('.github/workflows/release.yml')
    expect(rel).not.toMatch(/npm publish/)
    expect(rel).not.toMatch(/changeset publish/)
    expect(rel).not.toMatch(/NPM_TOKEN/)
  })
})

describe('Phase 8 SC#3 — husky hooks + commitlint + changeset checks', () => {
  it('husky pre-commit and commit-msg hooks exist', () => {
    expect(has('.husky/pre-commit')).toBe(true)
    expect(has('.husky/commit-msg')).toBe(true)
  })

  it('changeset config exists and targets baseBranch v4', () => {
    expect(has('.changeset/config.json')).toBe(true)
    const cs = JSON.parse(read('.changeset/config.json'))
    expect(cs.baseBranch).toBe('v4')
  })

  it('changeset-check workflow exists', () => {
    expect(has('.github/workflows/changeset-check.yml')).toBe(true)
  })
})

describe('Phase 8 SC#4 — README + examples + MIGRATION', () => {
  it('README.md exists (lowercase, case-sensitive FS safe) with quickstart', () => {
    expect(has('README.md')).toBe(true)
    const readme = read('README.md')
    expect(readme.toLowerCase()).toMatch(/quick start/)
  })

  it('all five canonical examples exist', () => {
    for (const name of ['simple-bot', 'command-bot', 'broadcast', 'express-integration', 'multi-account']) {
      expect(has(`examples/${name}.ts`)).toBe(true)
    }
  })

  it('MIGRATION.md exists with v3→v4 content', () => {
    expect(has('MIGRATION.md')).toBe(true)
    const mig = read('MIGRATION.md')
    expect(mig).toMatch(/v3/)
    expect(mig).toMatch(/v4/)
  })
})

describe('Phase 8 SC#5 — typedoc + governance docs + version 4.0.0', () => {
  it('typedoc config and docs script exist', () => {
    expect(has('typedoc.json')).toBe(true)
    const pkg = JSON.parse(read('package.json'))
    expect(pkg.scripts.docs).toMatch(/typedoc/)
  })

  it('CONTRIBUTING, SECURITY, and CHANGELOG ship', () => {
    expect(has('CONTRIBUTING.md')).toBe(true)
    expect(has('SECURITY.md')).toBe(true)
    expect(has('CHANGELOG.md')).toBe(true)
    expect(read('CHANGELOG.md')).toMatch(/4\.0\.0/)
  })

  it('package.json declares version 4.0.0', () => {
    const pkg = JSON.parse(read('package.json'))
    expect(pkg.version).toBe('4.0.0')
  })
})

describe('Phase 8 D1 — dual ESM/CJS consumption from build artifacts', () => {
  it('build emits dist/index.mjs and dist/index.cjs and d.ts', () => {
    expect(has('dist/index.mjs')).toBe(true)
    expect(has('dist/index.cjs')).toBe(true)
    expect(has('dist/index.d.ts')).toBe(true)
  })

  it('ESM import of dist/index.mjs exposes Client', async () => {
    const mod = await import(resolve(root, 'dist/index.mjs'))
    expect(mod.Client).toBeDefined()
    expect(typeof mod.Client).toBe('function')
  })

  it('CJS require of dist/index.cjs exposes Client', () => {
    const require = createRequire(import.meta.url)
    const mod = require(resolve(root, 'dist/index.cjs'))
    expect(mod.Client).toBeDefined()
    expect(typeof mod.Client).toBe('function')
  })

  it('package.json exports map wires import→.mjs and require→.cjs', () => {
    const pkg = JSON.parse(read('package.json'))
    expect(pkg.exports['.'].import).toBe('./dist/index.mjs')
    expect(pkg.exports['.'].require).toBe('./dist/index.cjs')
    expect(pkg.exports['.'].types).toBe('./dist/index.d.ts')
  })
})
