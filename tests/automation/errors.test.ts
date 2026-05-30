import { describe, expect, expectTypeOf, it } from 'vitest'
import { ZaileysAutomationError, type AutomationErrorCode } from '../../src/automation/errors.js'
import type { BroadcastResult } from '../../src/automation/types.js'

describe('ZaileysAutomationError', () => {
  it('is an instance of Error', () => {
    const err = new ZaileysAutomationError('NOT_CONNECTED', 'x')
    expect(err).toBeInstanceOf(Error)
  })

  it('is an instance of ZaileysAutomationError', () => {
    const err = new ZaileysAutomationError('RATE_LIMIT_INVALID', 'bad')
    expect(err).toBeInstanceOf(ZaileysAutomationError)
  })

  it('preserves the code', () => {
    const err = new ZaileysAutomationError('TASK_FAILED', 'gone')
    expect(err.code).toBe('TASK_FAILED')
  })

  it('preserves the message', () => {
    const err = new ZaileysAutomationError('SCHEDULE_INVALID', 'boom')
    expect(err.message).toBe('boom')
  })

  it('sets the name to ZaileysAutomationError', () => {
    const err = new ZaileysAutomationError('STORE_UNAVAILABLE', 'bad')
    expect(err.name).toBe('ZaileysAutomationError')
  })

  it('stores the cause when passed', () => {
    const root = new Error('root')
    const err = new ZaileysAutomationError('TASK_FAILED', 'wrap', { cause: root })
    expect(err.cause).toBe(root)
  })

  it('leaves cause undefined when not passed', () => {
    const err = new ZaileysAutomationError('PRESENCE_FAILED', 'x')
    expect(err.cause).toBeUndefined()
  })

  it('can be caught and narrowed by instanceof', () => {
    const throwing = (): never => {
      throw new ZaileysAutomationError('RATE_LIMIT_INVALID', 'nope')
    }
    try {
      throwing()
      expect.unreachable()
    } catch (e) {
      expect(e).toBeInstanceOf(ZaileysAutomationError)
      if (e instanceof ZaileysAutomationError) {
        expect(e.code).toBe('RATE_LIMIT_INVALID')
      }
    }
  })

  it('accepts all six automation error codes', () => {
    const codes: AutomationErrorCode[] = [
      'NOT_CONNECTED',
      'RATE_LIMIT_INVALID',
      'TASK_FAILED',
      'SCHEDULE_INVALID',
      'STORE_UNAVAILABLE',
      'PRESENCE_FAILED',
    ]
    for (const code of codes) {
      expect(new ZaileysAutomationError(code, 'm').code).toBe(code)
    }
  })

  it('exposes a readonly code typed as AutomationErrorCode', () => {
    const err = new ZaileysAutomationError('NOT_CONNECTED', 'x')
    expectTypeOf(err.code).toEqualTypeOf<AutomationErrorCode>()
  })

  it('types BroadcastResult.failed entries with an Error error', () => {
    expectTypeOf<BroadcastResult['failed'][number]['error']>().toEqualTypeOf<Error>()
    expectTypeOf<BroadcastResult['sent']>().toEqualTypeOf<string[]>()
  })
})
