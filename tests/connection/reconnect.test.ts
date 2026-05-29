import { describe, expect, it, vi } from 'vitest'
import type { DisconnectReasonDomain } from '../../src/connection/disconnect-reason.js'
import { createReconnectStrategy } from '../../src/connection/reconnect.js'

const NON_FATAL: DisconnectReasonDomain[] = [
  'restart-required',
  'bad-session',
  'connection-closed',
  'connection-lost',
  'multi-device-mismatch',
  'unavailable-service',
  'unknown',
]

const FATAL: DisconnectReasonDomain[] = ['logged-out', 'connection-replaced', 'forbidden']

const noJitter = () => 0.5

describe('createReconnectStrategy — backoff growth', () => {
  it('attempt 1 yields initialDelayMs', () => {
    const s = createReconnectStrategy({ initialDelayMs: 1000, maxDelayMs: 60000, jitterFactor: 0 })
    expect(s.next('connection-lost')).toEqual({ attempt: 1, delayMs: 1000 })
  })

  it('attempt 2 doubles to 2000', () => {
    const s = createReconnectStrategy({ initialDelayMs: 1000, maxDelayMs: 60000, jitterFactor: 0 })
    s.next('connection-lost')
    expect(s.next('connection-lost')).toEqual({ attempt: 2, delayMs: 2000 })
  })

  it('attempt 3 doubles to 4000', () => {
    const s = createReconnectStrategy({ initialDelayMs: 1000, maxDelayMs: 60000, jitterFactor: 0 })
    s.next('connection-lost')
    s.next('connection-lost')
    expect(s.next('connection-lost')).toEqual({ attempt: 3, delayMs: 4000 })
  })

  it('produces 1000-2000-4000-8000-16000-32000 sequence', () => {
    const s = createReconnectStrategy({ initialDelayMs: 1000, maxDelayMs: 60000, jitterFactor: 0 })
    const seq = [1, 2, 3, 4, 5, 6].map(() => s.next('connection-lost')?.delayMs)
    expect(seq).toEqual([1000, 2000, 4000, 8000, 16000, 32000])
  })

  it('caps at maxDelayMs once base exceeds cap', () => {
    const s = createReconnectStrategy({ initialDelayMs: 1000, maxDelayMs: 60000, jitterFactor: 0 })
    for (let i = 0; i < 6; i++) s.next('connection-lost')
    expect(s.next('connection-lost')?.delayMs).toBe(60000)
    expect(s.next('connection-lost')?.delayMs).toBe(60000)
    expect(s.next('connection-lost')?.delayMs).toBe(60000)
  })

  it('uses custom initialDelayMs', () => {
    const s = createReconnectStrategy({ initialDelayMs: 500, maxDelayMs: 60000, jitterFactor: 0 })
    expect(s.next('connection-lost')?.delayMs).toBe(500)
    expect(s.next('connection-lost')?.delayMs).toBe(1000)
    expect(s.next('connection-lost')?.delayMs).toBe(2000)
  })

  it('attempt counter exposed via attempts getter', () => {
    const s = createReconnectStrategy({ jitterFactor: 0 })
    expect(s.attempts).toBe(0)
    s.next('connection-lost')
    expect(s.attempts).toBe(1)
    s.next('connection-lost')
    expect(s.attempts).toBe(2)
  })

  it('initialDelayMs greater than maxDelayMs clamps first delay', () => {
    const s = createReconnectStrategy({ initialDelayMs: 100000, maxDelayMs: 5000, jitterFactor: 0 })
    expect(s.next('connection-lost')?.delayMs).toBe(5000)
  })
})

