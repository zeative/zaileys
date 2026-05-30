import { EventEmitter } from 'node:events'
import { describe, expect, it, vi } from 'vitest'
import { attachCommandDispatcher, type DispatcherDeps } from '../../src/command/dispatcher.js'
import { CommandRegistry } from '../../src/command/registry.js'
import type { CommandContext, Middleware } from '../../src/command/types.js'
import type { MessagePayload } from '../../src/events/types.js'

const SENDER = { jid: '628111@s.whatsapp.net' }

const msg = (content: string): MessagePayload => ({
  jid: '628111@s.whatsapp.net',
  content,
  fromMe: false,
  isGroup: false,
  sender: SENDER,
  timestamp: 0,
  key: { remoteJid: '628111@s.whatsapp.net', id: 'M1', fromMe: false },
})

const silentLogger = () => ({
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  fatal: vi.fn(),
})

interface Harness {
  emitter: EventEmitter
  registry: CommandRegistry
  middleware: Middleware[]
  logger: ReturnType<typeof silentLogger>
  contexts: CommandContext[]
  deps: DispatcherDeps
}

const makeHarness = (over?: { prefixes?: string[]; middleware?: Middleware[] }): Harness => {
  const emitter = new EventEmitter()
  const registry = new CommandRegistry()
  const middleware = over?.middleware ?? []
  const logger = silentLogger()
  const contexts: CommandContext[] = []
  const deps: DispatcherDeps = {
    registry,
    middleware,
    prefixes: over?.prefixes ?? ['/'],
    logger,
    onText: (handler) => {
      const wrapped = (m: MessagePayload): void => handler(m)
      emitter.on('text', wrapped)
      return () => emitter.off('text', wrapped)
    },
    buildContext: (parsed, message) => {
      const ctx: CommandContext = {
        jid: message.jid,
        sender: message.sender,
        raw: parsed.raw,
        command: parsed.command,
        args: parsed.args,
        flags: parsed.flags,
        json: parsed.json,
        message,
        reply: vi.fn(async () => message.key),
        react: vi.fn(async () => message.key),
        edit: vi.fn(async () => undefined),
      }
      contexts.push(ctx)
      return ctx
    },
  }
  return { emitter, registry, middleware, logger, contexts, deps }
}

const emitText = (h: Harness, content: string): Promise<void> => {
  h.emitter.emit('text', msg(content))
  return new Promise((r) => setTimeout(r, 0))
}

