import { describe, expect, it, vi } from 'vitest'
import {
  createPairingFlow,
  normalizePhoneNumber,
  validateE164,
} from '../../src/connection/pairing-flow.js'

describe('validateE164', () => {
  it('accepts +CC format and returns digits-only', () => {
    expect(validateE164('+628123456789')).toBe('628123456789')
  })

  it('accepts already-normalized digits-only', () => {
    expect(validateE164('628123456789')).toBe('628123456789')
  })

  it('strips spaces, hyphens, and parentheses', () => {
    expect(validateE164('+62 812-3456-7890')).toBe('6281234567890')
  })

  it('rejects too-short phone', () => {
    expect(() => validateE164('081234')).toThrow('E.164')
  })

  it('rejects non-numeric after strip', () => {
    expect(() => validateE164('+1-555-CALL')).toThrow('E.164')
  })

  it('rejects empty string', () => {
    expect(() => validateE164('')).toThrow('phoneNumber is required')
  })
})

describe('normalizePhoneNumber', () => {
  it('is idempotent on already-normalized input', () => {
    expect(normalizePhoneNumber('628123456789')).toBe('628123456789')
  })

  it('strips formatting characters', () => {
    expect(normalizePhoneNumber('+62 (812) 3456-7890')).toBe('6281234567890')
  })

  it('preserves leading country digit', () => {
    expect(normalizePhoneNumber('+1234567890')).toBe('1234567890')
  })
})

describe('createPairingFlow construction', () => {
  it('returns a flow with normalized phoneNumber for valid input', () => {
    const flow = createPairingFlow({ phoneNumber: '+628123456789' })
    expect(flow.phoneNumber).toBe('628123456789')
  })

  it('throws when phoneNumber is missing', () => {
    expect(() => createPairingFlow({ phoneNumber: '' })).toThrow('phoneNumber is required')
  })
})

describe('createPairingFlow.requestCode — happy path', () => {
  it('returns code from socket with expiresAt ~now+60_000', async () => {
    const flow = createPairingFlow({ phoneNumber: '+628123456789' })
    const socket = { requestPairingCode: vi.fn(async () => 'ABC123XY') }
    const before = Date.now()
    const result = await flow.requestCode(socket)
    const after = Date.now()
    expect(result.code).toBe('ABC123XY')
    expect(result.expiresAt).toBeGreaterThanOrEqual(before + 59_000)
    expect(result.expiresAt).toBeLessThanOrEqual(after + 61_000)
  })

  it('passes normalized phone number to socket (not raw)', async () => {
    const flow = createPairingFlow({ phoneNumber: '+62 812-3456-7890' })
    const socket = { requestPairingCode: vi.fn(async () => 'XYZ999') }
    await flow.requestCode(socket)
    expect(socket.requestPairingCode).toHaveBeenCalledWith('6281234567890')
  })

  it('honors custom ttlMs override', async () => {
    const flow = createPairingFlow({ phoneNumber: '628123456789', ttlMs: 120_000 })
    const socket = { requestPairingCode: vi.fn(async () => 'OK1234') }
    const before = Date.now()
    const result = await flow.requestCode(socket)
    const after = Date.now()
    expect(result.expiresAt).toBeGreaterThanOrEqual(before + 119_000)
    expect(result.expiresAt).toBeLessThanOrEqual(after + 121_000)
  })

  it('emits fresh expiresAt on each call', async () => {
    const flow = createPairingFlow({ phoneNumber: '628123456789' })
    const socket = { requestPairingCode: vi.fn(async () => 'CODE12') }
    const a = await flow.requestCode(socket)
    await new Promise((r) => setTimeout(r, 5))
    const b = await flow.requestCode(socket)
    expect(b.expiresAt).toBeGreaterThan(a.expiresAt)
  })
})

describe('createPairingFlow.requestCode — error path', () => {
  it('re-throws socket errors with prefixed context message', async () => {
    const flow = createPairingFlow({ phoneNumber: '628123456789' })
    const socket = {
      requestPairingCode: vi.fn(async () => {
        throw new Error('boom')
      }),
    }
    await expect(flow.requestCode(socket)).rejects.toThrow(/failed to request pairing code.*boom/)
  })

  it('handles non-Error throw values gracefully', async () => {
    const flow = createPairingFlow({ phoneNumber: '628123456789' })
    const socket = {
      requestPairingCode: vi.fn(async () => {
        throw 'string-error'
      }),
    }
    await expect(flow.requestCode(socket)).rejects.toThrow(/failed to request pairing code/)
  })
})

describe('exposed contract shape', () => {
  it('flow exposes readonly phoneNumber + requestCode', () => {
    const flow = createPairingFlow({ phoneNumber: '628123456789' })
    expect(flow.phoneNumber).toBe('628123456789')
    expect(typeof flow.requestCode).toBe('function')
  })

  it('requestCode returns object with code + expiresAt keys only', async () => {
    const flow = createPairingFlow({ phoneNumber: '628123456789' })
    const socket = { requestPairingCode: vi.fn(async () => 'AAA111') }
    const result = await flow.requestCode(socket)
    expect(Object.keys(result).sort()).toEqual(['code', 'expiresAt'])
  })
})
