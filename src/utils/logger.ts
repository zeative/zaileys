import pino, { type Logger as PinoLogger } from 'pino'
import type { Logger } from '../client/types.js'

export type LoggerLevel = 'silent' | 'fatal' | 'error' | 'warn' | 'info' | 'debug' | 'trace'

export interface CreateLoggerOptions {
  sessionId?: string
  level?: LoggerLevel
}

export type ZaileysLogger = PinoLogger

const LOG_LEVELS: readonly LoggerLevel[] = [
  'silent',
  'fatal',
  'error',
  'warn',
  'info',
  'debug',
  'trace',
]

function resolveLevel(explicit?: LoggerLevel): LoggerLevel {
  if (explicit) return explicit
  const env = process.env['ZAILEYS_DEBUG']
  if (env === undefined) return 'silent'
  if (env === '1') return 'info'
  if ((LOG_LEVELS as readonly string[]).includes(env)) return env as LoggerLevel
  return 'silent'
}

export function createLogger(options: CreateLoggerOptions = {}): ZaileysLogger {
  const level = resolveLevel(options.level)
  const base = pino({ level })
  if (options.sessionId !== undefined) {
    return base.child({ sessionId: options.sessionId })
  }
  return base
}

const LOGGER_METHODS = ['debug', 'info', 'warn', 'error', 'fatal'] as const

function hasAllLoggerMethods(value: unknown): value is Logger {
  if (value === null || typeof value !== 'object') return false
  for (const method of LOGGER_METHODS) {
    if (typeof (value as Record<string, unknown>)[method] !== 'function') return false
  }
  return true
}

function noop(): void {}

function wrapPartial(partial: Partial<Logger>): Logger {
  const wrapped: Logger = {
    debug: noop,
    info: noop,
    warn: noop,
    error: noop,
    fatal: noop,
  }
  for (const method of LOGGER_METHODS) {
    const fn = partial[method]
    if (typeof fn === 'function') {
      wrapped[method] = fn.bind(partial) as Logger[typeof method]
    }
  }
  return wrapped
}

export function adoptLogger(maybe: Logger | Partial<Logger> | undefined, fallback?: Logger): Logger {
  if (maybe === undefined) {
    return fallback ?? createLogger()
  }
  if (hasAllLoggerMethods(maybe)) {
    return maybe
  }
  return wrapPartial(maybe)
}
