import makeWASocket, {
  initAuthCreds,
  type AuthenticationCreds,
  type UserFacingSocketConfig,
  type WAMessageKey,
} from 'baileys'
import {
  deleteMessage,
  EditBuilder,
  forwardMessage,
  isJid,
  MessageBuilder,
  reactToMessage,
  resolveUsername,
  ZaileysBuilderError,
  type BuilderSocketLike,
  type DeleteOptions,
  type UsernameResolveSocketLike,
} from '../builder/index.js'
import {
  CommunityModule,
  GroupModule,
  NewsletterModule,
  PrivacyModule,
  type DomainSocketLike,
} from '../domain/index.js'
import { FileAuthStore } from '../auth/adapters/file.js'
import { makeCacheableAuthStore } from '../auth/cache.js'
import type { AuthStoreBundle } from '../auth/types.js'
import { signalKeyStoreFromAuthStore } from '../connection/auth-adapter.js'
import {
  isFatalDisconnect,
  mapDisconnectReason,
  shouldClearAuth,
  type DisconnectReasonDomain,
} from '../connection/disconnect-reason.js'
import { createPairingFlow } from '../connection/pairing-flow.js'
import { printQrToTerminal } from '../connection/qr-terminal.js'
import { createReconnectStrategy, type ReconnectStrategy } from '../connection/reconnect.js'
import {
  createConnectionStateMachine,
  type ConnectionStateMachine,
} from '../connection/state-machine.js'
import type { BaileysSocketLike, MessageStore } from '../store/types.js'
import { MemoryMessageStore } from '../store/adapters/memory.js'
import { adoptLogger } from '../utils/logger.js'
import {
  attachInboundPipeline,
  type InboundPipelineHandle,
  type PipelineSocketLike,
} from '../events/pipeline.js'
import { TypedEventEmitter } from './event-emitter.js'
import type {
  BaileysSocket,
  ClientEventMap,
  ClientOptions,
  ConnectionAuthType,
  ConnectionEventMap,
  ConnectionState,
  Logger,
  ReconnectOptions,
} from './types.js'

const DEFAULT_SESSION_ID = 'default'
const DEFAULT_AUTH_TYPE: ConnectionAuthType = 'qr'
const QR_DEFAULT_TTL_MS = 60_000

interface SocketCleanup {
  off: () => void
}

interface ConnectionUpdate {
  connection?: 'open' | 'connecting' | 'close'
  lastDisconnect?: { error?: unknown; date?: Date }
  qr?: string
  isNewLogin?: boolean
}

/**
 * High-level WhatsApp client composing auth, store, reconnect, QR/pairing, and
 * the underlying Baileys socket behind a single typed surface.
 */
export class Client extends TypedEventEmitter<ClientEventMap> {
  readonly sessionId: string
  auth: AuthStoreBundle
  readonly store: MessageStore
  private readonly logger: Logger
  private readonly authType: ConnectionAuthType
  private readonly phoneNumber: string | undefined
  private readonly cacheSignal: boolean
  private readonly qrTerminal: boolean
  private readonly reconnectOptions: ReconnectOptions
  private readonly baileysExtra: Partial<UserFacingSocketConfig>
  private readonly machine: ConnectionStateMachine = createConnectionStateMachine()
  private reconnectStrategy: ReconnectStrategy
  private _socket: BaileysSocket | undefined
  private reconnectTimer: ReturnType<typeof setTimeout> | undefined
  private listenerCleanup: SocketCleanup[] = []
  private inboundHandle: InboundPipelineHandle | undefined
  private connectResolve: (() => void) | undefined
  private connectReject: ((err: Error) => void) | undefined
  private pairingRequested = false
  private cachedSignalWrap = false
  private disconnectEmittedFor = 0
  private connectAttemptSeq = 0
  private pendingDisconnectReason: DisconnectReasonDomain | undefined
  private readonly usernameCache: Map<string, string> = new Map()
  private _group?: GroupModule
  private _privacy?: PrivacyModule
  private _newsletter?: NewsletterModule
  private _community?: CommunityModule

  /**
   * Build a Client with sensible defaults. When `autoConnect` is enabled (the
   * default) the connection opens on the next microtask, after synchronous
   * `on(...)` registrations in the construction frame have run.
   */
  constructor(options: ClientOptions = {}) {
    super({ logger: adoptLogger(options.logger) })
    this.sessionId = options.sessionId ?? DEFAULT_SESSION_ID
    this.logger = adoptLogger(options.logger)
    this.authType = options.authType ?? DEFAULT_AUTH_TYPE
    this.phoneNumber = options.phoneNumber
    this.cacheSignal = options.cacheSignal ?? true
    this.qrTerminal = options.qrTerminal ?? true
    this.reconnectOptions = options.reconnect ?? {}
    this.baileysExtra = options.baileys ?? {}
    this.auth = options.auth ?? new FileAuthStore({ basePath: `./.zaileys/auth/${this.sessionId}` })
    this.store = options.store ?? new MemoryMessageStore()
    this.reconnectStrategy = createReconnectStrategy(this.reconnectOptions)
    this.attachEmitterLogger()
    if (options.autoConnect ?? true) {
      queueMicrotask(() => {
        if (this.machine.state !== 'idle') return
        try {
          this.connect().catch((err) => this.emitAutoConnectError(err))
        } catch (err) {
          this.emitAutoConnectError(err)
        }
      })
    }
  }

