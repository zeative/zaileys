import { describe, expect, it, vi } from 'vitest'
import { runMiddleware } from '../../src/command/middleware.js'
import { ZaileysCommandError } from '../../src/command/errors.js'
import type { CommandContext, Middleware } from '../../src/command/types.js'

const ctx = (): CommandContext =>
  ({
    jid: '123@s.whatsapp.net',
    command: 'ping',
    args: [],
    flags: {},
    json: undefined,
    raw: '/ping',
  }) as unknown as CommandContext

describe('runMiddleware — sequencing', () => {
  it('runs final directly when the chain is empty', async () => {
    const final = vi.fn(async () => {})
    await runMiddleware([], ctx(), final)
    expect(final).toHaveBeenCalledTimes(1)
  })

  it('runs a single middleware then final', async () => {
    const order: string[] = []
    const mw: Middleware = async (_c, next) => {
      order.push('mw-before')
      await next()
      order.push('mw-after')
    }
    await runMiddleware([mw], ctx(), async () => {
      order.push('final')
    })
    expect(order).toEqual(['mw-before', 'final', 'mw-after'])
  })

  it('runs two middleware in onion order around final', async () => {
    const order: string[] = []
    const mw1: Middleware = async (_c, next) => {
      order.push('mw1-before')
      await next()
      order.push('mw1-after')
    }
    const mw2: Middleware = async (_c, next) => {
      order.push('mw2-before')
      await next()
      order.push('mw2-after')
    }
    await runMiddleware([mw1, mw2], ctx(), async () => {
      order.push('final')
    })
    expect(order).toEqual(['mw1-before', 'mw2-before', 'final', 'mw2-after', 'mw1-after'])
  })

  it('supports synchronous middleware', async () => {
    const order: string[] = []
    const mw: Middleware = (_c, next) => {
      order.push('before')
      return next()
    }
    await runMiddleware([mw], ctx(), () => {
      order.push('final')
    })
    expect(order).toEqual(['before', 'final'])
  })

  it('runs three middleware in correct nesting order', async () => {
    const order: number[] = []
    const make = (n: number): Middleware => async (_c, next) => {
      order.push(n)
      await next()
      order.push(-n)
    }
    await runMiddleware([make(1), make(2), make(3)], ctx(), async () => {
      order.push(0)
    })
    expect(order).toEqual([1, 2, 3, 0, -3, -2, -1])
  })
})

describe('runMiddleware — short-circuit', () => {
  it('skips final and downstream middleware when next() is not called', async () => {
    const order: string[] = []
    const mw1: Middleware = async () => {
      order.push('mw1')
    }
    const mw2 = vi.fn()
    const final = vi.fn()
    await runMiddleware([mw1, mw2], ctx(), final)
    expect(order).toEqual(['mw1'])
    expect(mw2).not.toHaveBeenCalled()
    expect(final).not.toHaveBeenCalled()
  })

  it('runs upstream after-logic even when a downstream short-circuits', async () => {
    const order: string[] = []
    const mw1: Middleware = async (_c, next) => {
      order.push('mw1-before')
      await next()
      order.push('mw1-after')
    }
    const mw2: Middleware = async () => {
      order.push('mw2-stop')
    }
    const final = vi.fn()
    await runMiddleware([mw1, mw2], ctx(), final)
    expect(order).toEqual(['mw1-before', 'mw2-stop', 'mw1-after'])
    expect(final).not.toHaveBeenCalled()
  })
})

describe('runMiddleware — double-next guard', () => {
  it('throws MIDDLEWARE_ERROR when next() is called more than once', async () => {
    const mw: Middleware = async (_c, next) => {
      await next()
      await next()
    }
    await expect(runMiddleware([mw], ctx(), async () => {})).rejects.toMatchObject({
      code: 'MIDDLEWARE_ERROR',
    })
  })

  it('rejects with a ZaileysCommandError instance on double-next', async () => {
    const mw: Middleware = async (_c, next) => {
      await next()
      await next()
    }
    await expect(runMiddleware([mw], ctx(), async () => {})).rejects.toBeInstanceOf(ZaileysCommandError)
  })
})

describe('runMiddleware — error propagation', () => {
  it('wraps a middleware throw as MIDDLEWARE_ERROR and preserves cause', async () => {
    const original = new Error('boom')
    const mw: Middleware = async () => {
      throw original
    }
    try {
      await runMiddleware([mw], ctx(), async () => {})
      expect.unreachable('should have rejected')
    } catch (err) {
      expect(err).toBeInstanceOf(ZaileysCommandError)
      expect((err as ZaileysCommandError).code).toBe('MIDDLEWARE_ERROR')
      expect((err as ZaileysCommandError).cause).toBe(original)
    }
  })

  it('does not double-wrap an existing ZaileysCommandError from a middleware', async () => {
    const inner = new ZaileysCommandError('MIDDLEWARE_ERROR', 'inner')
    const mw: Middleware = async () => {
      throw inner
    }
    await expect(runMiddleware([mw], ctx(), async () => {})).rejects.toBe(inner)
  })

  it('propagates a final() error as-is (dispatcher owns HANDLER_ERROR wrapping)', async () => {
    const original = new Error('handler boom')
    await expect(
      runMiddleware([], ctx(), async () => {
        throw original
      }),
    ).rejects.toBe(original)
  })

  it('propagates a final() error through middleware unchanged', async () => {
    const original = new Error('deep')
    const mw: Middleware = async (_c, next) => {
      await next()
    }
    await expect(
      runMiddleware([mw], ctx(), async () => {
        throw original
      }),
    ).rejects.toBe(original)
  })

  it('stops downstream when an upstream middleware throws before next()', async () => {
    const mw1: Middleware = async () => {
      throw new Error('early')
    }
    const mw2 = vi.fn()
    await expect(runMiddleware([mw1, mw2], ctx(), async () => {})).rejects.toBeInstanceOf(ZaileysCommandError)
    expect(mw2).not.toHaveBeenCalled()
  })
})

describe('runMiddleware — context identity', () => {
  it('passes the same ctx reference to every middleware and final', async () => {
    const c = ctx()
    const seen: CommandContext[] = []
    const mw1: Middleware = async (received, next) => {
      seen.push(received)
      await next()
    }
    const mw2: Middleware = async (received, next) => {
      seen.push(received)
      await next()
    }
    let finalCtx: CommandContext | undefined
    await runMiddleware([mw1, mw2], c, async () => {
      finalCtx = c
    })
    expect(seen[0]).toBe(c)
    expect(seen[1]).toBe(c)
    expect(finalCtx).toBe(c)
  })
})
