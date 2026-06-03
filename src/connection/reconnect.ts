import type { ReconnectOptions } from '../client/types.js'
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

export function createReconnectStrategy(
  options?: ReconnectOptions,
  deps?: ReconnectStrategyDeps,
): ReconnectStrategy {
  const enabled = options?.enabled ?? DEFAULTS.enabled
  const maxAttempts = options?.maxAttempts ?? DEFAULTS.maxAttempts
  const initialDelayMs = options?.initialDelayMs ?? DEFAULTS.initialDelayMs
  const maxDelayMs = options?.maxDelayMs ?? DEFAULTS.maxDelayMs
  const jitterFactor = options?.jitterFactor ?? DEFAULTS.jitterFactor
  const rateLimitedDelayMs = options?.rateLimitedDelayMs ?? DEFAULTS.rateLimitedDelayMs
  const random = deps?.random ?? Math.random

  let attempts = 0

  const next = (reason: DisconnectReasonDomain): ReconnectDecision | null => {
    if (!enabled) return null
    if (isFatalDisconnect(reason)) return null
    const nextAttempt = attempts + 1
    if (nextAttempt > maxAttempts) return null
    attempts = nextAttempt
    if (isRateLimited(reason)) {
      return { attempt: nextAttempt, delayMs: rateLimitedDelayMs }
    }
    const exponent = Math.pow(2, nextAttempt - 1)
    const base = Math.min(maxDelayMs, initialDelayMs * exponent)
    const jitter = 1 + (random() * 2 - 1) * jitterFactor
    const raw = base * jitter
    const clamped = Math.min(maxDelayMs, Math.max(0, raw))
    return { attempt: nextAttempt, delayMs: Math.round(clamped) }
  }

  const reset = (): void => {
    attempts = 0
  }

  return {
    next,
    reset,
    get attempts(): number {
      return attempts
    },
  }
}