  private emitAutoConnectError(err: unknown): void {
    const error = err instanceof Error ? err : new Error(String(err))
    this.logger.error(error, 'auto-connect failed')
    if (this.listenerCount('error') > 0) {
      this.emit('error', { sessionId: this.sessionId, error })
    }
  }

  /** Current FSM state. */
  get state(): ConnectionState {
    return this.machine.state
  }

  /** Underlying Baileys socket once connected; `undefined` before connect / after disconnect. */
  get socket(): BaileysSocket | undefined {
    return this._socket
  }

  /** Group management namespace (`client.group.*`); methods throw `NOT_CONNECTED` until connected. */
  get group(): GroupModule {
    return (this._group ??= new GroupModule(
      () => this._socket as unknown as DomainSocketLike | undefined,
    ))
  }

  /** Privacy settings namespace (`client.privacy.*`); methods throw `NOT_CONNECTED` until connected. */
  get privacy(): PrivacyModule {
    return (this._privacy ??= new PrivacyModule(
      () => this._socket as unknown as DomainSocketLike | undefined,
    ))
  }

  /** Newsletter namespace (`client.newsletter.*`); methods throw `NOT_CONNECTED` until connected. */
  get newsletter(): NewsletterModule {
    return (this._newsletter ??= new NewsletterModule(
      () => this._socket as unknown as DomainSocketLike | undefined,
    ))
  }

  /** Community namespace (`client.community.*`); methods throw `NOT_CONNECTED` until connected. */
  get community(): CommunityModule {
    return (this._community ??= new CommunityModule(
      () => this._socket as unknown as DomainSocketLike | undefined,
    ))
  }

  /**
   * Open a connection: build auth, instantiate the socket, wire events, and
   * resolve once `connection: 'open'` arrives or reject on a fatal disconnect.
   */
  connect(): Promise<void> {
    if (this.authType === 'pairing' && !this.phoneNumber) {
      return Promise.reject(new Error('phoneNumber is required when authType is "pairing"'))
    }
    if (this.machine.state === 'connecting' || this.machine.state === 'connected') {
      return Promise.resolve()
    }
    if (
      this.machine.state !== 'idle' &&
      this.machine.state !== 'disconnected' &&
      this.machine.state !== 'reconnecting'
    ) {
      return Promise.resolve()
    }
    if (this._socket) {
      for (const c of this.listenerCleanup) c.off()
      this.listenerCleanup = []
      this._socket = undefined
    }
    this.machine.transition('connecting')
    this.connectAttemptSeq += 1
    this.pairingRequested = false
    if (this.cacheSignal && !this.cachedSignalWrap) {
      this.auth = makeCacheableAuthStore(this.auth, { logger: this.logger as never })
      this.cachedSignalWrap = true
    }
    const creds = {} as AuthenticationCreds
    const keys = signalKeyStoreFromAuthStore(this.auth.signal, this.logger)
    const config: UserFacingSocketConfig = {
      ...this.baileysExtra,
      auth: { creds, keys },
      logger: this.logger as never,
    }
    const socket = makeWASocket(config)
    this._socket = socket
    this.store.bind(socket as unknown as BaileysSocketLike)
    this.wireSocket(socket)
    const promise = new Promise<void>((resolve, reject) => {
      this.connectResolve = resolve
      this.connectReject = reject
    })
    void this.auth.creds
      .readCreds()
      .then((loaded) => {
        if (loaded) {
          Object.assign(creds, loaded)
        } else {
          Object.assign(creds, initAuthCreds())
        }
      })
      .catch((err) => {
        this.rejectPendingConnect(err instanceof Error ? err : new Error(String(err)))
      })
    return promise
  }

