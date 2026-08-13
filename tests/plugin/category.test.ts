import { describe, expect, it } from 'vitest'
import { PluginRegistry } from '../../src/plugin/registry.js'
import { definePlugin } from '../../src/plugin/types.js'
import type { CommandSpec } from '../../src/command/types.js'

const host = () => {
  const registered: Array<string | CommandSpec> = []
  return {
    registered,
    command: (spec: string | CommandSpec) => {
      registered.push(spec)
    },
    unregisterCommand: () => undefined,
    use: () => undefined,
    unuse: () => undefined,
    on: () => () => undefined,
    logger: undefined,
  }
}

/** Loads a plugin that registers `spec`, and returns what the host actually received. */
const loadWith = async (spec: string | CommandSpec, file: string, root?: string) => {
  const h = host()
  const reg = new PluginRegistry({ client: h as never })
  let seenCategory: string | undefined
  await reg.loadPlugin(
    definePlugin({
      name: 'p',
      setup(ctx) {
        seenCategory = ctx.category
        ctx.command(spec, () => undefined)
      },
    }),
    file,
    root,
  )
  return { spec: h.registered[0], category: seenCategory }
}

describe('plugin category', () => {
  it('takes the category from the plugin subfolder', async () => {
    const out = await loadWith({ name: 'kick' }, '/bot/plugins/group/kick.ts', '/bot/plugins')
    expect(out.category).toBe('group')
    expect(out.spec).toEqual({ name: 'kick', category: 'group' })
  })

  it('uses the top folder for a deeply nested plugin', async () => {
    const out = await loadWith({ name: 'yt' }, '/bot/plugins/tool/media/yt.ts', '/bot/plugins')
    expect(out.category).toBe('tool')
  })

  it('leaves a plugin sitting in the plugins root without a category', async () => {
    const out = await loadWith({ name: 'ping' }, '/bot/plugins/ping.ts', '/bot/plugins')
    expect(out.category).toBeUndefined()
    expect(out.spec).toEqual({ name: 'ping' })
  })

  it('never overrides a category the plugin set itself', async () => {
    const out = await loadWith(
      { name: 'kick', category: 'moderasi' },
      '/bot/plugins/group/kick.ts',
      '/bot/plugins',
    )
    expect(out.spec).toEqual({ name: 'kick', category: 'moderasi' })
  })

  it('passes a string spec straight through', async () => {
    const out = await loadWith('ping|p', '/bot/plugins/info/ping.ts', '/bot/plugins')
    expect(out.spec).toBe('ping|p')
  })

  it('falls back to the containing folder when no root is given', async () => {
    const out = await loadWith({ name: 'kick' }, '/bot/plugins/group/kick.ts')
    expect(out.category).toBe('group')
  })
})
