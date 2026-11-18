import { describe, expect, expectTypeOf, it } from 'vitest'
import { ZaileysConnectionError, type ConnectionErrorCode } from '../../src/connection/errors.js'
import { ZaileysConnectionError as FromBarrel } from '../../src/index.js'

describe('ZaileysConnectionError', () => {
  it('is an instance of Error', () => {
    const err = new ZaileysConnectionError('INVALID_OPTIONS', 'x')
    expect(err).toBeInstanceOf(Error)
  })

  it('is an instance of ZaileysConnectionError', () => {
    const err = new ZaileysConnectionError('CONNECT_ABORTED', 'bad')
    expect(err).toBeInstanceOf(ZaileysConnectionError)
  })

  it('preserves the code', () => {
    const err = new ZaileysConnectionError('CONNECTION_CLOSED', 'gone')
    expect(err.code).toBe('CONNECTION_CLOSED')
  })

  it('preserves the message', () => {
    const err = new ZaileysConnectionError('INVALID_STATE', 'boom')
    expect(err.message).toBe('boom')
  })

  it('sets the name to ZaileysConnectionError', () => {
    const err = new ZaileysConnectionError('SESSION_PROTECTED', 'bad')
    expect(err.name).toBe('ZaileysConnectionError')
  })

  it('stores the cause when passed', () => {
    const root = new Error('root')
    const err = new ZaileysConnectionError('CREDS_READ_FAILED', 'wrap', { cause: root })
    expect(err.cause).toBe(root)
  })

  it('leaves cause undefined when not passed', () => {
    const err = new ZaileysConnectionError('PAIRING_FAILED', 'x')
    expect(err.cause).toBeUndefined()
  })

  it('can be caught and narrowed by instanceof', () => {
    const throwing = (): never => {
      throw new ZaileysConnectionError('STORE_NOT_REOPENABLE', 'nope')
    }
    try {
      throwing()
      expect.unreachable()
    } catch (e) {
      expect(e).toBeInstanceOf(ZaileysConnectionError)
      if (e instanceof ZaileysConnectionError) {
        expect(e.code).toBe('STORE_NOT_REOPENABLE')
      }
    }
  })

  it('accepts all eight connection error codes', () => {
    const codes: ConnectionErrorCode[] = [
      'INVALID_OPTIONS',
      'CREDS_READ_FAILED',
      'CONNECT_ABORTED',
      'CONNECTION_CLOSED',
      'SESSION_PROTECTED',
      'STORE_NOT_REOPENABLE',
      'PAIRING_FAILED',
      'INVALID_STATE',
    ]
    for (const code of codes) {
      expect(new ZaileysConnectionError(code, 'm').code).toBe(code)
    }
  })

  it('exposes a readonly code typed as ConnectionErrorCode', () => {
    const err = new ZaileysConnectionError('INVALID_OPTIONS', 'x')
    expectTypeOf(err.code).toEqualTypeOf<ConnectionErrorCode>()
  })

  it('is exported from the package entry', () => {
    expect(FromBarrel).toBe(ZaileysConnectionError)
  })
})
