import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { randomBytes } from 'node:crypto'
import { scanPluginFiles, importPlugin, PluginLoader } from '../../src/plugin/loader.js'
import { PluginRegistry } from '../../src/plugin/registry.js'

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

const fakeHost = () => {
  const commands = new Set<unknown>()
  const listeners = new Set<unknown>()
  return {
    commands,
    listeners,
    command: (spec: unknown) => { commands.add(spec) },
    unregisterCommand: (spec: unknown) => { commands.delete(spec) },
    use: () => undefined,
    unuse: () => undefined,
    on: (_event: string, handler: unknown) => {
      listeners.add(handler)
      return () => { listeners.delete(handler) }
    },
    logger: undefined,
  }
}

type Gate = { started?: () => void; release?: () => void }
const gate = globalThis as typeof globalThis & { __zaileysLoaderGate?: Gate }
const watcherOf = (loader: PluginLoader): unknown => (loader as unknown as { watcher?: unknown }).watcher

describe('PluginLoader stop during start', () => {
  let dir: string
  beforeEach(async () => {
    dir = path.join(os.tmpdir(), `zaileys-plug-race-${randomBytes(6).toString('hex')}`)
    await fs.mkdir(dir, { recursive: true })
  })
  afterEach(async () => {
    delete gate.__zaileysLoaderGate
    await fs.rm(dir, { recursive: true, force: true })
  })

  it('loads nothing and opens no watcher when stop() resolves before the scan finishes', async () => {
    await fs.writeFile(path.join(dir, 'early.mjs'), 'export default { name: "early", text() {} }')
    const host = fakeHost()
    const registry = new PluginRegistry({ client: host })
    const loader = new PluginLoader({ registry, options: { dir, watch: true } })
    const starting = loader.start()
    await loader.stop()
    await starting
    expect(registry.list()).toEqual([])
    expect(host.listeners.size).toBe(0)
    expect(watcherOf(loader)).toBeUndefined()
  })

  it('disposes a plugin whose setup was still running when stop() resolved', async () => {
    await fs.writeFile(
      path.join(dir, 'slow.mjs'),
      [
        'export default {',
        '  name: "slow",',
        '  async setup(ctx) {',
        '    ctx.on("text", () => {})',
        '    const g = globalThis.__zaileysLoaderGate',
        '    await new Promise((resolve) => { g.release = resolve; g.started() })',
        '  },',
        '}',
      ].join('\n'),
    )
    const started = new Promise<void>((resolve) => { gate.__zaileysLoaderGate = { started: resolve } })
    const host = fakeHost()
    const registry = new PluginRegistry({ client: host })
    const loader = new PluginLoader({ registry, options: { dir, watch: true } })
    const starting = loader.start()
    await started
    await loader.stop()
    gate.__zaileysLoaderGate?.release?.()
    await starting
    expect(registry.list()).toEqual([])
    expect(host.listeners.size).toBe(0)
    expect(watcherOf(loader)).toBeUndefined()
  })
})
