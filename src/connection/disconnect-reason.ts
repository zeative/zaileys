import { DisconnectReason as BaileysDisconnectReason } from 'baileys'

/** Domain-level disconnect reason normalized from Baileys integer enum. */
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
  | 'unknown'

/**
 * Translate a Baileys numeric disconnect code into a domain reason.
 * Returns `'unknown'` for `undefined` or unrecognised codes. Collapses
 * Baileys' 408 collision (`connectionLost` and `timedOut`) to
 * `'connection-lost'` uniformly.
 */
export function mapDisconnectReason(code: number | undefined): DisconnectReasonDomain {
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

/** Reasons where reconnect MUST NOT be attempted. */
export function isFatalDisconnect(reason: DisconnectReasonDomain): boolean {
  return reason === 'logged-out' || reason === 'connection-replaced' || reason === 'forbidden'
}

/** Reasons that require wiping persisted auth state. */
export function shouldClearAuth(reason: DisconnectReasonDomain): boolean {
  return (
    reason === 'logged-out' ||
    reason === 'connection-replaced' ||
    reason === 'forbidden' ||
    reason === 'bad-session'
  )
}

/** Inverse of {@link isFatalDisconnect}; convenience for reconnect strategy. */
export function shouldReconnect(reason: DisconnectReasonDomain): boolean {
  return !isFatalDisconnect(reason)
}
