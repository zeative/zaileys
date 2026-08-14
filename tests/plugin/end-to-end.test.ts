import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { randomBytes } from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Client } from '../../src/client/client.js'
import { MemoryAuthStore } from '../../src/auth/adapters/memory.js'
import { PluginLoader } from '../../src/plugin/loader.js'
import { PluginRegistry } from '../../src/plugin/registry.js'
import type { PluginHost } from '../../src/plugin/registry.js'
import type { MessageContext } from '../../src/events/context.js'

const SENDER = '628111@s.whatsapp.net'

const msg = (text: string): MessageContext =>
  ({
    text,
    senderId: SENDER,
    roomId: SENDER,
    isGroup: false,
    message: () => ({ key: { remoteJid: SENDER, id: 'M1', fromMe: false } }),
  }) as unknown as MessageContext

/** Drives the real loader over real files against a real Client — the exact path a bot takes. */
describe('plugin file to dispatched command', () => {
  let dir: string
  let client: Client

  beforeEach(async () => {
    dir = path.join(os.tmpdir(), `zaileys-e2e-${randomBytes(6).toString('hex')}`)
    await fs.mkdir(path.join(dir, 'info'), { recursive: true })
    client = new Client({
      auth: new MemoryAuthStore(),
      qrTerminal: false,
      autoConnect: false,
      commandPrefix: '!',
    })
    ;(client as unknown as { _socket: unknown })._socket = { user: { id: 'me@s.whatsapp.net' } }
  })
  afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true })
  })

  const boot = async (): Promise<void> => {
    const registry = new PluginRegistry({ client: client as unknown as PluginHost })
    const loader = new PluginLoader({ registry, options: { dir, watch: false } })
    await loader.start()
  }

  it('registers a declarative command and dispatches it', async () => {
    await fs.writeFile(
      path.join(dir, 'info', 'ping.js'),
      `export default {
         name: 'ping',
         description: 'Cek bot',
         command: async (ctx) => { globalThis.__hit = ctx.command },
       }`,
    )
    await boot()

    expect(client.commands()).toEqual([
      { name: 'ping', aliases: [], description: 'Cek bot', category: 'info' },
    ])

    client.emit('text', msg('!ping'))
    await new Promise((r) => setTimeout(r, 20))
    expect((globalThis as Record<string, unknown>)['__hit']).toBe('ping')
  })

  it('wires a declarative event method', async () => {
    await fs.writeFile(
      path.join(dir, 'info', 'watch.js'),
      `export default { name: 'watch', message: (m) => { globalThis.__seen = m.text } }`,
    )
    await boot()

    client.emit('message', msg('halo'))
    expect((globalThis as Record<string, unknown>)['__seen']).toBe('halo')
  })

  it('still supports a setup-based plugin', async () => {
    await fs.writeFile(
      path.join(dir, 'info', 'old.js'),
      `export default {
         name: 'old',
         setup(ctx) { ctx.command('legacy', () => { globalThis.__legacy = true }) },
       }`,
    )
    await boot()

    client.emit('text', msg('!legacy'))
    await new Promise((r) => setTimeout(r, 20))
    expect((globalThis as Record<string, unknown>)['__legacy']).toBe(true)
  })

  it('reports a plugin that fails to import instead of dying', async () => {
    const onError = vi.fn()
    await fs.writeFile(path.join(dir, 'info', 'broken.js'), 'this is not valid js {{{')
    const registry = new PluginRegistry({ client: client as unknown as PluginHost })
    await new PluginLoader({ registry, options: { dir, watch: false, onError } }).start()
    expect(onError).toHaveBeenCalled()
  })
})