describe('createReconnectStrategy — jitter math', () => {
  it('jitter 0.2 with random()=0.5 produces no change', () => {
    const s = createReconnectStrategy(
      { initialDelayMs: 1000, maxDelayMs: 60000, jitterFactor: 0.2 },
      { random: noJitter },
    )
    expect(s.next('connection-lost')?.delayMs).toBe(1000)
  })

  it('jitter 0.2 with random()=0 yields base * 0.8', () => {
    const s = createReconnectStrategy(
      { initialDelayMs: 1000, maxDelayMs: 60000, jitterFactor: 0.2 },
      { random: () => 0 },
    )
    expect(s.next('connection-lost')?.delayMs).toBe(800)
  })

  it('jitter 0.2 with random()=1 yields base * 1.2', () => {
    const s = createReconnectStrategy(
      { initialDelayMs: 1000, maxDelayMs: 60000, jitterFactor: 0.2 },
      { random: () => 1 },
    )
    expect(s.next('connection-lost')?.delayMs).toBe(1200)
  })

  it('jitter 0.5 with random()=0 yields base * 0.5', () => {
    const s = createReconnectStrategy(
      { initialDelayMs: 1000, maxDelayMs: 60000, jitterFactor: 0.5 },
      { random: () => 0 },
    )
    expect(s.next('connection-lost')?.delayMs).toBe(500)
  })

  it('jitter 0.5 with random()=1 yields base * 1.5', () => {
    const s = createReconnectStrategy(
      { initialDelayMs: 1000, maxDelayMs: 60000, jitterFactor: 0.5 },
      { random: () => 1 },
    )
    expect(s.next('connection-lost')?.delayMs).toBe(1500)
  })

  it('jitter never pushes delay beyond maxDelayMs', () => {
    const s = createReconnectStrategy(
      { initialDelayMs: 60000, maxDelayMs: 60000, jitterFactor: 0.2 },
      { random: () => 1 },
    )
    expect(s.next('connection-lost')?.delayMs).toBe(60000)
  })

  it('default Math.random produces delay within ±20% of base', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.75)
    const s = createReconnectStrategy({ initialDelayMs: 1000, maxDelayMs: 60000, jitterFactor: 0.2 })
    const decision = s.next('connection-lost')
    expect(decision?.delayMs).toBe(1100)
    vi.restoreAllMocks()
  })

  it('determinism: same seeded RNG yields identical sequence', () => {
    const seq1 = (() => {
      const s = createReconnectStrategy({ jitterFactor: 0.2 }, { random: () => 0.3 })
      return [1, 2, 3].map(() => s.next('connection-lost')?.delayMs)
    })()
    const seq2 = (() => {
      const s = createReconnectStrategy({ jitterFactor: 0.2 }, { random: () => 0.3 })
      return [1, 2, 3].map(() => s.next('connection-lost')?.delayMs)
    })()
    expect(seq1).toEqual(seq2)
  })
})

describe('createReconnectStrategy — fatal short-circuit', () => {
  for (const reason of FATAL) {
    it(`fatal "${reason}" returns null at attempt 0 without incrementing counter`, () => {
      const s = createReconnectStrategy({ jitterFactor: 0 })
      expect(s.next(reason)).toBeNull()
      expect(s.attempts).toBe(0)
    })

    it(`fatal "${reason}" returns null after prior non-fatal call, preserving prior counter`, () => {
      const s = createReconnectStrategy({ jitterFactor: 0 })
      s.next('connection-lost')
      expect(s.attempts).toBe(1)
      expect(s.next(reason)).toBeNull()
      expect(s.attempts).toBe(1)
    })
  }
})

