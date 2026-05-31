import type { UserFacingSocketConfig, WASocket } from 'baileys'
import type { AuthStoreBundle } from '../auth/types.js'
import type { DisconnectReasonDomain } from '../connection/disconnect-reason.js'
import type { CitationConfig } from '../events/context.js'
import type { InboundEventMap } from '../events/types.js'
import type { MessageStore } from '../store/types.js'

/** Lifecycle states a Client traverses between idle and disconnected. */
export type ConnectionState =
  | 'idle'
  | 'connecting'
  | 'qr-pending'
  | 'pairing-pending'
  | 'connected'
  | 'reconnecting'
  | 'disconnecting'
  | 'disconnected'

/** Authentication mechanism selected at connect time. */
export type ConnectionAuthType = 'qr' | 'pairing'

/** Structural logger surface matching pino's primary methods. */
export interface Logger {
  debug(...args: unknown[]): void
  info(...args: unknown[]): void
  warn(...args: unknown[]): void
  error(...args: unknown[]): void
  fatal(...args: unknown[]): void
}

/** Reconnect tuning shared by Client and reconnect strategy. */
export interface ReconnectOptions {
  enabled?: boolean
  maxAttempts?: number
  initialDelayMs?: number
  maxDelayMs?: number
  jitterFactor?: number
}

/** User-facing constructor options for the Client class. */
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
  /**
   * Connect automatically after construction. Defaults to `true`, deferred to a
   * microtask so synchronous `on(...)` registrations run before any event fires.
   * Set `false` to drive {@link Client.connect} manually.
   */
  autoConnect?: boolean
  /**
   * Print concise English connection-status lines (connecting, reconnecting,
   * connected, disconnected) plus actionable hints (e.g. corrupted session) to
   * stderr. Defaults to `true`. Set `false` to silence and rely on typed events.
   */
  statusLog?: boolean
  /**
   * Command prefix(es) that activate the command framework (e.g. `'/'` or
   * `['/', '!']`). When unset the command framework is disabled: `command()`
   * and `use()` still register, but no dispatcher attaches and handlers never fire.
   */
  commandPrefix?: string | string[]
  /**
   * Per-client citation access-control config. `authors` is an allowlist of sender
   * JIDs (or predicate) for `citation.authors()`. `banned` is a blocklist for
   * `citation.banned()`. When absent both predicates resolve `false`.
   */
  citation?: CitationConfig
  /**
   * When `true`, inbound message events (`text`, media, `mention`, `mention-all`)
   * are not emitted for messages the connected account sent itself (`isFromMe`),
   * so handlers never see own messages. Defaults to `true`. Set `false` to also
   * receive own (`fromMe`) messages.
   */
  ignoreMe?: boolean
}

/** Typed payload contract for every connection-domain event. */
export type ConnectionEventMap = {
  connect: { sessionId: string; me: { id: string; lid?: string; name?: string } }
  disconnect: { sessionId: string; reason: DisconnectReasonDomain; willReconnect: boolean }
  qr: { sessionId: string; qrString: string; expiresAt: number }
  'pairing-code': { sessionId: string; code: string; expiresAt: number }
  reconnecting: { sessionId: string; attempt: number; delayMs: number; reason: DisconnectReasonDomain }
  error: { sessionId: string; error: Error }
}

/** Discriminator union over keys of ConnectionEventMap. */
export type ConnectionEventName = keyof ConnectionEventMap

/** Handler signature for a specific connection event. */
export type ConnectionEventHandler<E extends ConnectionEventName> = (payload: ConnectionEventMap[E]) => void

/** Full client event surface: connection events plus all decoded inbound events. */
export type ClientEventMap = ConnectionEventMap & InboundEventMap

/** Discriminator union over every client event key. */
export type ClientEventName = keyof ClientEventMap

/** Structural alias for the underlying Baileys socket used as escape hatch. */
export type BaileysSocket = WASocket
