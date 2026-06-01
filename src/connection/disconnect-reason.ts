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
  | 'unknown'

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

export function isFatalDisconnect(reason: DisconnectReasonDomain): boolean {
  return reason === 'logged-out' || reason === 'connection-replaced' || reason === 'forbidden'
}

export function shouldClearAuth(reason: DisconnectReasonDomain): boolean {
  return (
    reason === 'logged-out' ||
    reason === 'connection-replaced' ||
    reason === 'forbidden' ||
    reason === 'bad-session'
  )
}

export function shouldReconnect(reason: DisconnectReasonDomain): boolean {
  return !isFatalDisconnect(reason)
}
