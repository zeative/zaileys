import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { RateLimiter } from '../../src/automation/rate-limiter.js'
import { ZaileysAutomationError } from '../../src/automation/errors.js'

const settle = async (): Promise<void> => {
  await Promise.resolve()
  await Promise.resolve()
}

describe('RateLimiter construction', () => {
  it('throws RATE_LIMIT_INVALID when perSec is zero', () => {
    expect(() => new RateLimiter({ perSec: 0 })).toThrowError(ZaileysAutomationError)
  })

  it('throws RATE_LIMIT_INVALID when perSec is negative', () => {
    try {
      new RateLimiter({ perSec: -1 })
      expect.unreachable()
    } catch (e) {
      expect(e).toBeInstanceOf(ZaileysAutomationError)
      if (e instanceof ZaileysAutomationError) {
        expect(e.code).toBe('RATE_LIMIT_INVALID')
      }
    }
  })

  it('throws RATE_LIMIT_INVALID when perJidPerSec is zero', () => {
    expect(() => new RateLimiter({ perSec: 5, perJidPerSec: 0 })).toThrowError(ZaileysAutomationError)
  })

  it('throws RATE_LIMIT_INVALID when burst is negative', () => {
    expect(() => new RateLimiter({ perSec: 5, burst: -1 })).toThrowError(ZaileysAutomationError)
  })

  it('accepts a valid positive configuration', () => {
    expect(() => new RateLimiter({ perSec: 5 })).not.toThrow()
  })
})

describe('RateLimiter global pacing', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('resolves the initial burst immediately', async () => {
    const limiter = new RateLimiter({ perSec: 5, burst: 5 })
    const resolved: number[] = []
    for (let i = 0; i < 5; i++) {
      void limiter.acquire().then(() => resolved.push(i))
    }
    await settle()
    expect(resolved).toHaveLength(5)
  })

  it('does not resolve all acquires at t=0 when count exceeds burst', async () => {
    const limiter = new RateLimiter({ perSec: 5, burst: 5 })
    let done = 0
    for (let i = 0; i < 10; i++) {
      void limiter.acquire().then(() => {
        done++
      })
    }
    await settle()
    expect(done).toBe(5)
  })

  it('paces 10 acquires at perSec=5 over roughly 1 second after burst', async () => {
    const limiter = new RateLimiter({ perSec: 5, burst: 5 })
    let done = 0
    for (let i = 0; i < 10; i++) {
      void limiter.acquire().then(() => {
        done++
      })
    }
    await settle()
    expect(done).toBe(5)
    await vi.advanceTimersByTimeAsync(1000)
    expect(done).toBe(10)
  })

  it('releases one token every 200ms at perSec=5', async () => {
    const limiter = new RateLimiter({ perSec: 5, burst: 1 })
    let done = 0
    for (let i = 0; i < 3; i++) {
      void limiter.acquire().then(() => {
        done++
      })
    }
    await settle()
    expect(done).toBe(1)
    await vi.advanceTimersByTimeAsync(200)
    expect(done).toBe(2)
    await vi.advanceTimersByTimeAsync(200)
    expect(done).toBe(3)
  })

  it('honours a larger burst by resolving more requests instantly', async () => {
    const limiter = new RateLimiter({ perSec: 2, burst: 8 })
    let done = 0
    for (let i = 0; i < 8; i++) {
      void limiter.acquire().then(() => {
        done++
      })
    }
    await settle()
    expect(done).toBe(8)
  })

  it('defaults burst to perSec when not provided', async () => {
    const limiter = new RateLimiter({ perSec: 4 })
    let done = 0
    for (let i = 0; i < 6; i++) {
      void limiter.acquire().then(() => {
        done++
      })
    }
    await settle()
    expect(done).toBe(4)
  })

  it('refills capped at burst capacity after idle time', async () => {
    const limiter = new RateLimiter({ perSec: 5, burst: 5 })
    await limiter.acquire()
    await vi.advanceTimersByTimeAsync(10_000)
    let done = 0
    for (let i = 0; i < 10; i++) {
      void limiter.acquire().then(() => {
        done++
      })
    }
    await settle()
    expect(done).toBe(5)
  })
})

describe('RateLimiter per-jid isolation', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('limits a single jid while another jid still proceeds', async () => {
    const limiter = new RateLimiter({ perSec: 100, perJidPerSec: 1, burst: 100 })
    let aDone = 0
    let bDone = 0
    void limiter.acquire('a').then(() => {
      aDone++
    })
    void limiter.acquire('a').then(() => {
      aDone++
    })
    void limiter.acquire('b').then(() => {
      bDone++
    })
    await settle()
    expect(aDone).toBe(1)
    expect(bDone).toBe(1)
    await vi.advanceTimersByTimeAsync(1000)
    expect(aDone).toBe(2)
  })

  it('requires both global and per-jid tokens', async () => {
    const limiter = new RateLimiter({ perSec: 1, perJidPerSec: 5, burst: 1 })
    let done = 0
    void limiter.acquire('a').then(() => {
      done++
    })
    void limiter.acquire('b').then(() => {
      done++
    })
    await settle()
    expect(done).toBe(1)
    await vi.advanceTimersByTimeAsync(1000)
    expect(done).toBe(2)
  })

  it('keeps separate buckets per jid', async () => {
    const limiter = new RateLimiter({ perSec: 100, perJidPerSec: 2, burst: 100 })
    let aDone = 0
    let bDone = 0
    for (let i = 0; i < 4; i++) {
      void limiter.acquire('a').then(() => {
        aDone++
      })
      void limiter.acquire('b').then(() => {
        bDone++
      })
    }
    await settle()
    expect(aDone).toBe(2)
    expect(bDone).toBe(2)
  })

  it('does not apply per-jid limiting when perJidPerSec is unset', async () => {
    const limiter = new RateLimiter({ perSec: 100, burst: 100 })
    let done = 0
    for (let i = 0; i < 10; i++) {
      void limiter.acquire('a').then(() => {
        done++
      })
    }
    await settle()
    expect(done).toBe(10)
  })
})

describe('RateLimiter injectable clock', () => {
  it('uses an injected now and sleep for deterministic pacing', async () => {
    let clock = 0
    const sleeps: number[] = []
    const limiter = new RateLimiter(
      { perSec: 5, burst: 1 },
      {
        now: () => clock,
        sleep: async (ms) => {
          sleeps.push(ms)
          clock += ms
        },
      },
    )
    await limiter.acquire()
    await limiter.acquire()
    expect(sleeps.length).toBeGreaterThan(0)
    expect(sleeps[0]).toBeCloseTo(200, 0)
  })

  it('does not sleep when a token is available', async () => {
    const sleeps: number[] = []
    const limiter = new RateLimiter(
      { perSec: 5, burst: 5 },
      {
        now: () => 0,
        sleep: async (ms) => {
          sleeps.push(ms)
        },
      },
    )
    await limiter.acquire()
    expect(sleeps).toHaveLength(0)
  })
})
