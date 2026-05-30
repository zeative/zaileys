import { describe, expect, expectTypeOf, it } from 'vitest'
import { ZaileysCommandError } from '../../src/command/errors.js'
import type { CommandErrorCode } from '../../src/command/errors.js'

describe('ZaileysCommandError', () => {
  it('is an instance of Error', () => {
    const err = new ZaileysCommandError('HANDLER_ERROR', 'handler threw')
    expect(err).toBeInstanceOf(Error)
    expect(err).toBeInstanceOf(ZaileysCommandError)
  })

  it('preserves the code', () => {
    const err = new ZaileysCommandError('DUPLICATE_COMMAND', 'ping registered twice')
    expect(err.code).toBe('DUPLICATE_COMMAND')
  })

  it('preserves the name', () => {
    const err = new ZaileysCommandError('INVALID_COMMAND_NAME', 'bad name')
    expect(err.name).toBe('ZaileysCommandError')
  })

  it('preserves the message', () => {
    const err = new ZaileysCommandError('MIDDLEWARE_ERROR', 'middleware rejected')
    expect(err.message).toBe('middleware rejected')
  })

  it('stores cause when provided', () => {
    const underlying = new Error('boom')
    const err = new ZaileysCommandError('HANDLER_ERROR', 'handler failed', { cause: underlying })
    expect(err.cause).toBe(underlying)
  })

  it('leaves cause undefined when omitted', () => {
    const err = new ZaileysCommandError('NOT_CONNECTED', 'no socket')
    expect(err.cause).toBeUndefined()
  })

  it('instanceof works when thrown and caught', () => {
    const run = () => {
      throw new ZaileysCommandError('NO_SENT_MESSAGE', 'reply resolved without key')
    }
    try {
      run()
      expect.unreachable('should have thrown')
    } catch (e) {
      expect(e).toBeInstanceOf(ZaileysCommandError)
      expect((e as ZaileysCommandError).code).toBe('NO_SENT_MESSAGE')
    }
  })

  it('supports NO_SENT_MESSAGE code', () => {
    const err = new ZaileysCommandError('NO_SENT_MESSAGE', 'no key')
    expect(err.code).toBe('NO_SENT_MESSAGE')
  })

  it('supports HANDLER_ERROR code', () => {
    const err = new ZaileysCommandError('HANDLER_ERROR', 'threw')
    expect(err.code).toBe('HANDLER_ERROR')
  })

  it('CommandErrorCode union is exhaustive', () => {
    const codes: CommandErrorCode[] = [
      'DUPLICATE_COMMAND',
      'INVALID_COMMAND_NAME',
      'HANDLER_ERROR',
      'MIDDLEWARE_ERROR',
      'NO_SENT_MESSAGE',
      'NOT_CONNECTED',
    ]
    expect(codes).toHaveLength(6)
  })

  it('code field is typed as CommandErrorCode', () => {
    expectTypeOf<ZaileysCommandError['code']>().toEqualTypeOf<CommandErrorCode>()
  })
})
