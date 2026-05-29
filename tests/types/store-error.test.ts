import { describe, expect, it } from 'vitest'
import { ZaileysStoreError } from '../../src/types/store-error.js'

describe('ZaileysStoreError', () => {
  it('is an Error instance with code and message', () => {
    const err = new ZaileysStoreError('STORE_NOT_AVAILABLE', 'foo')
    expect(err).toBeInstanceOf(Error)
    expect(err).toBeInstanceOf(ZaileysStoreError)
    expect(err.code).toBe('STORE_NOT_AVAILABLE')
    expect(err.message).toBe('foo')
    expect(err.name).toBe('ZaileysStoreError')
  })

  it('preserves cause when supplied via options', () => {
    const inner = new Error('inner')
    const err = new ZaileysStoreError('STORE_WRITE_FAILED', 'x', { cause: inner })
    expect(err.cause).toBeInstanceOf(Error)
    expect(err.cause).toBe(inner)
  })

  it('supports every StoreErrorCode', () => {
    const codes = [
      'STORE_NOT_AVAILABLE',
      'STORE_CONNECTION_FAILED',
      'STORE_WRITE_FAILED',
      'STORE_READ_FAILED',
      'STORE_CORRUPTED',
      'STORE_CLOSED',
    ] as const
    for (const code of codes) {
      const err = new ZaileysStoreError(code, code)
      expect(err.code).toBe(code)
    }
  })

  it('captures stack trace including class name', () => {
    const err = new ZaileysStoreError('STORE_CLOSED', 'closed')
    expect(typeof err.stack).toBe('string')
    expect(err.stack).toContain('ZaileysStoreError')
  })
})
