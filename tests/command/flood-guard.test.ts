import { describe, expect, it } from 'vitest'
import { ZaileysCommandError } from '../../src/command/errors.js'
import { createFloodGuard, FloodGuard } from '../../src/command/flood-guard.js'
import type { CommandFloodOptions } from '../../src/command/types.js'

const SENDER = '628111@s.whatsapp.net'

const codeOf = (fn: () => unknown): string | undefined => {
  try {
    fn()
  } catch (err) {
    return err instanceof ZaileysCommandError ? err.code : 'not-a-command-error'
  }
  return undefined
}

const fill = (guard: FloodGuard, sender: string, times: number, now: number): void => {
  for (let i = 0; i < times; i += 1) expect(guard.take(sender, now)).toBeNull()
}

describe('FloodGuard — limits', () => {
  it('allows 20 commands per minute by default and blocks the 21st', () => {
    const guard = new FloodGuard()
    expect(guard.maxCommands).toBe(20)
    expect(guard.windowMs).toBe(60_000)
    fill(guard, SENDER, 20, 1_000)
    expect(guard.take(SENDER, 1_000)).toEqual({ retryIn: 60 })
  })

  it('allows exactly maxCommands within the window', () => {
    const guard = new FloodGuard({ maxCommands: 3, windowMs: 10_000 })
    fill(guard, SENDER, 3, 0)
    expect(guard.take(SENDER, 9_999)).not.toBeNull()
  })

  it('reports the seconds left until the window ends, rounded up', () => {
    const guard = new FloodGuard({ maxCommands: 1, windowMs: 10_000 })
    guard.take(SENDER, 0)
    expect(guard.take(SENDER, 4_500)).toEqual({ retryIn: 6 })
    expect(guard.take(SENDER, 9_999)).toEqual({ retryIn: 1 })
  })

  it('starts a fresh window once the old one ends, without sleeping', () => {
    const guard = new FloodGuard({ maxCommands: 2, windowMs: 1_000 })
    fill(guard, SENDER, 2, 0)
    expect(guard.take(SENDER, 999)).not.toBeNull()
    fill(guard, SENDER, 2, 1_000)
    expect(guard.take(SENDER, 1_500)).not.toBeNull()
  })

  it('does not count blocked commands against the next window', () => {
    const guard = new FloodGuard({ maxCommands: 1, windowMs: 1_000 })
    guard.take(SENDER, 0)
    for (let i = 0; i < 50; i += 1) guard.take(SENDER, 500)
    expect(guard.take(SENDER, 1_000)).toBeNull()
  })
})

describe('FloodGuard — notice', () => {
  it('returns the notice on the first blocked command of a window only', () => {
    const guard = new FloodGuard({ maxCommands: 1, windowMs: 1_000, notice: 'slow down' })
    guard.take(SENDER, 0)
    expect(guard.take(SENDER, 10)).toEqual({ retryIn: 1, notice: 'slow down' })
    expect(guard.take(SENDER, 20)).toEqual({ retryIn: 1 })
    expect(guard.take(SENDER, 30)).toEqual({ retryIn: 1 })
  })

  it('sends the notice again in a later window', () => {
    const guard = new FloodGuard({ maxCommands: 1, windowMs: 1_000, notice: 'slow down' })
    guard.take(SENDER, 0)
    expect(guard.take(SENDER, 10)?.notice).toBe('slow down')
    guard.take(SENDER, 1_000)
    expect(guard.take(SENDER, 1_010)?.notice).toBe('slow down')
  })

  it('stays silent when notice is false', () => {
    const guard = new FloodGuard({ maxCommands: 1, notice: false })
    guard.take(SENDER, 0)
    expect(guard.take(SENDER, 1)).toEqual({ retryIn: 60 })
  })
})

describe('FloodGuard — identity', () => {
  it('counts every device of one account together', () => {
    const guard = new FloodGuard({ maxCommands: 2 })
    expect(guard.take('628111:3@s.whatsapp.net', 0)).toBeNull()
    expect(guard.take('628111:7@s.whatsapp.net', 0)).toBeNull()
    expect(guard.take(SENDER, 0)).not.toBeNull()
  })

  it('never merges a LID with a phone number that has the same digits', () => {
    const guard = new FloodGuard({ maxCommands: 1 })
    expect(guard.take('628111@lid', 0)).toBeNull()
    expect(guard.take(SENDER, 0)).toBeNull()
    expect(guard.take('628111@lid', 0)).not.toBeNull()
  })

  it('keeps each sender on a separate budget', () => {
    const guard = new FloodGuard({ maxCommands: 1 })
    guard.take(SENDER, 0)
    expect(guard.take(SENDER, 0)).not.toBeNull()
    expect(guard.take('628222@s.whatsapp.net', 0)).toBeNull()
  })

  it('still counts a sender id that is not a JID', () => {
    const guard = new FloodGuard({ maxCommands: 1 })
    guard.take('weird-id', 0)
    expect(guard.take('weird-id', 0)).not.toBeNull()
  })
})

describe('FloodGuard — memory', () => {
  it('stays bounded under 20 000 distinct senders', () => {
    const guard = new FloodGuard()
    for (let i = 0; i < 20_000; i += 1) guard.take(`62800${i}@s.whatsapp.net`, i)
    expect(guard.size).toBeLessThanOrEqual(10_000)
  })

  it('honours a smaller sender cap', () => {
    const guard = new FloodGuard({}, { maxSenders: 2 })
    guard.take('1@s.whatsapp.net', 0)
    guard.take('2@s.whatsapp.net', 0)
    guard.take('3@s.whatsapp.net', 0)
    expect(guard.size).toBe(2)
  })

  it('forgets every sender on clear()', () => {
    const guard = new FloodGuard({ maxCommands: 1 })
    guard.take(SENDER, 0)
    guard.clear()
    expect(guard.size).toBe(0)
    expect(guard.take(SENDER, 0)).toBeNull()
  })
})

describe('FloodGuard — options', () => {
  const invalid: Array<[string, CommandFloodOptions]> = [
    ['maxCommands is zero', { maxCommands: 0 }],
    ['maxCommands is negative', { maxCommands: -1 }],
    ['maxCommands is fractional', { maxCommands: 1.5 }],
    ['maxCommands is Infinity', { maxCommands: Number.POSITIVE_INFINITY }],
    ['maxCommands is NaN', { maxCommands: Number.NaN }],
    ['windowMs is zero', { windowMs: 0 }],
    ['windowMs is Infinity', { windowMs: Number.POSITIVE_INFINITY }],
    ['notice is empty', { notice: '  ' }],
  ]

  for (const [label, options] of invalid) {
    it(`throws INVALID_OPTIONS when ${label}`, () => {
      expect(codeOf(() => new FloodGuard(options))).toBe('INVALID_OPTIONS')
    })
  }

  it('names the option and the value in the message', () => {
    expect(() => new FloodGuard({ windowMs: -5 })).toThrow('commandFlood.windowMs must be a positive integer, got -5')
  })

  it('throws INVALID_OPTIONS when commandFlood is not an object', () => {
    expect(codeOf(() => new FloodGuard(true as unknown as CommandFloodOptions))).toBe('INVALID_OPTIONS')
  })

  it('creates a default guard when the option is omitted', () => {
    expect(createFloodGuard(undefined)?.maxCommands).toBe(20)
  })

  it('creates no guard when the option is false', () => {
    expect(createFloodGuard(false)).toBeUndefined()
  })
})
