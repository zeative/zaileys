import type { UserFacingSocketConfig, WASocket } from 'baileys'
import type { AuthStoreBundle } from '../auth/types.js'
import type { OperationGuardOptions } from '../automation/operation-guard.js'
import type { PresenceThrottleOptions } from '../automation/presence.js'
import type { AuthGuardOptions } from '../connection/auth-guard.js'
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
  /** Fixed backoff applied when the disconnect reason is `rate-limited` (429). Default `300000`. */
  rateLimitedDelayMs?: number
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
  /** Bounds QR/pairing regeneration to avoid spam restriction. ON by default; `{ enabled: false }` to opt out. */
  authGuard?: AuthGuardOptions
  /** Spaces out sensitive group/community/newsletter operations. ON by default; `{ enabled: false }` to opt out. */
  operationGuard?: OperationGuardOptions
  /** Drops duplicate presence (typing/recording/online) updates within a window. ON by default. */
  presence?: PresenceThrottleOptions
  /** Max scheduled messages dispatched per second, smoothing backlog bursts. Default `1`; `0` disables. */
  scheduleRateLimitPerSec?: number
}

export type ConnectionEventMap = {
  connect: { sessionId: string; me: { id: string; lid?: string; name?: string } }
  disconnect: { sessionId: string; reason: DisconnectReasonDomain; willReconnect: boolean }
  qr: { sessionId: string; qrString: string; expiresAt: number }
  'pairing-code': { sessionId: string; code: string; expiresAt: number }
  reconnecting: { sessionId: string; attempt: number; delayMs: number; reason: DisconnectReasonDomain }
  'auth-exhausted': { sessionId: string; kind: ConnectionAuthType; attempts: number; max: number }
  error: { sessionId: string; error: Error }
}

export type ConnectionEventName = keyof ConnectionEventMap

export type ConnectionEventHandler<E extends ConnectionEventName> = (payload: ConnectionEventMap[E]) => void

export type ClientEventMap = ConnectionEventMap & InboundEventMap

export type ClientEventName = keyof ClientEventMap

export type BaileysSocket = WASocket
