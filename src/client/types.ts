import type { UserFacingSocketConfig, WASocket } from 'baileys'
import type { AuthStoreBundle } from '../auth/types.js'
import type { AutoDeleteOptions } from '../automation/auto-delete.js'
import type { OperationGuardOptions } from '../automation/operation-guard.js'
import type { PresenceThrottleOptions } from '../automation/presence.js'
import type { AuthGuardOptions } from '../connection/auth-guard.js'
import type { DisconnectReasonDomain } from '../connection/disconnect-reason.js'
import type { CitationConfig } from '../events/context.js'
import type { InboundEventMap } from '../events/types.js'
import type { MessageStore } from '../store/types.js'
import type { PluginsOptions } from '../plugin/types.js'
import type { CloudOptions } from '../cloud/types.js'
import type {
  CloudFlowResponseEvent,
  CloudOrderEvent,
  CloudStatusEvent,
  CloudTemplateStatusEvent,
} from '../cloud/translate/inbound.js'

export type ProviderKind = 'baileys' | 'cloud'

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
  /** Message transport: baileys (WhatsApp Web, default) or the official Meta Cloud API. */
  provider?: ProviderKind
  /** Cloud API credentials/config — required when `provider: 'cloud'`. */
  cloud?: CloudOptions
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
  /** Periodically prune old messages from the store. Enabled by default with a 1-month `maxAgeMs`; pass `false` to disable or override any field. */
  autoDelete?: AutoDeleteOptions | false
  /** Load and manage plugins from a directory. */
  plugins?: PluginsOptions
}

export type ConnectionEventMap = {
  connect: { sessionId: string; me: { id: string; lid?: string; name?: string } }
  disconnect: { sessionId: string; reason: DisconnectReasonDomain; willReconnect: boolean }
  qr: { sessionId: string; qrString: string; expiresAt: number }
  'pairing-code': { sessionId: string; code: string; expiresAt: number }
  reconnecting: { sessionId: string; attempt: number; delayMs: number; reason: DisconnectReasonDomain }
  'auth-exhausted': { sessionId: string; kind: ConnectionAuthType; attempts: number; max: number }
  error: { sessionId: string; error: Error }
  /** Cloud provider: delivery lifecycle of outbound messages (sent/delivered/read/failed). */
  'message-status': CloudStatusEvent
  /** Cloud provider: template review lifecycle (APPROVED/REJECTED/PAUSED...). */
  'template-status': CloudTemplateStatusEvent
  /** Cloud provider: WhatsApp Flow completion (nfm_reply) with parsed response payload. */
  'flow-response': CloudFlowResponseEvent
  /** Cloud provider: catalog order placed by the customer. */
  order: CloudOrderEvent
}

export type ConnectionEventName = keyof ConnectionEventMap

export type ConnectionEventHandler<E extends ConnectionEventName> = (payload: ConnectionEventMap[E]) => void

export type ClientEventMap = ConnectionEventMap & InboundEventMap

export type ClientEventName = keyof ClientEventMap

export type BaileysSocket = WASocket
