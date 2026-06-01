import type { UserFacingSocketConfig, WASocket } from 'baileys'
import type { AuthStoreBundle } from '../auth/types.js'
import type { DisconnectReasonDomain } from '../connection/disconnect-reason.js'
import type { CitationConfig } from '../events/context.js'
import type { InboundEventMap } from '../events/types.js'
import type { MessageStore } from '../store/types.js'

export type ConnectionState =
  | 'idle'
  | 'connecting'
  | 'qr-pending'
  | 'pairing-pending'
  | 'connected'
  | 'reconnecting'
  | 'disconnecting'
  | 'disconnected'

export type ConnectionAuthType = 'qr' | 'pairing'

export interface Logger {
  debug(...args: unknown[]): void
  info(...args: unknown[]): void
  warn(...args: unknown[]): void
  error(...args: unknown[]): void
  fatal(...args: unknown[]): void
}

export interface ReconnectOptions {
  enabled?: boolean
  maxAttempts?: number
  initialDelayMs?: number
  maxDelayMs?: number
  jitterFactor?: number
}

export interface ClientOptions {
  sessionId?: string
  auth?: AuthStoreBundle
  store?: MessageStore
  authType?: ConnectionAuthType
  phoneNumber?: string
  logger?: Logger
  cacheSignal?: boolean
  reconnect?: ReconnectOptions
  qrTerminal?: boolean
  baileys?: Partial<UserFacingSocketConfig>
  autoConnect?: boolean
  statusLog?: boolean
  commandPrefix?: string | string[]
  citation?: CitationConfig
  ignoreMe?: boolean
}

export type ConnectionEventMap = {
  connect: { sessionId: string; me: { id: string; lid?: string; name?: string } }
  disconnect: { sessionId: string; reason: DisconnectReasonDomain; willReconnect: boolean }
  qr: { sessionId: string; qrString: string; expiresAt: number }
  'pairing-code': { sessionId: string; code: string; expiresAt: number }
  reconnecting: { sessionId: string; attempt: number; delayMs: number; reason: DisconnectReasonDomain }
  error: { sessionId: string; error: Error }
}

export type ConnectionEventName = keyof ConnectionEventMap

export type ConnectionEventHandler<E extends ConnectionEventName> = (payload: ConnectionEventMap[E]) => void

export type ClientEventMap = ConnectionEventMap & InboundEventMap

export type ClientEventName = keyof ClientEventMap

export type BaileysSocket = WASocket