  /**
   * Tear down the active socket without wiping persisted credentials. Safe to
   * call multiple times; a no-op when idle or already disconnected.
   */
  async disconnect(): Promise<void> {
    if (this.machine.state === 'idle' || this.machine.state === 'disconnected') return
    this.machine.transition('disconnecting')
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = undefined
    }
    this.inboundHandle?.detach()
    this.inboundHandle = undefined
    for (const c of this.listenerCleanup) c.off()
    this.listenerCleanup = []
    if (this._socket) {
      try {
        this._socket.end(undefined)
      } catch (err) {
        this.logger.warn(err, 'socket.end threw')
      }
      this._socket = undefined
    }
    try {
      await this.auth.signal.close()
    } catch (err) {
      this.logger.warn(err, 'auth.signal.close failed')
    }
    try {
      await this.store.close()
    } catch (err) {
      this.logger.warn(err, 'store.close failed')
    }
    this.machine.transition('disconnected')
    if (this.disconnectEmittedFor !== this.connectAttemptSeq) {
      const reason: DisconnectReasonDomain = this.pendingDisconnectReason ?? 'unknown'
      this.pendingDisconnectReason = undefined
      this.disconnectEmittedFor = this.connectAttemptSeq
      this.emit('disconnect', { sessionId: this.sessionId, reason, willReconnect: false })
    }
    this.rejectPendingConnect(new Error('disconnected before connect resolved'))
  }

  /**
   * Log out from WhatsApp on the server, wipe persisted auth, then disconnect.
   * Emits `disconnect` with reason `'logged-out'`.
   */
  async logout(): Promise<void> {
    this.pendingDisconnectReason = 'logged-out'
    if (this._socket) {
      try {
        await this._socket.logout()
      } catch (err) {
        this.logger.warn(err, 'socket.logout failed')
      }
    }
    try {
      await this.auth.signal.clear()
    } catch (err) {
      this.logger.warn(err, 'auth.signal.clear failed')
    }
    try {
      await this.auth.creds.deleteCreds()
    } catch (err) {
      this.logger.warn(err, 'auth.creds.deleteCreds failed')
    }
    if (this.machine.state === 'idle' || this.machine.state === 'disconnected') {
      if (this.disconnectEmittedFor !== this.connectAttemptSeq) {
        this.disconnectEmittedFor = this.connectAttemptSeq
        this.emit('disconnect', {
          sessionId: this.sessionId,
          reason: 'logged-out',
          willReconnect: false,
        })
      }
      this.pendingDisconnectReason = undefined
      return
    }
    await this.disconnect()
  }

  /**
   * Start an outbound message builder targeting `to`. A bare username/phone is
   * resolved to a JID lazily on `await`; a fully-qualified JID is used as-is.
   */
  send(to: string): MessageBuilder<'init'> {
    const socket = this.requireSocket()
    if (isJid(to)) {
      return MessageBuilder.create(socket as unknown as BuilderSocketLike, to)
    }
    return MessageBuilder.create(socket as unknown as BuilderSocketLike, to, (raw) =>
      this.resolveRecipient(raw),
    )
  }

  /** Build an edit for an existing message identified by `key`. */
  edit(key: WAMessageKey): EditBuilder {
    return new EditBuilder(this.requireSocket() as unknown as BuilderSocketLike, key)
  }

  /** Delete a message; defaults to deleting for everyone. */
  async delete(key: WAMessageKey, opts?: DeleteOptions): Promise<void> {
    await deleteMessage(this.requireSocket() as unknown as BuilderSocketLike, key, opts)
  }

  /** React to a message; an empty `emoji` removes the reaction. */
  async react(key: WAMessageKey, emoji: string): Promise<WAMessageKey> {
    return reactToMessage(this.requireSocket() as unknown as BuilderSocketLike, key, emoji)
  }

  /** Forward a stored message to `to`, resolving a username recipient as needed. */
  async forward(key: WAMessageKey, to: string): Promise<WAMessageKey> {
    const socket = this.requireSocket()
    const recipient = await this.resolveRecipient(to)
    return forwardMessage(socket as unknown as BuilderSocketLike, this.store, key, recipient)
  }

  private resolveRecipient(to: string): Promise<string> {
    return resolveUsername(this.requireSocket() as unknown as UsernameResolveSocketLike, to, this.usernameCache)
  }

  private requireSocket(): BaileysSocket {
    if (!this._socket) {
      throw new ZaileysBuilderError('INVALID_OPTIONS', 'client not connected')
    }
    return this._socket
  }

  private attachEmitterLogger(): void {
    void this.logger
  }

  private wireSocket(socket: BaileysSocket): void {
    const onConnection = (update: ConnectionUpdate): void => {
      void this.handleConnectionUpdate(update)
    }
    const onCreds = (creds: Partial<AuthenticationCreds>): void => {
      void this.auth.creds.writeCreds(creds as AuthenticationCreds).catch((err) => {
        this.logger.warn(err, 'auth.creds.writeCreds failed')
      })
    }
    socket.ev.on('connection.update', onConnection)
    socket.ev.on('creds.update', onCreds)
    this.listenerCleanup.push({
      off: () => socket.ev.off('connection.update', onConnection),
    })
    this.listenerCleanup.push({
      off: () => socket.ev.off('creds.update', onCreds),
    })
  }

  private async handleConnectionUpdate(update: ConnectionUpdate): Promise<void> {
    if (update.qr) {
      await this.handleQrUpdate(update.qr)
    }
    if (update.connection === 'open') {
      this.handleOpen()
      return
    }
    if (update.connection === 'close') {
      await this.handleClose(update.lastDisconnect)
    }
  }

  private async handleQrUpdate(qr: string): Promise<void> {
    if (this.authType === 'pairing' && this.phoneNumber && !this.pairingRequested) {
      this.pairingRequested = true
      if (this.machine.canTransition('pairing-pending')) {
        this.machine.transition('pairing-pending')
      }
      try {
        const flow = createPairingFlow({ phoneNumber: this.phoneNumber })
        const socket = this._socket
        if (!socket) return
        const result = await flow.requestCode(socket)
        this.emit('pairing-code', {
          sessionId: this.sessionId,
          code: result.code,
          expiresAt: result.expiresAt,
        })
      } catch (err) {
        this.logger.warn(err, 'pairing-code request failed')
      }
      return
    }
    if (this.machine.canTransition('qr-pending')) {
      this.machine.transition('qr-pending')
    }
    if (this.qrTerminal) {
      try {
        await printQrToTerminal(qr)
      } catch (err) {
        this.logger.warn(err, 'printQrToTerminal failed')
      }
    }
    this.emit('qr', {
      sessionId: this.sessionId,
      qrString: qr,
      expiresAt: Date.now() + QR_DEFAULT_TTL_MS,
    })
  }

  private handleOpen(): void {
    if (this.machine.canTransition('connected')) {
      this.machine.transition('connected')
    }
    this.reconnectStrategy.reset()
    const me = this._socket?.user ?? { id: '' }
    this.emit('connect', { sessionId: this.sessionId, me: me as ConnectionEventMap['connect']['me'] })
    const socket = this._socket
    if (socket) {
      this.inboundHandle?.detach()
      this.inboundHandle = attachInboundPipeline(this, socket as unknown as PipelineSocketLike, {
        selfJid: typeof me.id === 'string' ? me.id : '',
        logger: this.logger,
      })
    }
    const resolve = this.connectResolve
    this.connectResolve = undefined
    this.connectReject = undefined
    if (resolve) resolve()
  }

  private async handleClose(lastDisconnect: ConnectionUpdate['lastDisconnect']): Promise<void> {
    this.inboundHandle?.detach()
    this.inboundHandle = undefined
    const code = extractStatusCode(lastDisconnect?.error)
    const reason = mapDisconnectReason(code)
    let willReconnect = false
    if (shouldClearAuth(reason)) {
      try {
        await this.auth.signal.clear()
      } catch (err) {
        this.logger.warn(err, 'auth.signal.clear failed (post-close)')
      }
      try {
        await this.auth.creds.deleteCreds()
      } catch (err) {
        this.logger.warn(err, 'auth.creds.deleteCreds failed (post-close)')
      }
    }
    if (!isFatalDisconnect(reason)) {
      const decision = this.reconnectStrategy.next(reason)
      if (decision !== null) {
        willReconnect = true
        if (this.machine.canTransition('reconnecting')) {
          this.machine.transition('reconnecting')
        }
        this.emit('reconnecting', {
          sessionId: this.sessionId,
          attempt: decision.attempt,
          delayMs: decision.delayMs,
          reason,
        })
        this.reconnectTimer = setTimeout(() => {
          this.reconnectTimer = undefined
          this.connect().catch((err) => {
            this.logger.warn(err, 'reconnect attempt failed')
          })
        }, decision.delayMs)
      }
    }
    this.disconnectEmittedFor = this.connectAttemptSeq
    this.emit('disconnect', { sessionId: this.sessionId, reason, willReconnect })
    if (!willReconnect) {
      if (this._socket) {
        for (const c of this.listenerCleanup) c.off()
        this.listenerCleanup = []
        this._socket = undefined
      }
      if (this.machine.canTransition('disconnected')) {
        this.machine.transition('disconnected')
      }
      this.rejectPendingConnect(new Error(`connection closed (${reason})`))
    }
  }

  private rejectPendingConnect(err: Error): void {
    const reject = this.connectReject
    this.connectResolve = undefined
    this.connectReject = undefined
    if (reject) reject(err)
  }
}

function extractStatusCode(error: unknown): number | undefined {
  if (!error || typeof error !== 'object') return undefined
  const output = (error as { output?: { statusCode?: unknown } }).output
  if (!output) return undefined
  const code = output.statusCode
  return typeof code === 'number' ? code : undefined
}
