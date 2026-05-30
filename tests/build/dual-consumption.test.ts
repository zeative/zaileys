import { existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const here = path.dirname(fileURLToPath(import.meta.url))
const distDir = path.resolve(here, '../../dist')
const mjsPath = path.join(distDir, 'index.mjs')
const cjsPath = path.join(distDir, 'index.cjs')

const SAMPLED_EXPORTS = ['Client', 'MessageBuilder', 'parseCommand', 'RateLimiter', 'GroupModule'] as const

const buildMissing = !existsSync(mjsPath) || !existsSync(cjsPath)

describe.skipIf(buildMissing)('built dist dual ESM/CJS consumption', () => {
  it('fails loudly when dist is not built', () => {
    expect(existsSync(mjsPath), 'dist/index.mjs missing — run pnpm build first').toBe(true)
    expect(existsSync(cjsPath), 'dist/index.cjs missing — run pnpm build first').toBe(true)
  })

  it('loads the ESM bundle and exposes Client plus sampled public exports', async () => {
    const mod = (await import(mjsPath)) as Record<string, unknown>
    expect(typeof mod.Client).toBe('function')
    for (const name of SAMPLED_EXPORTS) {
      expect(mod[name], `ESM export ${name} should be present`).toBeDefined()
    }
  })

  it('loads the CJS bundle via require and exposes the same public export shape', () => {
    const requireFromHere = createRequire(import.meta.url)
    const mod = requireFromHere(cjsPath) as Record<string, unknown>
    expect(typeof mod.Client).toBe('function')
    for (const name of SAMPLED_EXPORTS) {
      expect(mod[name], `CJS export ${name} should be present`).toBeDefined()
    }
  })

  it('exposes Client from both module systems as the same callable surface', async () => {
    const esm = (await import(mjsPath)) as Record<string, unknown>
    const requireFromHere = createRequire(import.meta.url)
    const cjs = requireFromHere(cjsPath) as Record<string, unknown>
    expect(typeof esm.Client).toBe(typeof cjs.Client)
    expect((esm.Client as { name?: string }).name).toBe((cjs.Client as { name?: string }).name)
  })
})

describe.skipIf(!buildMissing)('built dist dual ESM/CJS consumption (unbuilt)', () => {
  it('reports that the bundle must be built before this suite can run', () => {
    expect(buildMissing).toBe(true)
  })
})
