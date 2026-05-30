import { describe, expect, it, vi } from 'vitest'
import type { ConnectionState } from '../../src/client/types.js'
import { createConnectionStateMachine } from '../../src/connection/state-machine.js'

describe('createConnectionStateMachine — initial state', () => {
  it('defaults to idle', () => {
    const fsm = createConnectionStateMachine()
    expect(fsm.state).toBe('idle')
  })

  it('accepts explicit initial state', () => {
    const fsm = createConnectionStateMachine('disconnected')
    expect(fsm.state).toBe('disconnected')
  })
})

describe('happy-path transitions', () => {
  it('idle -> connecting', () => {
    const fsm = createConnectionStateMachine()
    fsm.transition('connecting')
    expect(fsm.state).toBe('connecting')
  })

  it('connecting -> qr-pending', () => {
    const fsm = createConnectionStateMachine('connecting')
    fsm.transition('qr-pending')
    expect(fsm.state).toBe('qr-pending')
  })

  it('connecting -> pairing-pending', () => {
    const fsm = createConnectionStateMachine('connecting')
    fsm.transition('pairing-pending')
    expect(fsm.state).toBe('pairing-pending')
  })

  it('qr-pending -> connected', () => {
    const fsm = createConnectionStateMachine('qr-pending')
    fsm.transition('connected')
    expect(fsm.state).toBe('connected')
  })

  it('qr-pending -> reconnecting (515 before first open)', () => {
    const fsm = createConnectionStateMachine('qr-pending')
    fsm.transition('reconnecting')
    expect(fsm.state).toBe('reconnecting')
  })

  it('pairing-pending -> reconnecting (515 before first open)', () => {
    const fsm = createConnectionStateMachine('pairing-pending')
    fsm.transition('reconnecting')
    expect(fsm.state).toBe('reconnecting')
  })

  it('pairing-pending -> connected', () => {
    const fsm = createConnectionStateMachine('pairing-pending')
    fsm.transition('connected')
    expect(fsm.state).toBe('connected')
  })

  it('connected -> reconnecting', () => {
    const fsm = createConnectionStateMachine('connected')
    fsm.transition('reconnecting')
    expect(fsm.state).toBe('reconnecting')
  })

  it('reconnecting -> connecting', () => {
    const fsm = createConnectionStateMachine('reconnecting')
    fsm.transition('connecting')
    expect(fsm.state).toBe('connecting')
  })

  it('disconnecting -> disconnected', () => {
    const fsm = createConnectionStateMachine('disconnecting')
    fsm.transition('disconnected')
    expect(fsm.state).toBe('disconnected')
  })

  it('disconnected -> idle', () => {
    const fsm = createConnectionStateMachine('disconnected')
    fsm.transition('idle')
    expect(fsm.state).toBe('idle')
  })

  it('disconnected -> connecting', () => {
    const fsm = createConnectionStateMachine('disconnected')
    fsm.transition('connecting')
    expect(fsm.state).toBe('connecting')
  })
})

describe('invalid transitions throw', () => {
  const invalid: Array<[ConnectionState, ConnectionState]> = [
    ['idle', 'connected'],
    ['idle', 'reconnecting'],
    ['idle', 'qr-pending'],
    ['connected', 'qr-pending'],
    ['connected', 'pairing-pending'],
    ['reconnecting', 'connected'],
    ['disconnecting', 'connecting'],
    ['disconnected', 'connected'],
  ]

  for (const [from, to] of invalid) {
    it(`${from} -> ${to} throws`, () => {
      const fsm = createConnectionStateMachine(from)
      expect(() => fsm.transition(to)).toThrow(/invalid state transition/i)
      expect(() => fsm.transition(to)).toThrow(new RegExp(`${from}.*${to}`))
    })
  }
})

