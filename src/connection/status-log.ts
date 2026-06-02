import type { DisconnectReasonDomain } from './disconnect-reason.js'

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

let noiseFilterInstalled = false

const LIBSIGNAL_NOISE: readonly string[] = [
  'Closing session:',
  'Closing open session',
  'Closing stale open session',
  'Opening session:',
  'Removing old closed session',
  'Migrating session to:',
  'Session already closed',
  'Decrypted message with closed session',
  'Failed to decrypt message with any known session',
  'Session error:',
]

const isLibsignalNoise = (args: unknown[]): boolean =>
  typeof args[0] === 'string' && LIBSIGNAL_NOISE.some((p) => (args[0] as string).startsWith(p))

export function suppressLibsignalNoise(): void {
  if (noiseFilterInstalled) return
  noiseFilterInstalled = true
  const patch = (method: 'info' | 'warn' | 'error'): void => {
    const original = console[method].bind(console)
    console[method] = (...args: unknown[]): void => {
      if (isLibsignalNoise(args)) return
      original(...args)
    }
  }
  patch('info')
  patch('warn')
  patch('error')
}
