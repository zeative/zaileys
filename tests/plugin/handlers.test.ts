import { describe, expect, it, vi } from 'vitest'
import { PluginRegistry } from '../../src/plugin/registry.js'
import { definePlugin } from '../../src/plugin/types.js'
import type { CommandSpec } from '../../src/command/types.js'

const host = () => {
  const commands: Array<{ spec: string | CommandSpec; handler: unknown }> = []
  const listeners: Array<{ event: string; handler: (p: unknown) => void }> = []
  return {
    commands,
    listeners,
    command: (spec: string | CommandSpec, handler: unknown) => commands.push({ spec, handler }),
    unregisterCommand: () => undefined,
    use: () => undefined,
    unuse: () => undefined,
    on: (event: string, handler: (p: unknown) => void) => {
      listeners.push({ event, handler })
      return () => undefined
    },
    logger: undefined,
  }
}

const load = async (plugin: ReturnType<typeof definePlugin>, file = '/bot/plugins/tool/x.ts') => {
  const h = host()
  const reg = new PluginRegistry({ client: h as never })
  await reg.loadPlugin(plugin, file, '/bot/plugins')
  return { host: h, reg }
}

describe('plugin metadata becomes the command spec', () => {
  it('registers command() using the plugin name and metadata, with no repetition', async () => {
    const run = vi.fn()
    const { host: h } = await load(
      definePlugin({
        name: 'kick',
        aliases: ['tendang'],
        description: 'Keluarkan anggota',
        usage: '@user',
        group: true,
        admin: true,
        cooldown: 3,
        command: run,
      }),
      '/bot/plugins/group/kick.ts',
    )
    expect(h.commands).toHaveLength(1)
    expect(h.commands[0]!.spec).toEqual({
      name: 'kick',
      aliases: ['tendang'],
      description: 'Keluarkan anggota',
      usage: '@user',
      group: true,
      admin: true,
      cooldown: 3,
      category: 'group',
    })
  })

  it('hands the plugin context to command() as a second argument', async () => {
    const run = vi.fn()
    const { host: h } = await load(definePlugin({ name: 'x', command: run }))
    ;(h.commands[0]!.handler as (c: unknown) => void)({ command: 'x' })
    expect(run).toHaveBeenCalledTimes(1)
    const [commandCtx, pluginCtx] = run.mock.calls[0] as [unknown, { category?: string }]
    expect(commandCtx).toEqual({ command: 'x' })
    expect(pluginCtx.category).toBe('tool')
  })

  it('registers nothing when the plugin has no command handler', async () => {
    const { host: h } = await load(definePlugin({ name: 'quiet', description: 'no command' }))
    expect(h.commands).toHaveLength(0)
  })
})

describe('event methods', () => {
  it('subscribes each method to its event', async () => {
    const { host: h } = await load(
      definePlugin({
        name: 'watcher',
        message: vi.fn(),
        image: vi.fn(),
        pollVote: vi.fn(),
        callIncoming: vi.fn(),
      }),
    )
    expect(h.listeners.map((l) => l.event).sort()).toEqual([
      'call-incoming',
      'image',
      'message',
      'poll-vote',
    ])
  })

  it('passes the payload and the plugin context to the method', async () => {
    const message = vi.fn()
    const { host: h } = await load(definePlugin({ name: 'watcher', message }))
    h.listeners[0]!.handler({ text: 'halo' })
    const [payload, pluginCtx] = message.mock.calls[0] as [unknown, { category?: string }]
    expect(payload).toEqual({ text: 'halo' })
    expect(pluginCtx.category).toBe('tool')
  })

  it('subscribes to nothing when no event method is present', async () => {
    const { host: h } = await load(definePlugin({ name: 'bare', command: vi.fn() }))
    expect(h.listeners).toHaveLength(0)
  })

  it('does not mistake plain metadata for a handler', async () => {
    const { host: h } = await load(
      definePlugin({ name: 'sticker', description: 'x', metadata: { text: 'not a handler' } }),
    )
    expect(h.listeners).toHaveLength(0)
  })

  it('combines a command with event methods in one plugin', async () => {
    const { host: h } = await load(
      definePlugin({ name: 'both', command: vi.fn(), message: vi.fn() }),
    )
    expect(h.commands).toHaveLength(1)
    expect(h.listeners).toHaveLength(1)
  })
})

describe('setup stays available', () => {
  it('is optional now', async () => {
    const { reg } = await load(definePlugin({ name: 'nosetup', command: vi.fn() }))
    expect(reg.list()).toEqual(['nosetup'])
  })

  it('still runs, alongside the declarative handlers', async () => {
    const setup = vi.fn()
    const { host: h } = await load(definePlugin({ name: 'mixed', command: vi.fn(), setup }))
    expect(setup).toHaveBeenCalledTimes(1)
    expect(h.commands).toHaveLength(1)
  })

  it('skips a plugin with no name at all', async () => {
    const { reg } = await load({ description: 'nameless' } as never)
    expect(reg.list()).toEqual([])
  })
})
