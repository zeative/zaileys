import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { randomBytes } from 'node:crypto'
import { scanPluginFiles, importPlugin } from '../../src/plugin/loader.js'

const DEFAULT_PATTERN = /\.(ts|js|mjs|cjs)$/
const DEFAULT_IGNORE = /(\.d\.ts$|^_|[/\\]_)/

describe('scanPluginFiles', () => {
  let dir: string
  beforeEach(async () => {
    dir = path.join(os.tmpdir(), `zaileys-plugins-${randomBytes(6).toString('hex')}`)
    await fs.mkdir(path.join(dir, 'nested'), { recursive: true })
    await fs.writeFile(path.join(dir, 'a.js'), 'export default {}')
    await fs.writeFile(path.join(dir, 'nested', 'b.js'), 'export default {}')
    await fs.writeFile(path.join(dir, '_skip.js'), 'export default {}')
    await fs.writeFile(path.join(dir, 'types.d.ts'), '')
  })
  afterEach(async () => { await fs.rm(dir, { recursive: true, force: true }) })

  it('finds nested files, skips _-prefixed and .d.ts', async () => {
    const files = await scanPluginFiles(dir, DEFAULT_PATTERN, DEFAULT_IGNORE)
    const names = files.map((f) => path.basename(f)).sort()
    expect(names).toEqual(['a.js', 'b.js'])
  })

  it('returns [] for a missing dir', async () => {
    expect(await scanPluginFiles(path.join(dir, 'nope'), DEFAULT_PATTERN, DEFAULT_IGNORE)).toEqual([])
  })
})

describe('importPlugin', () => {
  let dir: string
  beforeEach(async () => {
    dir = path.join(os.tmpdir(), `zaileys-plug-imp-${randomBytes(6).toString('hex')}`)
    await fs.mkdir(dir, { recursive: true })
  })
  afterEach(async () => { await fs.rm(dir, { recursive: true, force: true }) })

  it('imports the default export', async () => {
    const f = path.join(dir, 'p.mjs')
    await fs.writeFile(f, 'export default { name: "p", setup() {} }')
    const plugin = await importPlugin(f)
    expect(plugin?.name).toBe('p')
  })

  it('returns undefined on a broken module', async () => {
    const f = path.join(dir, 'bad.mjs')
    await fs.writeFile(f, 'this is not valid js ((((')
    expect(await importPlugin(f)).toBeUndefined()
  })
})
