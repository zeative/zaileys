import { describe, it, expect, vi } from 'vitest'
import { PluginRegistry } from '../../src/plugin/registry.js'
import { definePlugin } from '../../src/plugin/types.js'

const fakeHost = () => {
  const commands = new Set<string>()
  const middleware = new Set<unknown>()
  const listeners = new Map<string, Set<unknown>>()
  return {
    commands, middleware, listeners,
    command: (spec: string) => { commands.add(spec) },
    unregisterCommand: (spec: string) => { commands.delete(spec) },
    use: (mw: unknown) => { middleware.add(mw) },
    unuse: (mw: unknown) => { middleware.delete(mw) },
    on: (event: string, handler: unknown) => {
      const set = listeners.get(event) ?? new Set()
      set.add(handler); listeners.set(event, set)
      return () => set.delete(handler)
    },
    logger: undefined,
  }
}

describe('PluginRegistry', () => {
  it('loads a plugin and registers command/middleware/listener', async () => {
    const host = fakeHost()
    const reg = new PluginRegistry({ client: host })
    await reg.loadPlugin(
      definePlugin({
        name: 'p',
        setup(ctx) {
          ctx.command('hello', async () => {})
          ctx.use(async (_c, n) => n())
          ctx.on('text', () => {})
        },
      }),
      '/plugins/p.ts',
    )
    expect(host.commands.has('hello')).toBe(true)
    expect(host.middleware.size).toBe(1)
    expect(host.listeners.get('text')!.size).toBe(1)
    expect(reg.list()).toEqual(['p'])
  })

  it('unload reverses every registration (LIFO) and calls onUnload', async () => {
    const host = fakeHost()
    const onUnload = vi.fn()
    const reg = new PluginRegistry({ client: host })
    await reg.loadPlugin(
      definePlugin({
        name: 'p',
        setup(ctx) {
          ctx.command('hello', async () => {})
          ctx.use(async (_c, n) => n())
          ctx.on('text', () => {})
        },
        onUnload,
      }),
      '/plugins/p.ts',
    )
    await reg.unload('p')
    expect(host.commands.size).toBe(0)
    expect(host.middleware.size).toBe(0)
    expect(host.listeners.get('text')!.size).toBe(0)
    expect(onUnload).toHaveBeenCalledOnce()
    expect(reg.has('p')).toBe(false)
  })

  it('returned teardown fn from setup runs on unload', async () => {
    const host = fakeHost()
    const teardown = vi.fn()
    const reg = new PluginRegistry({ client: host })
    await reg.loadPlugin(
      definePlugin({ name: 'p', setup: () => teardown }),
      '/plugins/p.ts',
    )
    await reg.unload('p')
    expect(teardown).toHaveBeenCalledOnce()
  })

  it('duplicate name is skipped with warning', async () => {
    const warn = vi.fn()
    const host = { ...fakeHost(), logger: { warn } as never }
    const reg = new PluginRegistry({ client: host })
    const p = definePlugin({ name: 'dup', setup() {} })
    await reg.loadPlugin(p, '/a.ts')
    await reg.loadPlugin(p, '/b.ts')
    expect(reg.list()).toEqual(['dup'])
    expect(warn).toHaveBeenCalled()
  })

  it('setup throwing is isolated (plugin not registered, no throw)', async () => {
    const host = fakeHost()
    const reg = new PluginRegistry({ client: host })
    await expect(
      reg.loadPlugin(definePlugin({ name: 'boom', setup() { throw new Error('x') } }), '/c.ts'),
    ).resolves.toBeUndefined()
    expect(reg.has('boom')).toBe(false)
  })
})
