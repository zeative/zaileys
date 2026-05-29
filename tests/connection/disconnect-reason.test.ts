import { DisconnectReason as BaileysDisconnectReason } from 'baileys'
import { describe, expect, it } from 'vitest'
import {
  isFatalDisconnect,
  mapDisconnectReason,
  shouldClearAuth,
  shouldReconnect,
} from '../../src/connection/disconnect-reason.js'

describe('mapDisconnectReason', () => {
  it('maps 401 -> logged-out', () => {
    expect(mapDisconnectReason(401)).toBe('logged-out')
  })

  it('maps 403 -> forbidden', () => {
    expect(mapDisconnectReason(403)).toBe('forbidden')
  })

  it('maps 408 -> connection-lost (collapses timedOut)', () => {
    expect(mapDisconnectReason(408)).toBe('connection-lost')
  })

  it('maps 411 -> multi-device-mismatch', () => {
    expect(mapDisconnectReason(411)).toBe('multi-device-mismatch')
  })

  it('maps 428 -> connection-closed', () => {
    expect(mapDisconnectReason(428)).toBe('connection-closed')
  })

  it('maps 440 -> connection-replaced', () => {
    expect(mapDisconnectReason(440)).toBe('connection-replaced')
  })

  it('maps 500 -> bad-session', () => {
    expect(mapDisconnectReason(500)).toBe('bad-session')
  })

  it('maps 503 -> unavailable-service', () => {
    expect(mapDisconnectReason(503)).toBe('unavailable-service')
  })

  it('maps 515 -> restart-required', () => {
    expect(mapDisconnectReason(515)).toBe('restart-required')
  })

  it('maps undefined -> unknown', () => {
    expect(mapDisconnectReason(undefined)).toBe('unknown')
  })

  it('maps 9999 -> unknown', () => {
    expect(mapDisconnectReason(9999)).toBe('unknown')
  })

  it('round-trips BaileysDisconnectReason.loggedOut', () => {
    expect(mapDisconnectReason(BaileysDisconnectReason.loggedOut)).toBe('logged-out')
  })

  it('round-trips BaileysDisconnectReason.restartRequired', () => {
    expect(mapDisconnectReason(BaileysDisconnectReason.restartRequired)).toBe('restart-required')
  })

  it('round-trips BaileysDisconnectReason.unavailableService', () => {
    expect(mapDisconnectReason(BaileysDisconnectReason.unavailableService)).toBe('unavailable-service')
  })
})

describe('isFatalDisconnect', () => {
  it('returns true for logged-out', () => {
    expect(isFatalDisconnect('logged-out')).toBe(true)
  })

  it('returns true for connection-replaced', () => {
    expect(isFatalDisconnect('connection-replaced')).toBe(true)
  })

  it('returns true for forbidden', () => {
    expect(isFatalDisconnect('forbidden')).toBe(true)
  })

  it('returns false for unavailable-service', () => {
    expect(isFatalDisconnect('unavailable-service')).toBe(false)
  })

  it('returns false for bad-session', () => {
    expect(isFatalDisconnect('bad-session')).toBe(false)
  })

  it('returns false for unknown', () => {
    expect(isFatalDisconnect('unknown')).toBe(false)
  })
})

describe('shouldClearAuth', () => {
  it('returns true for logged-out', () => {
    expect(shouldClearAuth('logged-out')).toBe(true)
  })

  it('returns true for connection-replaced', () => {
    expect(shouldClearAuth('connection-replaced')).toBe(true)
  })

  it('returns true for forbidden', () => {
    expect(shouldClearAuth('forbidden')).toBe(true)
  })

  it('returns true for bad-session', () => {
    expect(shouldClearAuth('bad-session')).toBe(true)
  })

  it('returns false for unavailable-service', () => {
    expect(shouldClearAuth('unavailable-service')).toBe(false)
  })

  it('returns false for restart-required', () => {
    expect(shouldClearAuth('restart-required')).toBe(false)
  })
})

describe('shouldReconnect', () => {
  it('returns false for logged-out', () => {
    expect(shouldReconnect('logged-out')).toBe(false)
  })

  it('returns false for forbidden', () => {
    expect(shouldReconnect('forbidden')).toBe(false)
  })

  it('returns true for bad-session', () => {
    expect(shouldReconnect('bad-session')).toBe(true)
  })

  it('returns true for unavailable-service', () => {
    expect(shouldReconnect('unavailable-service')).toBe(true)
  })

  it('returns true for unknown', () => {
    expect(shouldReconnect('unknown')).toBe(true)
  })

  it('composes as !isFatalDisconnect', () => {
    const reasons = [
      'logged-out',
      'connection-replaced',
      'forbidden',
      'restart-required',
      'bad-session',
      'connection-closed',
      'connection-lost',
      'multi-device-mismatch',
      'unavailable-service',
      'unknown',
    ] as const
    for (const r of reasons) {
      expect(shouldReconnect(r)).toBe(!isFatalDisconnect(r))
    }
  })
})
