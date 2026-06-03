import type { ConnectionAuthType } from '../client/types.js'

/**
 * Bounds QR and pairing-code regeneration across a client's lifetime to avoid
 * tripping WhatsApp's spam/automation restriction. Each reconnect creates a fresh
 * socket which re-emits a QR or requests a new pairing code; without a budget and
 * cooldown this loops unbounded and gets the account restricted.
 */
export interface AuthGuardOptions {
  /** Master switch. When `false` the guard never blocks (legacy behaviour). Default `true`. */
  enabled?: boolean
  /** Total QR codes emitted before the guard stops and signals exhaustion. Default `5`. */
  maxQrAttempts?: number
  /** Total pairing-code requests before the guard stops and signals exhaustion. Default `3`. */
  maxPairingAttempts?: number
  /** Base cooldown between pairing-code requests; escalates per attempt. Default `60000`. */
  pairingCooldownMs?: number
}

export type AuthAttemptBlockReason = 'budget-exhausted' | 'cooldown'

export interface AuthAttemptDecision {
  allowed: boolean
  reason?: AuthAttemptBlockReason
  waitMs: number
  attempts: number
  max: number
}

export interface AuthGuard {
  /** Decide whether a new auth attempt of `kind` is permitted at time `now` (does not mutate). */
  evaluate(kind: ConnectionAuthType, now: number): AuthAttemptDecision
  /** Record that an attempt of `kind` was actually issued at time `now`. */
  record(kind: ConnectionAuthType, now: number): void
  /** Clear all counters and cooldowns (call on a successful connection or manual restart). */
  reset(): void
  readonly enabled: boolean
  readonly qrAttempts: number
  readonly pairingAttempts: number
}

const DEFAULTS = {
  enabled: true,
  maxQrAttempts: 5,
  maxPairingAttempts: 3,
  pairingCooldownMs: 60_000,
} as const

const MAX_PAIRING_COOLDOWN_MS = 300_000

export function createAuthGuard(options: AuthGuardOptions = {}): AuthGuard {
  const enabled = options.enabled ?? DEFAULTS.enabled
  const maxQrAttempts = options.maxQrAttempts ?? DEFAULTS.maxQrAttempts
  const maxPairingAttempts = options.maxPairingAttempts ?? DEFAULTS.maxPairingAttempts
  const baseCooldownMs = options.pairingCooldownMs ?? DEFAULTS.pairingCooldownMs

  let qrAttempts = 0
  let pairingAttempts = 0
  let lastPairingAt = 0

  const requiredCooldown = (priorAttempts: number): number => {
    if (priorAttempts <= 0) return 0
    return Math.min(baseCooldownMs * priorAttempts, MAX_PAIRING_COOLDOWN_MS)
  }

  const evaluate = (kind: ConnectionAuthType, now: number): AuthAttemptDecision => {
    if (!enabled) {
      const attempts = kind === 'pairing' ? pairingAttempts : qrAttempts
      return { allowed: true, waitMs: 0, attempts, max: Number.POSITIVE_INFINITY }
    }
    if (kind === 'pairing') {
      if (pairingAttempts >= maxPairingAttempts) {
        return {
          allowed: false,
          reason: 'budget-exhausted',
          waitMs: 0,
          attempts: pairingAttempts,
          max: maxPairingAttempts,
        }
      }
      const need = requiredCooldown(pairingAttempts)
      const elapsed = now - lastPairingAt
      if (pairingAttempts > 0 && elapsed < need) {
        return {
          allowed: false,
          reason: 'cooldown',
          waitMs: need - elapsed,
          attempts: pairingAttempts,
          max: maxPairingAttempts,
        }
      }
      return { allowed: true, waitMs: 0, attempts: pairingAttempts, max: maxPairingAttempts }
    }
    if (qrAttempts >= maxQrAttempts) {
      return {
        allowed: false,
        reason: 'budget-exhausted',
        waitMs: 0,
        attempts: qrAttempts,
        max: maxQrAttempts,
      }
    }
    return { allowed: true, waitMs: 0, attempts: qrAttempts, max: maxQrAttempts }
  }

  const record = (kind: ConnectionAuthType, now: number): void => {
    if (kind === 'pairing') {
      pairingAttempts += 1
      lastPairingAt = now
    } else {
      qrAttempts += 1
    }
  }

  const reset = (): void => {
    qrAttempts = 0
    pairingAttempts = 0
    lastPairingAt = 0
  }

  return {
    evaluate,
    record,
    reset,
    get enabled(): boolean {
      return enabled
    },
    get qrAttempts(): number {
      return qrAttempts
    },
    get pairingAttempts(): number {
      return pairingAttempts
    },
  }
}
