import { DisconnectReason as BaileysDisconnectReason } from 'baileys'

export type DisconnectReasonDomain =
  | 'logged-out'
  | 'connection-replaced'
  | 'forbidden'
  | 'restart-required'
  | 'bad-session'
  | 'connection-closed'
  | 'connection-lost'
  | 'multi-device-mismatch'
  | 'unavailable-service'
  | 'rate-limited'
  | 'unknown'

const RATE_LIMIT_STATUS = 429

export function mapDisconnectReason(code: number | undefined): DisconnectReasonDomain {
  if (code === RATE_LIMIT_STATUS) return 'rate-limited'
  switch (code) {
    case BaileysDisconnectReason.loggedOut:
      return 'logged-out'
    case BaileysDisconnectReason.forbidden:
      return 'forbidden'
    case BaileysDisconnectReason.connectionLost:
      return 'connection-lost'
    case BaileysDisconnectReason.multideviceMismatch:
      return 'multi-device-mismatch'
    case BaileysDisconnectReason.connectionClosed:
      return 'connection-closed'
    case BaileysDisconnectReason.connectionReplaced:
      return 'connection-replaced'
    case BaileysDisconnectReason.badSession:
      return 'bad-session'
    case BaileysDisconnectReason.unavailableService:
      return 'unavailable-service'
    case BaileysDisconnectReason.restartRequired:
      return 'restart-required'
    default:
      return 'unknown'
  }
}

export function isFatalDisconnect(reason: DisconnectReasonDomain): boolean {
  return reason === 'logged-out' || reason === 'connection-replaced' || reason === 'forbidden'
}

export function isRateLimited(reason: DisconnectReasonDomain): boolean {
  return reason === 'rate-limited'
}

/**
 * Reasons allowed to erase stored credentials. Deliberately just `logged-out`: baileys defaults an
 * unknown stream error and an unrecognised WS error to 500 (`bad-session`), and 440
 * (`connection-replaced`) means the creds are valid and in use elsewhere — erasing on either
 * destroys a working session over ordinary network noise.
 */
export const DEFAULT_CLEAR_AUTH_REASONS: readonly DisconnectReasonDomain[] = Object.freeze([
  'logged-out',
])

export function shouldClearAuth(
  reason: DisconnectReasonDomain,
  allowed: readonly DisconnectReasonDomain[] = DEFAULT_CLEAR_AUTH_REASONS,
): boolean {
  return allowed.includes(reason)
}

export function shouldReconnect(reason: DisconnectReasonDomain): boolean {
  return !isFatalDisconnect(reason)
}