describe('attachCommandDispatcher — basic dispatch', () => {
  it('returns a detach handle', () => {
    const h = makeHarness()
    const handle = attachCommandDispatcher(h.deps)
    expect(typeof handle.detach).toBe('function')
    handle.detach()
  })

  it('dispatches a matching command with parsed args', async () => {
    const h = makeHarness()
    const handler = vi.fn()
    h.registry.register('weather', handler)
    attachCommandDispatcher(h.deps)
    await emitText(h, '/weather Jakarta')
    expect(handler).toHaveBeenCalledTimes(1)
    const ctx = handler.mock.calls[0]?.[0] as CommandContext
    expect(ctx.command).toBe('weather')
    expect(ctx.args).toEqual(['Jakarta'])
  })

  it('resolves command name lowercased', async () => {
    const h = makeHarness()
    const handler = vi.fn()
    h.registry.register('ping', handler)
    attachCommandDispatcher(h.deps)
    await emitText(h, '/PING')
    expect(handler).toHaveBeenCalledTimes(1)
  })

  it('passes flags through context', async () => {
    const h = makeHarness()
    const handler = vi.fn()
    h.registry.register('deploy', handler)
    attachCommandDispatcher(h.deps)
    await emitText(h, '/deploy --env prod')
    const ctx = handler.mock.calls[0]?.[0] as CommandContext
    expect(ctx.flags).toEqual({ env: 'prod' })
  })

  it('passes the original message payload through context', async () => {
    const h = makeHarness()
    const handler = vi.fn()
    h.registry.register('ping', handler)
    attachCommandDispatcher(h.deps)
    await emitText(h, '/ping')
    const ctx = handler.mock.calls[0]?.[0] as CommandContext
    expect(ctx.message.key.id).toBe('M1')
  })

  it('dispatches with a custom prefix', async () => {
    const h = makeHarness({ prefixes: ['!'] })
    const handler = vi.fn()
    h.registry.register('hi', handler)
    attachCommandDispatcher(h.deps)
    await emitText(h, '!hi')
    expect(handler).toHaveBeenCalledTimes(1)
  })

  it('supports multiple prefixes', async () => {
    const h = makeHarness({ prefixes: ['/', '!'] })
    const handler = vi.fn()
    h.registry.register('hi', handler)
    attachCommandDispatcher(h.deps)
    await emitText(h, '!hi')
    await emitText(h, '/hi')
    expect(handler).toHaveBeenCalledTimes(2)
  })

  it('dispatches a sub-command', async () => {
    const h = makeHarness()
    const handler = vi.fn()
    h.registry.register('group create', handler)
    attachCommandDispatcher(h.deps)
    await emitText(h, '/group create MyGroup')
    expect(handler).toHaveBeenCalledTimes(1)
    const ctx = handler.mock.calls[0]?.[0] as CommandContext
    expect(ctx.command).toBe('group create')
    expect(ctx.args).toEqual(['MyGroup'])
  })

  it('dispatches via an alias', async () => {
    const h = makeHarness()
    const handler = vi.fn()
    h.registry.register('help|h', handler)
    attachCommandDispatcher(h.deps)
    await emitText(h, '/h')
    expect(handler).toHaveBeenCalledTimes(1)
  })
})

describe('attachCommandDispatcher — additive non-consuming', () => {
  it('does not dispatch on non-command text', async () => {
    const h = makeHarness()
    const handler = vi.fn()
    h.registry.register('ping', handler)
    attachCommandDispatcher(h.deps)
    await emitText(h, 'just a normal message')
    expect(handler).not.toHaveBeenCalled()
  })

  it('does not build a context for non-command text', async () => {
    const h = makeHarness()
    h.registry.register('ping', vi.fn())
    attachCommandDispatcher(h.deps)
    await emitText(h, 'hello world')
    expect(h.contexts).toHaveLength(0)
  })

  it('leaves co-registered on(text) listeners free to fire', async () => {
    const h = makeHarness()
    const userListener = vi.fn()
    h.emitter.on('text', userListener)
    h.registry.register('ping', vi.fn())
    attachCommandDispatcher(h.deps)
    await emitText(h, '/ping')
    await emitText(h, 'plain text')
    expect(userListener).toHaveBeenCalledTimes(2)
  })

  it('does not dispatch when prefix matches but command is unregistered', async () => {
    const h = makeHarness()
    const handler = vi.fn()
    h.registry.register('ping', handler)
    attachCommandDispatcher(h.deps)
    await emitText(h, '/unknown')
    expect(handler).not.toHaveBeenCalled()
  })

  it('does not throw on a prefix match to an unregistered command', async () => {
    const h = makeHarness()
    attachCommandDispatcher(h.deps)
    await expect(emitText(h, '/nope')).resolves.toBeUndefined()
    expect(h.logger.error).not.toHaveBeenCalled()
  })
})

describe('attachCommandDispatcher — empty prefixes', () => {
  it('is a no-op: never dispatches', async () => {
    const h = makeHarness({ prefixes: [] })
    const handler = vi.fn()
    h.registry.register('ping', handler)
    attachCommandDispatcher(h.deps)
    await emitText(h, '/ping')
    expect(handler).not.toHaveBeenCalled()
  })

  it('does not subscribe to onText when prefixes empty', () => {
    const h = makeHarness({ prefixes: [] })
    attachCommandDispatcher(h.deps)
    expect(h.emitter.listenerCount('text')).toBe(0)
  })

  it('detach is a safe no-op with empty prefixes', () => {
    const h = makeHarness({ prefixes: [] })
    const handle = attachCommandDispatcher(h.deps)
    expect(() => handle.detach()).not.toThrow()
  })
})

