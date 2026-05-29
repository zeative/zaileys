import { describe, expect, expectTypeOf, it } from 'vitest'
import { ZaileysBuilderError } from '../../src/builder/errors.js'
import type { BuilderErrorCode } from '../../src/builder/errors.js'

describe('ZaileysBuilderError', () => {
  it('is an instance of Error', () => {
    const err = new ZaileysBuilderError('MEDIA_LOAD_FAILED', 'fetch http 500')
    expect(err).toBeInstanceOf(Error)
    expect(err).toBeInstanceOf(ZaileysBuilderError)
  })

  it('preserves the code', () => {
    const err = new ZaileysBuilderError('INVALID_RECIPIENT', 'bad jid')
    expect(err.code).toBe('INVALID_RECIPIENT')
  })

  it('preserves the name', () => {
    const err = new ZaileysBuilderError('EMPTY_CONTENT', 'no content')
    expect(err.name).toBe('ZaileysBuilderError')
  })

  it('preserves the message', () => {
    const err = new ZaileysBuilderError('SEND_FAILED', 'socket rejected')
    expect(err.message).toBe('socket rejected')
  })

  it('stores cause when provided', () => {
    const underlying = new Error('ECONNRESET')
    const err = new ZaileysBuilderError('MEDIA_LOAD_FAILED', 'fetch failed', { cause: underlying })
    expect(err.cause).toBe(underlying)
  })

  it('leaves cause undefined when omitted', () => {
    const err = new ZaileysBuilderError('INVALID_OPTIONS', 'bad opts')
    expect(err.cause).toBeUndefined()
  })

  it('instanceof works when thrown and caught', () => {
    const run = () => {
      throw new ZaileysBuilderError('USERNAME_NOT_FOUND', 'alice')
    }
    try {
      run()
      expect.unreachable('should have thrown')
    } catch (e) {
      expect(e).toBeInstanceOf(ZaileysBuilderError)
      expect((e as ZaileysBuilderError).code).toBe('USERNAME_NOT_FOUND')
    }
  })

  it('supports MESSAGE_NOT_FOUND code', () => {
    const err = new ZaileysBuilderError('MESSAGE_NOT_FOUND', 'no source key')
    expect(err.code).toBe('MESSAGE_NOT_FOUND')
  })

  it('BuilderErrorCode union is exhaustive', () => {
    const codes: BuilderErrorCode[] = [
      'MEDIA_LOAD_FAILED',
      'INVALID_RECIPIENT',
      'USERNAME_NOT_FOUND',
      'EMPTY_CONTENT',
      'INVALID_OPTIONS',
      'SEND_FAILED',
      'MESSAGE_NOT_FOUND',
    ]
    expect(codes).toHaveLength(7)
  })

  it('code field is typed as BuilderErrorCode', () => {
    expectTypeOf<ZaileysBuilderError['code']>().toEqualTypeOf<BuilderErrorCode>()
  })
})
