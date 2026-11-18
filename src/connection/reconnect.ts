import type { ReconnectOptions } from '../client/types.js'
import { clampTimerDelay } from '../utils/timer.js'
import { ZaileysConnectionError } from './errors.js'
import { isFatalDisconnect, isRateLimited, type DisconnectReasonDomain } from './disconnect-reason.js'

export interface ReconnectDecision {
  attempt: number
  delayMs: number
}

export interface ReconnectStrategy {
  next(reason: DisconnectReasonDomain): ReconnectDecision | null
  reset(): void
  readonly attempts: number
}

export interface ReconnectStrategyDeps {
  random?: () => number
}

const DEFAULTS = {
  enabled: true,
  maxAttempts: Number.POSITIVE_INFINITY,
  initialDelayMs: 3000,
  maxDelayMs: 60000,
  jitterFactor: 0.2,
  rateLimitedDelayMs: 300000,
} as const

const assertDelayMs = (name: string, value: number): number => {
  if (!Number.isFinite(value) || value < 0) {
    throw new ZaileysConnectionError(
      'INVALID_OPTIONS',
      `reconnect.${name} must be a finite number of milliseconds >= 0, got ${String(value)}`,
    )
  }
  return value
}

const assertJitterFactor = (value: number): number => {
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    throw new ZaileysConnectionError(
      'INVALID_OPTIONS',
      `reconnect.jitterFactor must be a number from 0 to 1, got ${String(value)}`,
    )
  }
  return value
}

/** Throws INVALID_OPTIONS naming the option when a delay is negative or non-finite or jitterFactor is outside 0-1. */
export function createReconnectStrategy(
  options?: ReconnectOptions,
  deps?: ReconnectStrategyDeps,
): ReconnectStrategy {
  const enabled = options?.enabled ?? DEFAULTS.enabled
  const maxAttempts = options?.maxAttempts ?? DEFAULTS.maxAttempts
  const initialDelayMs = assertDelayMs('initialDelayMs', options?.initialDelayMs ?? DEFAULTS.initialDelayMs)
  const maxDelayMs = clampTimerDelay(assertDelayMs('maxDelayMs', options?.maxDelayMs ?? DEFAULTS.maxDelayMs))
  const jitterFactor = assertJitterFactor(options?.jitterFactor ?? DEFAULTS.jitterFactor)
  const rateLimitedDelayMs = clampTimerDelay(
    assertDelayMs('rateLimitedDelayMs', options?.rateLimitedDelayMs ?? DEFAULTS.rateLimitedDelayMs),
  )
  const random = deps?.random ?? Math.random

  let attempts = 0
  let restartFastPathUsed = false

  const next = (reason: DisconnectReasonDomain): ReconnectDecision | null => {
    if (!enabled) return null
    if (isFatalDisconnect(reason)) return null
    const nextAttempt = attempts + 1
    if (nextAttempt > maxAttempts) return null
    attempts = nextAttempt
    if (isRateLimited(reason)) {
      return { attempt: nextAttempt, delayMs: rateLimitedDelayMs }
    }
    /** WhatsApp sends 515 right after pairing and asks for an immediate restart; a repeat falls back to backoff. */
    if (reason === 'restart-required' && !restartFastPathUsed) {
      restartFastPathUsed = true
      return { attempt: nextAttempt, delayMs: 0 }
    }
    const exponent = Math.pow(2, nextAttempt - 1)
    const base = Math.min(maxDelayMs, initialDelayMs * exponent)
    const jitter = 1 + (random() * 2 - 1) * jitterFactor
    const raw = base * jitter
    const clamped = Math.min(maxDelayMs, clampTimerDelay(raw))
    return { attempt: nextAttempt, delayMs: Math.round(clamped) }
  }

  const reset = (): void => {
    attempts = 0
    restartFastPathUsed = false
  }

  return {
    next,
    reset,
    get attempts(): number {
      return attempts
    },
  }
}
