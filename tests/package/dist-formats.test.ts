import { execFileSync, execSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'

const ROOT = process.cwd()
const dist = (f: string): string => join(ROOT, 'dist', f)
const runNode = (args: string[]): string => execFileSync('node', args, { cwd: ROOT, encoding: 'utf8' }).trim()

describe('package: dual ESM/CJS + types build', () => {
  beforeAll(() => {
    execSync('pnpm build', { cwd: ROOT, stdio: 'ignore' })
  }, 180_000)

  it('PKG1: emits .mjs, .cjs, .d.ts and .d.cts', () => {
    for (const f of ['index.mjs', 'index.cjs', 'index.d.ts', 'index.d.cts']) {
      expect(existsSync(dist(f)), `missing dist/${f}`).toBe(true)
    }
  })

  it('PKG2: package.json exports map resolves to existing per-condition files', () => {
    const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'))
    const dot = pkg.exports['.']
    expect(existsSync(join(ROOT, dot.import))).toBe(true)
    expect(existsSync(join(ROOT, dot.require))).toBe(true)
    expect(existsSync(join(ROOT, dot.types))).toBe(true)
    expect(existsSync(join(ROOT, pkg.main))).toBe(true)
    expect(existsSync(join(ROOT, pkg.module))).toBe(true)
    expect(pkg.type).toBe('module')
  })

  it('PKG3: CJS require() exposes the public surface', () => {
    const out = runNode([
      '-e',
      "const z=require('./dist/index.cjs');process.stdout.write([typeof z.Client,typeof z.Media,typeof z.MessageBuilder,typeof z.ConvexAuthStore].join(','))",
    ])
    expect(out).toBe('function,function,function,function')
  })

  it('PKG4: ESM import exposes the public surface', () => {
    const out = runNode([
      '--input-type=module',
      '-e',
      "import * as z from './dist/index.mjs';process.stdout.write([typeof z.Client,typeof z.Media,typeof z.MessageBuilder,typeof z.ConvexAuthStore].join(','))",
    ])
    expect(out).toBe('function,function,function,function')
  })

  it('PKG5: type declarations declare the Client class for both module systems', () => {
    for (const f of ['index.d.ts', 'index.d.cts']) {
      const dts = readFileSync(dist(f), 'utf8')
      expect(dts).toContain('class Client')
    }
  })

  it('PKG6: node builtins use the node: protocol (Deno/strict-runtime compat)', () => {
    const builtins = ['events', 'stream', 'crypto', 'os', 'path', 'child_process', 'fs', 'fs/promises', 'url', 'module', 'util']
    for (const f of ['index.mjs', 'index.cjs']) {
      const code = readFileSync(dist(f), 'utf8')
      for (const b of builtins) {
        const bare = new RegExp(`(from\\s*|import\\(\\s*|require\\(\\s*|import\\s+)(['"])${b.replace('/', '\\/')}\\2`)
        expect(bare.test(code), `dist/${f} imports bare "${b}" — must be "node:${b}"`).toBe(false)
      }
    }
  })

  it('PKG7: the CJS bundle never top-level-requires the ESM-only file-type (Bun/Deno/Node<22)', () => {
    const cjs = readFileSync(dist('index.cjs'), 'utf8')
    expect(/require\((['"])file-type\1\)/.test(cjs)).toBe(false)
  })
})
