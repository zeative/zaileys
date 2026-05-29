import type { ReconnectOptions } from '../client/types.js'
import { isFatalDisconnect, type DisconnectReasonDomain } from './disconnect-reason.js'

/** Decision returned by a {@link ReconnectStrategy} for a single attempt. */
export interface ReconnectDecision {
  attempt: number
  delayMs: number
}

/** Stateful reconnect planner that yields backoff decisions or null when no retry is allowed. */
export interface ReconnectStrategy {
  next(reason: DisconnectReasonDomain): ReconnectDecision | null
  reset(): void
  readonly attempts: number
}

/** Injectable dependencies for deterministic testing. */
export interface ReconnectStrategyDeps {
  random?: () => number
}

const DEFAULTS = {
  enabled: true,
  maxAttempts: Number.POSITIVE_INFINITY,
  initialDelayMs: 1000,
  maxDelayMs: 60000,
  jitterFactor: 0.2,
} as const

/**
 * Create a pure exponential-backoff reconnect strategy.
 *
 * Formula: `base = min(maxDelayMs, initialDelayMs * 2^(attempt - 1))`
 * then `delay = clamp(base * (1 + (random()*2 - 1) * jitterFactor), 0, maxDelayMs)`.
 *
 * Fatal reasons (`logged-out`, `connection-replaced`, `forbidden`) short-circuit
 * to null without incrementing the counter. Disabling the strategy via
 * `enabled: false` also yields null on every call.
 */
export function createReconnectStrategy(
  options?: ReconnectOptions,
  deps?: ReconnectStrategyDeps,
): ReconnectStrategy {
  const enabled = options?.enabled ?? DEFAULTS.enabled
  const maxAttempts = options?.maxAttempts ?? DEFAULTS.maxAttempts
  const initialDelayMs = options?.initialDelayMs ?? DEFAULTS.initialDelayMs
  const maxDelayMs = options?.maxDelayMs ?? DEFAULTS.maxDelayMs
  const jitterFactor = options?.jitterFactor ?? DEFAULTS.jitterFactor
  const random = deps?.random ?? Math.random

  let attempts = 0

  const next = (reason: DisconnectReasonDomain): ReconnectDecision | null => {
    if (!enabled) return null
    if (isFatalDisconnect(reason)) return null
    const nextAttempt = attempts + 1
    if (nextAttempt > maxAttempts) return null
    attempts = nextAttempt
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