describe('canTransition', () => {
  it('returns true for legal next state', () => {
    const fsm = createConnectionStateMachine('idle')
    expect(fsm.canTransition('connecting')).toBe(true)
  })

  it('returns false for illegal next state', () => {
    const fsm = createConnectionStateMachine('idle')
    expect(fsm.canTransition('connected')).toBe(false)
  })

  it('does not mutate state', () => {
    const fsm = createConnectionStateMachine('idle')
    fsm.canTransition('connecting')
    expect(fsm.state).toBe('idle')
  })

  it('reflects new state after transition', () => {
    const fsm = createConnectionStateMachine('idle')
    fsm.transition('connecting')
    expect(fsm.canTransition('qr-pending')).toBe(true)
    expect(fsm.canTransition('reconnecting')).toBe(true)
  })

  it('is idempotent', () => {
    const fsm = createConnectionStateMachine('idle')
    expect(fsm.canTransition('connecting')).toBe(true)
    expect(fsm.canTransition('connecting')).toBe(true)
  })
})

describe('onChange listener', () => {
  it('fires with (prev, next)', () => {
    const fsm = createConnectionStateMachine('idle')
    const listener = vi.fn()
    fsm.onChange(listener)
    fsm.transition('connecting')
    expect(listener).toHaveBeenCalledWith('idle', 'connecting')
  })

  it('unsubscribe stops emission', () => {
    const fsm = createConnectionStateMachine('idle')
    const listener = vi.fn()
    const off = fsm.onChange(listener)
    off()
    fsm.transition('connecting')
    expect(listener).not.toHaveBeenCalled()
  })

  it('multiple listeners all fire', () => {
    const fsm = createConnectionStateMachine('idle')
    const a = vi.fn()
    const b = vi.fn()
    fsm.onChange(a)
    fsm.onChange(b)
    fsm.transition('connecting')
    expect(a).toHaveBeenCalledOnce()
    expect(b).toHaveBeenCalledOnce()
  })

  it('listener throwing does not break machine', () => {
    const fsm = createConnectionStateMachine('idle')
    fsm.onChange(() => {
      throw new Error('boom')
    })
    const after = vi.fn()
    fsm.onChange(after)
    expect(() => fsm.transition('connecting')).not.toThrow()
    expect(fsm.state).toBe('connecting')
    expect(after).toHaveBeenCalled()
  })
})

describe('multi-step flows', () => {
  it('full QR flow: idle -> connecting -> qr-pending -> connected', () => {
    const fsm = createConnectionStateMachine()
    fsm.transition('connecting')
    fsm.transition('qr-pending')
    fsm.transition('connected')
    expect(fsm.state).toBe('connected')
  })

  it('full pairing flow: idle -> connecting -> pairing-pending -> connected', () => {
    const fsm = createConnectionStateMachine()
    fsm.transition('connecting')
    fsm.transition('pairing-pending')
    fsm.transition('connected')
    expect(fsm.state).toBe('connected')
  })

  it('reconnect cycle: connected -> reconnecting -> connecting -> connected', () => {
    const fsm = createConnectionStateMachine('connected')
    fsm.transition('reconnecting')
    fsm.transition('connecting')
    fsm.transition('connected')
    expect(fsm.state).toBe('connected')
  })

  it('graceful disconnect: connected -> disconnecting -> disconnected', () => {
    const fsm = createConnectionStateMachine('connected')
    fsm.transition('disconnecting')
    fsm.transition('disconnected')
    expect(fsm.state).toBe('disconnected')
  })

  it('logout flow: connected -> disconnected (skipping disconnecting allowed)', () => {
    const fsm = createConnectionStateMachine('connected')
    fsm.transition('disconnected')
    expect(fsm.state).toBe('disconnected')
  })

  it('reconnect after explicit disconnect: disconnected -> reconnecting', () => {
    const fsm = createConnectionStateMachine('disconnected')
    fsm.transition('reconnecting')
    expect(fsm.state).toBe('reconnecting')
  })

  it('emits change for each step of full flow', () => {
    const fsm = createConnectionStateMachine()
    const transitions: Array<[string, string]> = []
    fsm.onChange((p, n) => transitions.push([p, n]))
    fsm.transition('connecting')
    fsm.transition('qr-pending')
    fsm.transition('connected')
    fsm.transition('disconnecting')
    fsm.transition('disconnected')
    expect(transitions).toEqual([
      ['idle', 'connecting'],
      ['connecting', 'qr-pending'],
      ['qr-pending', 'connected'],
      ['connected', 'disconnecting'],
      ['disconnecting', 'disconnected'],
    ])
  })
})
