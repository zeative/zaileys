import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Logger } from '../../src/client/types.js'
import { adoptLogger, createLogger } from '../../src/utils/logger.js'

const originalDebug = process.env.ZAILEYS_DEBUG

beforeEach(() => {
  delete process.env.ZAILEYS_DEBUG
})

afterEach(() => {
  if (originalDebug === undefined) {
    delete process.env.ZAILEYS_DEBUG
  } else {
    process.env.ZAILEYS_DEBUG = originalDebug
  }
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
})

describe('createLogger — default level', () => {
  it('defaults to silent when ZAILEYS_DEBUG unset', () => {
    const logger = createLogger()
    expect(logger.level).toBe('silent')
  })

  it('uses info level when ZAILEYS_DEBUG=1', () => {
    vi.stubEnv('ZAILEYS_DEBUG', '1')
    const logger = createLogger()
    expect(logger.level).toBe('info')
  })

  it('stays silent when ZAILEYS_DEBUG=0', () => {
    vi.stubEnv('ZAILEYS_DEBUG', '0')
    const logger = createLogger()
    expect(logger.level).toBe('silent')
  })

  it('stays silent when ZAILEYS_DEBUG is arbitrary string', () => {
    vi.stubEnv('ZAILEYS_DEBUG', 'true')
    const logger = createLogger()
    expect(logger.level).toBe('silent')
  })
})

describe('createLogger — explicit level', () => {
  it('respects explicit debug level', () => {
    const logger = createLogger({ level: 'debug' })
    expect(logger.level).toBe('debug')
  })

  it('explicit level overrides ZAILEYS_DEBUG env', () => {
    vi.stubEnv('ZAILEYS_DEBUG', '1')
    const logger = createLogger({ level: 'warn' })
    expect(logger.level).toBe('warn')
  })

  it('accepts every supported pino level', () => {
    for (const level of ['silent', 'fatal', 'error', 'warn', 'info', 'debug', 'trace'] as const) {
      const logger = createLogger({ level })
      expect(logger.level).toBe(level)
    }
  })
})

describe('createLogger — method surface', () => {
  it('exposes debug/info/warn/error/fatal as callables', () => {
    const logger = createLogger()
    expect(typeof logger.debug).toBe('function')
    expect(typeof logger.info).toBe('function')
    expect(typeof logger.warn).toBe('function')
    expect(typeof logger.error).toBe('function')
    expect(typeof logger.fatal).toBe('function')
  })

  it('does not throw when invoking any method on silent default', () => {
    const logger = createLogger()
    expect(() => logger.debug('msg')).not.toThrow()
    expect(() => logger.info({ foo: 1 }, 'msg')).not.toThrow()
    expect(() => logger.warn('msg')).not.toThrow()
    expect(() => logger.error(new Error('boom'), 'msg')).not.toThrow()
    expect(() => logger.fatal('msg')).not.toThrow()
  })

  it('returns object satisfying structural Logger interface', () => {
    const logger: Logger = createLogger()
    expect(logger).toBeDefined()
  })
})

describe('createLogger — sessionId child binding', () => {
  it('produces a child logger when sessionId provided', () => {
    const logger = createLogger({ sessionId: 'foo', level: 'info' })
    expect(logger.bindings()).toMatchObject({ sessionId: 'foo' })
  })

  it('omits sessionId binding when not provided', () => {
    const logger = createLogger({ level: 'info' })
    expect(logger.bindings().sessionId).toBeUndefined()
  })

  it('keeps two sessionId children isolated', () => {
    const a = createLogger({ sessionId: 'a', level: 'info' })
    const b = createLogger({ sessionId: 'b', level: 'info' })
    expect(a.bindings()).toMatchObject({ sessionId: 'a' })
    expect(b.bindings()).toMatchObject({ sessionId: 'b' })
    expect(a).not.toBe(b)
  })
})

describe('adoptLogger', () => {
  it('returns fallback when input is undefined', () => {
    const logger = adoptLogger(undefined)
    expect(typeof logger.info).toBe('function')
    expect(() => logger.info('x')).not.toThrow()
  })

  it('returns the same instance when all five methods are present', () => {
    const custom: Logger = {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      fatal: vi.fn(),
    }
    const adopted = adoptLogger(custom)
    expect(adopted).toBe(custom)
  })

  it('wraps partial logger and no-ops missing methods', () => {
    const info = vi.fn()
    const partial = { info } as unknown as Logger
    const adopted = adoptLogger(partial)
    adopted.info('hello')
    expect(info).toHaveBeenCalledWith('hello')
    expect(() => adopted.debug('x')).not.toThrow()
    expect(() => adopted.warn('x')).not.toThrow()
    expect(() => adopted.error('x')).not.toThrow()
    expect(() => adopted.fatal('x')).not.toThrow()
  })

  it('uses provided fallback when input undefined', () => {
    const fallback: Logger = {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      fatal: vi.fn(),
    }
    const adopted = adoptLogger(undefined, fallback)
    expect(adopted).toBe(fallback)
  })

  it('delegates calls on wrapped partial logger to existing method', () => {
    const warn = vi.fn()
    const partial = { warn } as unknown as Logger
    const adopted = adoptLogger(partial)
    adopted.warn({ code: 1 }, 'careful')
    expect(warn).toHaveBeenCalledWith({ code: 1 }, 'careful')
  })
})

describe('createLogger — multi-instance isolation', () => {
  it('two default loggers are independent instances', () => {
    const a = createLogger()
    const b = createLogger()
    expect(a).not.toBe(b)
  })

  it('changing one logger level does not affect another', () => {
    const a = createLogger({ level: 'debug' })
    const b = createLogger({ level: 'silent' })
    expect(a.level).toBe('debug')
    expect(b.level).toBe('silent')
  })
})