describe('attachCommandDispatcher — middleware', () => {
  it('runs middleware before the handler', async () => {
    const order: string[] = []
    const mw: Middleware = async (_ctx, next) => {
      order.push('mw')
      await next()
    }
    const h = makeHarness({ middleware: [mw] })
    h.registry.register('ping', () => {
      order.push('handler')
    })
    attachCommandDispatcher(h.deps)
    await emitText(h, '/ping')
    expect(order).toEqual(['mw', 'handler'])
  })

  it('runs middleware in registration order', async () => {
    const order: string[] = []
    const a: Middleware = async (_c, n) => {
      order.push('a')
      await n()
    }
    const b: Middleware = async (_c, n) => {
      order.push('b')
      await n()
    }
    const h = makeHarness({ middleware: [a, b] })
    h.registry.register('ping', () => order.push('handler'))
    attachCommandDispatcher(h.deps)
    await emitText(h, '/ping')
    expect(order).toEqual(['a', 'b', 'handler'])
  })

  it('short-circuits the handler when middleware does not call next()', async () => {
    const handler = vi.fn()
    const mw: Middleware = () => {
      /* never calls next */
    }
    const h = makeHarness({ middleware: [mw] })
    h.registry.register('ping', handler)
    attachCommandDispatcher(h.deps)
    await emitText(h, '/ping')
    expect(handler).not.toHaveBeenCalled()
  })

  it('does not crash when a middleware throws', async () => {
    const mw: Middleware = () => {
      throw new Error('mw boom')
    }
    const h = makeHarness({ middleware: [mw] })
    h.registry.register('ping', vi.fn())
    attachCommandDispatcher(h.deps)
    await expect(emitText(h, '/ping')).resolves.toBeUndefined()
    expect(h.logger.error).toHaveBeenCalled()
  })
})

describe('attachCommandDispatcher — handler errors', () => {
  it('does not propagate a throwing handler', async () => {
    const h = makeHarness()
    h.registry.register('boom', () => {
      throw new Error('handler boom')
    })
    attachCommandDispatcher(h.deps)
    await expect(emitText(h, '/boom')).resolves.toBeUndefined()
  })

  it('logs handler errors via logger.error', async () => {
    const h = makeHarness()
    h.registry.register('boom', () => {
      throw new Error('handler boom')
    })
    attachCommandDispatcher(h.deps)
    await emitText(h, '/boom')
    expect(h.logger.error).toHaveBeenCalled()
  })

  it('handles a rejected async handler without crashing', async () => {
    const h = makeHarness()
    h.registry.register('boom', async () => {
      throw new Error('async boom')
    })
    attachCommandDispatcher(h.deps)
    await expect(emitText(h, '/boom')).resolves.toBeUndefined()
    expect(h.logger.error).toHaveBeenCalled()
  })
})

describe('attachCommandDispatcher — detach', () => {
  it('stops dispatching after detach', async () => {
    const h = makeHarness()
    const handler = vi.fn()
    h.registry.register('ping', handler)
    const handle = attachCommandDispatcher(h.deps)
    await emitText(h, '/ping')
    handle.detach()
    await emitText(h, '/ping')
    expect(handler).toHaveBeenCalledTimes(1)
  })

  it('removes its onText listener on detach', () => {
    const h = makeHarness()
    const handle = attachCommandDispatcher(h.deps)
    expect(h.emitter.listenerCount('text')).toBe(1)
    handle.detach()
    expect(h.emitter.listenerCount('text')).toBe(0)
  })

  it('detach is idempotent', () => {
    const h = makeHarness()
    const handle = attachCommandDispatcher(h.deps)
    handle.detach()
    expect(() => handle.detach()).not.toThrow()
    expect(h.emitter.listenerCount('text')).toBe(0)
  })
})
