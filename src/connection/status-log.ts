import type { DisconnectReasonDomain } from './disconnect-reason.js'

/** Discriminated lifecycle event rendered as a human-readable English status line. */
export type StatusEvent =
  | { kind: 'connecting'; sessionId: string }
  | { kind: 'qr' }
  | { kind: 'pairing-code'; code: string }
  | { kind: 'connected'; id: string }
  | {
      kind: 'reconnecting'
      attempt: number
      delayMs: number
      reason: DisconnectReasonDomain
      invalidCredsSuspected: boolean
    }
  | { kind: 'disconnect'; reason: DisconnectReasonDomain; willReconnect: boolean }

const PREFIX = '[zaileys]'

const INVALID_CREDS_HINT =
  'The saved session looks invalid or corrupted (connection keeps closing before it authenticates). ' +
  'Delete the auth folder (default: ./.zaileys) and run again to scan a fresh QR / request a new pairing code.'

/**
 * Render a connection lifecycle event into a concise English status line, or
 * `null` when the event needs no line. Pure — no I/O.
 */
export function formatConnectionStatus(event: StatusEvent): string | null {
  switch (event.kind) {
    case 'connecting':
      return `${PREFIX} Connecting to WhatsApp (session: ${event.sessionId})...`
    case 'qr':
      return `${PREFIX} Scan the QR code above with WhatsApp > Linked devices to authenticate.`
    case 'pairing-code':
      return `${PREFIX} Pairing code: ${event.code} — enter it in WhatsApp > Linked devices > Link with phone number.`
    case 'connected':
      return `${PREFIX} Connected as ${event.id}.`
    case 'reconnecting': {
      const seconds = (event.delayMs / 1000).toFixed(1)
      const base = `${PREFIX} Connection lost (${event.reason}). Reconnecting in ${seconds}s (attempt ${event.attempt})...`
      return event.invalidCredsSuspected ? `${base}\n${PREFIX} ${INVALID_CREDS_HINT}` : base
    }
    case 'disconnect':
      return event.willReconnect
        ? null
        : `${PREFIX} Disconnected (${event.reason}).`
    default:
      return null
  }
}
