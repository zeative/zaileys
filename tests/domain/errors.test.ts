import { describe, expect, it } from 'vitest'
import { ZaileysDomainError, type DomainErrorCode } from '../../src/domain/errors.js'

describe('ZaileysDomainError', () => {
  it('is an instance of Error', () => {
    const err = new ZaileysDomainError('NOT_CONNECTED', 'x')
    expect(err).toBeInstanceOf(Error)
  })

  it('is an instance of ZaileysDomainError', () => {
    const err = new ZaileysDomainError('GROUP_NOT_FOUND', 'missing')
    expect(err).toBeInstanceOf(ZaileysDomainError)
  })

  it('preserves the code', () => {
    const err = new ZaileysDomainError('NEWSLETTER_NOT_FOUND', 'gone')
    expect(err.code).toBe('NEWSLETTER_NOT_FOUND')
  })

  it('preserves the message', () => {
    const err = new ZaileysDomainError('OPERATION_FAILED', 'boom')
    expect(err.message).toBe('boom')
  })

  it('sets the name to ZaileysDomainError', () => {
    const err = new ZaileysDomainError('INVALID_PARTICIPANT', 'bad')
    expect(err.name).toBe('ZaileysDomainError')
  })

  it('stores the cause when passed', () => {
    const root = new Error('root')
    const err = new ZaileysDomainError('OPERATION_FAILED', 'wrap', { cause: root })
    expect(err.cause).toBe(root)
  })

  it('leaves cause undefined when not passed', () => {
    const err = new ZaileysDomainError('NOT_CONNECTED', 'x')
    expect(err.cause).toBeUndefined()
  })

  it('can be caught and narrowed by instanceof', () => {
    const throwing = (): never => {
      throw new ZaileysDomainError('GROUP_NOT_FOUND', 'nope')
    }
    try {
      throwing()
      expect.unreachable()
    } catch (e) {
      expect(e).toBeInstanceOf(ZaileysDomainError)
      if (e instanceof ZaileysDomainError) {
        expect(e.code).toBe('GROUP_NOT_FOUND')
      }
    }
  })

  it('accepts all five domain error codes', () => {
    const codes: DomainErrorCode[] = [
      'NOT_CONNECTED',
      'GROUP_NOT_FOUND',
      'NEWSLETTER_NOT_FOUND',
      'INVALID_PARTICIPANT',
      'OPERATION_FAILED',
    ]
    for (const code of codes) {
      expect(new ZaileysDomainError(code, 'm').code).toBe(code)
    }
  })
})