describe('createReconnectStrategy — maxAttempts cap', () => {
  it('cap=3 yields exactly 3 decisions then null', () => {
    const s = createReconnectStrategy({ maxAttempts: 3, jitterFactor: 0 })
    expect(s.next('connection-lost')?.attempt).toBe(1)
    expect(s.next('connection-lost')?.attempt).toBe(2)
    expect(s.next('connection-lost')?.attempt).toBe(3)
    expect(s.next('connection-lost')).toBeNull()
    expect(s.next('connection-lost')).toBeNull()
  })

  it('cap=1 yields 1 then null', () => {
    const s = createReconnectStrategy({ maxAttempts: 1, jitterFactor: 0 })
    expect(s.next('connection-lost')?.attempt).toBe(1)
    expect(s.next('connection-lost')).toBeNull()
  })

  it('cap=0 yields null immediately', () => {
    const s = createReconnectStrategy({ maxAttempts: 0, jitterFactor: 0 })
    expect(s.next('connection-lost')).toBeNull()
    expect(s.attempts).toBe(0)
  })

  it('cap=Infinity yields 100 successive non-null', () => {
    const s = createReconnectStrategy({ jitterFactor: 0 })
    for (let i = 0; i < 100; i++) {
      expect(s.next('connection-lost')).not.toBeNull()
    }
  })

  it('reset() after cap allows fresh sequence', () => {
    const s = createReconnectStrategy({ maxAttempts: 2, jitterFactor: 0 })
    s.next('connection-lost')
    s.next('connection-lost')
    expect(s.next('connection-lost')).toBeNull()
    s.reset()
    expect(s.next('connection-lost')?.attempt).toBe(1)
  })
})

describe('createReconnectStrategy — enabled flag', () => {
  it('enabled: false yields null on first call', () => {
    const s = createReconnectStrategy({ enabled: false })
    expect(s.next('connection-lost')).toBeNull()
  })

  it('enabled: false yields null for every reason', () => {
    const s = createReconnectStrategy({ enabled: false })
    for (const r of [...FATAL, ...NON_FATAL]) {
      expect(s.next(r)).toBeNull()
    }
    expect(s.attempts).toBe(0)
  })

  it('enabled undefined defaults to true', () => {
    const s = createReconnectStrategy({ jitterFactor: 0 })
    expect(s.next('connection-lost')).not.toBeNull()
  })
})

describe('createReconnectStrategy — reset', () => {
  it('reset after partial run resets counter to 0', () => {
    const s = createReconnectStrategy({ jitterFactor: 0 })
    s.next('connection-lost')
    s.next('connection-lost')
    expect(s.attempts).toBe(2)
    s.reset()
    expect(s.attempts).toBe(0)
    expect(s.next('connection-lost')?.attempt).toBe(1)
  })

  it('reset after fatal short-circuit is a no-op for counter', () => {
    const s = createReconnectStrategy({ jitterFactor: 0 })
    s.next('logged-out')
    s.reset()
    expect(s.attempts).toBe(0)
  })

  it('reset before first call is a safe no-op', () => {
    const s = createReconnectStrategy({ jitterFactor: 0 })
    s.reset()
    expect(s.attempts).toBe(0)
    expect(s.next('connection-lost')?.attempt).toBe(1)
  })

  it('reset restores backoff exponent (not just counter)', () => {
    const s = createReconnectStrategy({ initialDelayMs: 1000, jitterFactor: 0 })
    s.next('connection-lost')
    s.next('connection-lost')
    s.next('connection-lost')
    s.reset()
    expect(s.next('connection-lost')?.delayMs).toBe(1000)
  })
})

describe('createReconnectStrategy — reason coverage', () => {
  for (const reason of NON_FATAL) {
    it(`non-fatal "${reason}" continues reconnect`, () => {
      const s = createReconnectStrategy({ jitterFactor: 0 })
      const decision = s.next(reason)
      expect(decision).not.toBeNull()
      expect(decision?.attempt).toBe(1)
    })
  }

  for (const reason of FATAL) {
    it(`fatal "${reason}" blocks reconnect`, () => {
      const s = createReconnectStrategy({ jitterFactor: 0 })
      expect(s.next(reason)).toBeNull()
    })
  }
})

describe('createReconnectStrategy — fake timer compatibility', () => {
  it('strategy is pure — fake timers do not affect delay computation', () => {
    vi.useFakeTimers()
    const s = createReconnectStrategy({ initialDelayMs: 1000, jitterFactor: 0 })
    const d1 = s.next('connection-lost')
    vi.advanceTimersByTime(50000)
    const d2 = s.next('connection-lost')
    expect(d1?.delayMs).toBe(1000)
    expect(d2?.delayMs).toBe(2000)
    vi.useRealTimers()
  })
})
