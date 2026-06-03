import { describe, expect, it } from 'vitest'
import { createAuthGuard } from '../../src/connection/auth-guard.js'

describe('createAuthGuard — QR budget', () => {
  it('allows up to maxQrAttempts then exhausts', () => {
    const g = createAuthGuard({ maxQrAttempts: 3 })
    for (let i = 0; i < 3; i++) {
      const d = g.evaluate('qr', i)
      expect(d.allowed).toBe(true)
      g.record('qr', i)
    }
    const blocked = g.evaluate('qr', 99)
    expect(blocked.allowed).toBe(false)
    expect(blocked.reason).toBe('budget-exhausted')
    expect(blocked.attempts).toBe(3)
    expect(blocked.max).toBe(3)
  })

  it('default maxQrAttempts is 5', () => {
    const g = createAuthGuard()
    for (let i = 0; i < 5; i++) {
      expect(g.evaluate('qr', i).allowed).toBe(true)
      g.record('qr', i)
    }
    expect(g.evaluate('qr', 6).allowed).toBe(false)
    expect(g.qrAttempts).toBe(5)
  })

  it('reset() clears the QR budget', () => {
    const g = createAuthGuard({ maxQrAttempts: 1 })
    g.record('qr', 0)
    expect(g.evaluate('qr', 1).allowed).toBe(false)
    g.reset()
    expect(g.evaluate('qr', 2).allowed).toBe(true)
    expect(g.qrAttempts).toBe(0)
  })
})

describe('createAuthGuard — pairing cooldown + budget', () => {
  it('first pairing request is allowed immediately', () => {
    const g = createAuthGuard({ pairingCooldownMs: 60_000 })
    expect(g.evaluate('pairing', 0)).toMatchObject({ allowed: true })
  })

  it('blocks a second request inside the escalating cooldown window', () => {
    const g = createAuthGuard({ pairingCooldownMs: 60_000, maxPairingAttempts: 5 })
    g.record('pairing', 0)
    const tooSoon = g.evaluate('pairing', 30_000)
    expect(tooSoon.allowed).toBe(false)
    expect(tooSoon.reason).toBe('cooldown')
    expect(tooSoon.waitMs).toBe(30_000)
  })

  it('allows the next request once the cooldown elapses', () => {
    const g = createAuthGuard({ pairingCooldownMs: 60_000, maxPairingAttempts: 5 })
    g.record('pairing', 0)
    expect(g.evaluate('pairing', 60_000).allowed).toBe(true)
  })

  it('cooldown escalates per attempt (60s, 120s, ...)', () => {
    const g = createAuthGuard({ pairingCooldownMs: 60_000, maxPairingAttempts: 5 })
    g.record('pairing', 0)
    g.record('pairing', 60_000)
    expect(g.evaluate('pairing', 60_000 + 119_000).allowed).toBe(false)
    expect(g.evaluate('pairing', 60_000 + 120_000).allowed).toBe(true)
  })

  it('exhausts after maxPairingAttempts (default 3)', () => {
    const g = createAuthGuard({ pairingCooldownMs: 0 })
    g.record('pairing', 0)
    g.record('pairing', 1)
    g.record('pairing', 2)
    const d = g.evaluate('pairing', 3)
    expect(d.allowed).toBe(false)
    expect(d.reason).toBe('budget-exhausted')
    expect(d.max).toBe(3)
  })
})

describe('createAuthGuard — disabled escape hatch', () => {
  it('never blocks when enabled is false', () => {
    const g = createAuthGuard({ enabled: false, maxQrAttempts: 1, maxPairingAttempts: 1 })
    for (let i = 0; i < 50; i++) {
      expect(g.evaluate('qr', i).allowed).toBe(true)
      g.record('qr', i)
      expect(g.evaluate('pairing', i).allowed).toBe(true)
      g.record('pairing', i)
    }
    expect(g.enabled).toBe(false)
  })
})
