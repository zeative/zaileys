import makeWASocket, {
  fetchLatestBaileysVersion,
  initAuthCreds,
  type AuthenticationCreds,
  type UserFacingSocketConfig,
  type WAMessage,
  type WAMessageKey,
} from 'baileys'
import {
  deleteMessage,
  EditBuilder,
  forwardMessage,
  isJid,
  MessageBuilder,
  pinMessage,
  reactToMessage,
  resolveUsername,
  ZaileysBuilderError,
  type BuilderSocketLike,
  type DeleteOptions,
  type PinOptions,
  type TextOptions,
  type UsernameResolveSocketLike,
} from '../builder/index.js'
import {
  CommunityModule,
  GroupModule,
  BusinessModule,
  ChatModule,
  ContactModule,
  NewsletterModule,
  PrivacyModule,
  ProfileModule,
  type DomainSocketLike,
} from '../domain/index.js'
import {
  attachCommandDispatcher,
  CommandRegistry,
  ZaileysCommandError,
  type CommandContext,
  type CommandHandler,
  type DispatcherHandle,
  type Middleware,
  type ResolvedCommand,
} from '../command/index.js'
import { PluginRegistry, PluginLoader, type PluginHost } from '../plugin/index.js'
import type { PluginsOptions } from '../plugin/types.js'
import {
  AutoDeleteSweeper,
  createOperationGuard,
  PresenceModule,
  RateLimiter,
  runBroadcast,
  Scheduler,
  type AutoDeleteOptions,
  type AutomationSocketLike,
  type BroadcastOptions,
  type BroadcastResult,
  type OperationGuard,
  type PresenceThrottleOptions,
  type ScheduleHandle,
  type ScheduledContentSnapshot,
} from '../automation/index.js'
import type { CitationConfig, MessageContext } from '../events/context.js'
import { createDownloadFn } from '../events/decoders/_media-download.js'
import type { MediaDownloadResult, MediaKind } from '../events/types.js'
import {
  formatConnectionStatus,
  suppressLibsignalNoise,
  type StatusEvent,
} from '../connection/status-log.js'
import { FileAuthStore } from '../auth/adapters/file.js'
import { makeCacheableAuthStore } from '../auth/cache.js'
import type { AuthStoreBundle } from '../auth/types.js'
import { signalKeyStoreFromAuthStore } from '../connection/auth-adapter.js'
import {
  isFatalDisconnect,
  isRateLimited,
  mapDisconnectReason,
  shouldClearAuth,
  type DisconnectReasonDomain,
} from '../connection/disconnect-reason.js'
import { createAuthGuard, type AuthGuard } from '../connection/auth-guard.js'
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
  ProviderKind,
  ReconnectOptions,
} from './types.js'
import { validateCloudOptions, type CloudOptions } from '../cloud/types.js'
import { CloudTransport } from '../cloud/transport.js'
import { createWebhookHandler, type WebhookHandler } from '../cloud/webhook.js'
import { ZaileysCloudError } from '../cloud/errors.js'

const DEFAULT_SESSION_ID = 'default'
const DEFAULT_AUTH_TYPE: ConnectionAuthType = 'qr'
const QR_DEFAULT_TTL_MS = 60_000
/** WA emits a spurious 401 right after a good connect; reconnect to confirm before wiping creds (#54). */
const POST_OPEN_LOGOUT_MAX_RETRIES = 2
const POST_OPEN_LOGOUT_RETRY_DELAY_MS = 3_000

interface SocketCleanup {
  off: () => void
}

interface ConnectionUpdate {
  connection?: 'open' | 'connecting' | 'close'
  lastDisconnect?: { error?: unknown; date?: Date }
  qr?: string
  isNewLogin?: boolean
}

export class Client extends TypedEventEmitter<ClientEventMap> {
  readonly sessionId: string
  auth: AuthStoreBundle
  readonly store: MessageStore
  private readonly logger: Logger
  private readonly authType: ConnectionAuthType
  private readonly phoneNumber: string | undefined
  private readonly cacheSignal: boolean
  private readonly qrTerminal: boolean
  private readonly statusLog: boolean
  private readonly reconnectOptions: ReconnectOptions
  private readonly baileysExtra: Partial<UserFacingSocketConfig>
  private readonly machine: ConnectionStateMachine = createConnectionStateMachine()
  private reconnectStrategy: ReconnectStrategy
  private readonly authGuard: AuthGuard
  private readonly operationGuard: OperationGuard
  private readonly presenceThrottle: PresenceThrottleOptions | undefined
  private readonly scheduleLimiter: RateLimiter | undefined
  private authExhausted = false
  private _socket: BaileysSocket | undefined
  private reconnectTimer: ReturnType<typeof setTimeout> | undefined
  private listenerCleanup: SocketCleanup[] = []
  private inboundHandle: InboundPipelineHandle | undefined
  private connectResolve: (() => void) | undefined
  private connectReject: ((err: Error) => void) | undefined
  private pairingRequested = false
  private cachedSignalWrap = false
  private creds: AuthenticationCreds | undefined
  private credsLoadedAtConnect = false
  private openedThisRun = false
  private credsHintShown = false
  private postOpenLogoutRetries = 0
  private disconnectEmittedFor = 0
  private connectAttemptSeq = 0
  private pendingDisconnectReason: DisconnectReasonDomain | undefined
  private readonly usernameCache: Map<string, string> = new Map()
  private _group?: GroupModule
  private _privacy?: PrivacyModule
  private _newsletter?: NewsletterModule
  private _community?: CommunityModule
  private _profile?: ProfileModule
  private _chat?: ChatModule
  private _contact?: ContactModule
  private _business?: BusinessModule
  private commandRegistry?: CommandRegistry
  private readonly commandMiddleware: Middleware[] = []
  private readonly commandPrefixes: string[]
  private readonly citationConfig: CitationConfig | undefined
  private readonly ignoreMe: boolean
  private commandDispatcher: DispatcherHandle | undefined
  private _presence?: PresenceModule
  private _scheduler?: Scheduler
  private readonly autoDeleteOptions: AutoDeleteOptions | undefined
  private autoDeleteSweeper: AutoDeleteSweeper | undefined
  private readonly pluginsOptions: PluginsOptions | undefined
  private pluginRegistry: PluginRegistry | undefined
  private pluginLoader: PluginLoader | undefined
  private waVersion?: UserFacingSocketConfig['version']
  private versionWarming?: Promise<void>
  private readonly _provider: ProviderKind
  private readonly cloudOptions: CloudOptions | undefined
  private cloudTransport: CloudTransport | undefined

  constructor(options: ClientOptions = {}) {
    super({ logger: adoptLogger(options.logger) })
    this._provider = options.provider ?? 'baileys'
    this.cloudOptions = this._provider === 'cloud' ? validateCloudOptions(options.cloud) : undefined
    this.sessionId = options.sessionId ?? DEFAULT_SESSION_ID
    this.logger = adoptLogger(options.logger)
    this.authType = options.authType ?? DEFAULT_AUTH_TYPE
    this.phoneNumber = options.phoneNumber
    this.cacheSignal = options.cacheSignal ?? true
    this.qrTerminal = options.qrTerminal ?? true
    this.statusLog = options.statusLog ?? true
    if (this.statusLog) suppressLibsignalNoise()
    this.reconnectOptions = options.reconnect ?? {}
    this.baileysExtra = options.baileys ?? {}
    this.auth = options.auth ?? new FileAuthStore({ basePath: `./.zaileys/auth/${this.sessionId}` })
    this.store = options.store ?? new MemoryMessageStore()
    this.reconnectStrategy = createReconnectStrategy(this.reconnectOptions)
    this.authGuard = createAuthGuard(options.authGuard)
    this.operationGuard = createOperationGuard(options.operationGuard)
    this.presenceThrottle = options.presence
    const schedulePerSec = options.scheduleRateLimitPerSec ?? 1
    this.scheduleLimiter = schedulePerSec > 0 ? new RateLimiter({ perSec: schedulePerSec }) : undefined
    this.commandPrefixes = normalizePrefixes(options.commandPrefix)
    this.citationConfig = options.citation
    this.ignoreMe = options.ignoreMe ?? true
    this.autoDeleteOptions =
      options.autoDelete === false
        ? undefined
        : { maxAgeMs: 30 * 24 * 60 * 60 * 1000, ...options.autoDelete }
    this.pluginsOptions = options.plugins
    this.attachEmitterLogger()
    if (options.autoConnect ?? true) {
      queueMicrotask(() => {
        if (this.machine.state !== 'idle') return
        void this.warmVersion().finally(() => {
          if (this.machine.state !== 'idle') return
          try {
            this.connect().catch((err) => this.emitAutoConnectError(err))
          } catch (err) {
            this.emitAutoConnectError(err)
          }
        })
      })
    }
  }

  private warmVersion(): Promise<void> {
    if (this._provider === 'cloud') return Promise.resolve()
    if (this.waVersion) return Promise.resolve()
    if (this.versionWarming) return this.versionWarming
    try {
      if (typeof fetchLatestBaileysVersion !== 'function') return Promise.resolve()
      this.versionWarming = fetchLatestBaileysVersion()
        .then(({ version }) => {
          this.waVersion = version
        })
        .catch((err) => {
          this.logger.warn(err, 'fetchLatestBaileysVersion failed; using bundled version')
        })
      return this.versionWarming
    } catch {
      return Promise.resolve()
    }
  }

  private emitAutoConnectError(err: unknown): void {
    const error = err instanceof Error ? err : new Error(String(err))
    this.logger.error(error, 'auto-connect failed')
    if (this.listenerCount('error') > 0) {
      this.emit('error', { sessionId: this.sessionId, error })
    }
  }

  private logStatus(event: StatusEvent): void {
    if (!this.statusLog) return
    const line = formatConnectionStatus(event)
    if (line) process.stderr.write(`${line}\n`)
  }

  private resolveMe(): ConnectionEventMap['connect']['me'] {
    const user = this._socket?.user
    if (user && typeof user.id === 'string' && user.id.length > 0) {
      return user as ConnectionEventMap['connect']['me']
    }
    const credsMe = this.creds?.me
    if (credsMe && typeof credsMe.id === 'string' && credsMe.id.length > 0) {
      return credsMe as ConnectionEventMap['connect']['me']
    }
    return { id: '' }
  }

  get provider(): ProviderKind {
    return this._provider
  }

  get state(): ConnectionState {
    return this.machine.state
  }

  get socket(): BaileysSocket | undefined {
    return this._socket
  }

  get group(): GroupModule {
    return (this._group ??= new GroupModule(
      () => this._socket as unknown as DomainSocketLike | undefined,
      this.operationGuard,
    ))
  }

  get privacy(): PrivacyModule {
    return (this._privacy ??= new PrivacyModule(
      () => this._socket as unknown as DomainSocketLike | undefined,
    ))
  }

  get newsletter(): NewsletterModule {
    return (this._newsletter ??= new NewsletterModule(
      () => this._socket as unknown as DomainSocketLike | undefined,
      this.operationGuard,
    ))
  }

  get community(): CommunityModule {
    return (this._community ??= new CommunityModule(
      () => this._socket as unknown as DomainSocketLike | undefined,
      this.operationGuard,
    ))
  }

  get profile(): ProfileModule {
    return (this._profile ??= new ProfileModule(
      () => this._socket as unknown as DomainSocketLike | undefined,
    ))
  }

  get chat(): ChatModule {
    return (this._chat ??= new ChatModule(
      () => this._socket as unknown as DomainSocketLike | undefined,
      async (jid) => {
        try {
          const msgs = await this.store.listMessages(jid, { limit: 1 })
          const toSeconds = (ts: unknown): number => {
            if (typeof ts === 'number') return ts
            if (ts != null && typeof (ts as { toNumber?: unknown }).toNumber === 'function') {
              return (ts as { toNumber(): number }).toNumber()
            }
            const n = Number(ts ?? 0)
            return Number.isFinite(n) ? n : 0
          }
          return msgs
            .filter((m) => m.key != null)
            .map((m) => ({ key: m.key, messageTimestamp: toSeconds(m.messageTimestamp) }))
            .filter((m) => m.messageTimestamp > 0)
        } catch {
          return []
        }
      },
    ))
  }

  get contact(): ContactModule {
    return (this._contact ??= new ContactModule(
      () => this._socket as unknown as DomainSocketLike | undefined,
      (input) => (isJid(input) ? input : `${input.replace(/\D/g, '')}@s.whatsapp.net`),
    ))
  }

  get business(): BusinessModule {
    return (this._business ??= new BusinessModule(
      () => this._socket as unknown as DomainSocketLike | undefined,
    ))
  }

  get presence(): PresenceModule {
    return (this._presence ??= new PresenceModule(
      () => this._socket as unknown as AutomationSocketLike | undefined,
      this.presenceThrottle,
    ))
  }

  async broadcast(
    jids: string[],
    build: (b: MessageBuilder<'init'>) => MessageBuilder<'content-set'>,
    options?: BroadcastOptions,
  ): Promise<BroadcastResult> {
    this.requireSocket()
    return runBroadcast(jids, build, { sendTo: (jid) => this.send(jid) }, options)
  }

  async scheduleAt(
    date: Date,
    build: (b: MessageBuilder<'init'>) => MessageBuilder<'content-set'>,
  ): Promise<ScheduleHandle> {
    return this.ensureScheduler().scheduleAt(date, build)
  }

  private ensureScheduler(): Scheduler {
    return (this._scheduler ??= new Scheduler({
      store: this.store,
      sendSnapshot: (snapshot: ScheduledContentSnapshot) => this.dispatchSnapshot(snapshot),
      logger: this.logger,
      ...(this.scheduleLimiter ? { acquire: () => this.scheduleLimiter!.acquire() } : {}),
    }))
  }

  private async dispatchSnapshot(snapshot: ScheduledContentSnapshot): Promise<void> {
    const socket = this.requireSocket()
    await socket.sendMessage(snapshot.recipient, snapshot.content, snapshot.options)
  }

  connect(): Promise<void> {
    if (this._provider === 'cloud') return this.connectCloud()
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
    const fromReconnect = this.machine.state === 'reconnecting'
    if (!fromReconnect) {
      this.authGuard.reset()
      this.authExhausted = false
    }
    this.machine.transition('connecting')
    this.connectAttemptSeq += 1
    this.pairingRequested = false
    this.openedThisRun = false
    if (!fromReconnect) this.logStatus({ kind: 'connecting', sessionId: this.sessionId })
    if (this.cacheSignal && !this.cachedSignalWrap) {
      this.auth = makeCacheableAuthStore(this.auth, { logger: this.logger as never })
      this.cachedSignalWrap = true
    }
    void this.warmVersion()
    const creds = {} as AuthenticationCreds
    this.creds = creds
    const keys = signalKeyStoreFromAuthStore(this.auth.signal, this.logger)
    const config: UserFacingSocketConfig = {
      markOnlineOnConnect: false,
      syncFullHistory: false,
      qrTimeout: QR_DEFAULT_TTL_MS,
      ...(this.waVersion ? { version: this.waVersion } : {}),
      ...this.baileysExtra,
      auth: { creds, keys },
      logger: this.logger as never,
      getMessage: (key) => this.resolveMessageForResend(key),
    }
    const socket = makeWASocket(config)
    this._socket = socket
    this.store.bind(socket as unknown as BaileysSocketLike)
    this.wireSocket(socket)
    const promise = new Promise<void>((resolve, reject) => {
      const prevResolve = this.connectResolve
      const prevReject = this.connectReject
      this.connectResolve = () => {
        prevResolve?.()
        resolve()
      }
      this.connectReject = (err) => {
        prevReject?.(err)
        reject(err)
      }
    })
    void this.auth.creds
      .readCreds()
      .then((loaded) => {
        this.credsLoadedAtConnect = Boolean(loaded)
        Object.assign(creds, loaded ?? initAuthCreds())
      })
      .catch((err) => {
        this.rejectPendingConnect(err instanceof Error ? err : new Error(String(err)))
      })
    return promise
  }

  private async connectCloud(): Promise<void> {
    if (this.machine.state === 'connecting' || this.machine.state === 'connected') return
    this.machine.transition('connecting')
    this.logStatus({ kind: 'connecting', sessionId: this.sessionId })
    const transport = (this.cloudTransport ??= new CloudTransport(this.cloudOptions as CloudOptions))
    this.store.bind(transport as unknown as BaileysSocketLike)
    try {
      const me = await transport.connect()
      this.machine.transition('connected')
      this.attachCloudPipeline(transport, me.id)
      this.logStatus({ kind: 'connected', id: me.id })
      this.emit('connect', { sessionId: this.sessionId, me })
    } catch (err) {
      this.machine.transition('disconnected')
      throw err
    }
  }

  private attachCloudPipeline(transport: CloudTransport, meId: string): void {
    const selfJid = meId.includes('@') ? meId : `${meId}@s.whatsapp.net`
    this.inboundHandle?.detach()
    this.inboundHandle = attachInboundPipeline(this, transport as unknown as PipelineSocketLike, {
      selfJid,
      channelId: this.sessionId,
      receiverId: selfJid,
      prefixes: this.commandPrefixes,
      logger: this.logger,
      ...(this.citationConfig != null ? { citationConfig: this.citationConfig } : {}),
      receiverName: () => Promise.resolve(null),
      resolveQuoted: (id, remoteJid) => this.lookupQuoted(id, remoteJid),
      resolveLidToPn: () => Promise.resolve(null),
      sendReply: async (target, content, opts, quoted) =>
        await this.send(target).text(content, opts).reply(quoted),
      react: (key, emoji) => this.react(key, emoji),
      ignoreMe: this.ignoreMe,
    })
    this.attachCommandsIfReady()
  }

  /**
   * Framework-agnostic Meta webhook endpoint (cloud provider only): handles the GET
   * verification challenge and signed POST deliveries, then feeds events into the client.
   */
  webhook(): WebhookHandler {
    if (this._provider !== 'cloud') {
      throw new ZaileysCloudError('CONFIG', 'webhook() is only available on the cloud provider')
    }
    const cloud = this.cloudOptions as CloudOptions
    return createWebhookHandler({
      ...(cloud.verifyToken !== undefined ? { verifyToken: cloud.verifyToken } : {}),
      ...(cloud.appSecret !== undefined ? { appSecret: cloud.appSecret } : {}),
      onPayload: (payload) => {
        const transport = this.cloudTransport
        if (!transport) return
        transport.ingest(payload)
      },
    })
  }

  private async disconnectCloud(): Promise<void> {
    if (this.machine.state === 'idle' || this.machine.state === 'disconnected') return
    if (this.machine.canTransition('disconnecting')) this.machine.transition('disconnecting')
    await this.cloudTransport?.disconnect()
    this.machine.transition('disconnected')
    this.emit('disconnect', { sessionId: this.sessionId, reason: 'unknown', willReconnect: false })
  }

  async disconnect(): Promise<void> {
    if (this._provider === 'cloud') return this.disconnectCloud()
    if (this.machine.state === 'idle' || this.machine.state === 'disconnected') return
    this.machine.transition('disconnecting')
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = undefined
    }
    this.inboundHandle?.detach()
    this.inboundHandle = undefined
    this.detachCommands()
    this.autoDeleteSweeper?.stop()
    this.autoDeleteSweeper = undefined
    await this.pluginLoader?.stop().catch(() => undefined)
    this.pluginLoader = undefined
    this.pluginRegistry = undefined
    this._scheduler?.dispose()
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

  command(spec: string, handler: CommandHandler): this {
    ;(this.commandRegistry ??= new CommandRegistry()).register(spec, handler)
    this.attachCommandsIfReady()
    return this
  }

  unregisterCommand(spec: string): this {
    this.commandRegistry?.unregister(spec)
    return this
  }

  use(middleware: Middleware): this {
    this.commandMiddleware.push(middleware)
    return this
  }

  unuse(middleware: Middleware): this {
    const idx = this.commandMiddleware.indexOf(middleware)
    if (idx >= 0) this.commandMiddleware.splice(idx, 1)
    return this
  }

  private attachCommandsIfReady(): void {
    if (this.commandDispatcher) return
    if (this.commandPrefixes.length === 0) return
    if (this.commandRegistry === undefined || this.commandRegistry.list().length === 0) return
    if (!this._socket) return
    const registry = this.commandRegistry
    this.commandDispatcher = attachCommandDispatcher({
      registry,
      middleware: this.commandMiddleware,
      prefixes: this.commandPrefixes,
      logger: this.logger,
      onText: (handler) => {
        const wrapped = (msg: MessageContext): void => handler(msg)
        this.on('text', wrapped)
        return () => this.off('text', wrapped)
      },
      buildContext: (resolved, msg) => this.buildCommandContext(resolved, msg),
    })
  }

  private buildCommandContext(resolved: ResolvedCommand, msg: MessageContext): CommandContext {
    let lastSentKey: WAMessageKey | undefined
    return {
      ...msg,
      raw: resolved.raw,
      command: resolved.command,
      args: resolved.args,
      flags: resolved.flags,
      json: resolved.json,
      reply: async (content: string, opts?: TextOptions): Promise<WAMessageKey> => {
        const target = msg.message().key.remoteJid ?? msg.roomId ?? msg.senderId
        const key = await this.send(target).text(content, opts).reply(msg.message())
        lastSentKey = key
        return key
      },
      react: (emoji: string): Promise<WAMessageKey> => this.react(msg.message().key, emoji),
      edit: async (content: string): Promise<void> => {
        if (lastSentKey === undefined) {
          throw new ZaileysCommandError('NO_SENT_MESSAGE', 'ctx.edit requires a prior ctx.reply')
        }
        await this.edit(lastSentKey).text(content)
      },
    }
  }

  private detachCommands(): void {
    this.commandDispatcher?.detach()
    this.commandDispatcher = undefined
  }

  send(to: string): MessageBuilder<'init'> {
    const socket = this.requireBuilderSocket()
    const recordSent = (message: WAMessage): void => {
      void this.store.saveMessage(message).catch((err) => this.logger.warn(err, 'recordSent failed'))
    }
    if (this._provider === 'cloud' || isJid(to)) {
      return MessageBuilder.create(socket, to, undefined, recordSent)
    }
    return MessageBuilder.create(socket, to, (raw) => this.resolveRecipient(raw), recordSent)
  }

  edit(key: WAMessageKey): EditBuilder {
    return new EditBuilder(this.requireSocket() as unknown as BuilderSocketLike, key)
  }

  async delete(key: WAMessageKey, opts?: DeleteOptions): Promise<void> {
    await deleteMessage(this.requireSocket() as unknown as BuilderSocketLike, key, opts)
  }

  async react(key: WAMessageKey, emoji: string): Promise<WAMessageKey> {
    return reactToMessage(this.requireBuilderSocket(), key, emoji)
  }

  /** Cloud provider only: send an approved Meta message template by name + language. */
  async sendTemplate(
    to: string,
    name: string,
    languageCode: string,
    components?: Array<Record<string, unknown>>,
  ): Promise<WAMessageKey> {
    if (this._provider !== 'cloud' || !this.cloudTransport) {
      throw new ZaileysCloudError('CONFIG', 'sendTemplate() is only available on the cloud provider')
    }
    const sent = await this.cloudTransport.sendTemplate(to, name, languageCode, components)
    return sent.key
  }

  /** Cloud provider only: mark an inbound message read (optionally showing a typing indicator). */
  async markRead(messageId: string, opts?: { typing?: boolean }): Promise<void> {
    if (this._provider !== 'cloud' || !this.cloudTransport) {
      throw new ZaileysCloudError('CONFIG', 'markRead(messageId) is only available on the cloud provider')
    }
    await this.cloudTransport.markRead(messageId, opts)
  }

  async forward(key: WAMessageKey, to: string): Promise<WAMessageKey> {
    const socket = this.requireSocket()
    const recipient = await this.resolveRecipient(to)
    return forwardMessage(socket as unknown as BuilderSocketLike, this.store, key, recipient)
  }

  async pin(key: WAMessageKey, opts?: PinOptions): Promise<WAMessageKey> {
    return pinMessage(this.requireSocket() as unknown as BuilderSocketLike, key, true, opts)
  }

  async unpin(key: WAMessageKey): Promise<WAMessageKey> {
    return pinMessage(this.requireSocket() as unknown as BuilderSocketLike, key, false)
  }

  async setDisappearing(to: string, seconds: number): Promise<void> {
    const recipient = await this.resolveRecipient(to)
    const socket = this.requireSocket() as unknown as BuilderSocketLike
    await socket.sendMessage(recipient, { disappearingMessagesInChat: seconds } as never)
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

  /** Messaging seam: baileys socket or the cloud transport, whichever the provider dictates. */
  private requireBuilderSocket(): BuilderSocketLike {
    if (this._provider === 'cloud') {
      if (!this.cloudTransport || this.machine.state !== 'connected') {
        throw new ZaileysBuilderError('INVALID_OPTIONS', 'client not connected')
      }
      return this.cloudTransport
    }
    return this.requireSocket() as unknown as BuilderSocketLike
  }

  private attachEmitterLogger(): void {
    void this.logger
  }

  private wireSocket(socket: BaileysSocket): void {
    const onConnection = (update: ConnectionUpdate): void => {
      void this.handleConnectionUpdate(update)
    }
    const onCreds = (update: Partial<AuthenticationCreds>): void => {
      const merged = this.creds ? Object.assign(this.creds, update) : (update as AuthenticationCreds)
      this.creds = merged
      void this.auth.creds.writeCreds(merged).catch((err) => {
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
    if (this.authExhausted) return
    if (this.authType === 'pairing' && this.phoneNumber) {
      if (this.pairingRequested) return
      const now = Date.now()
      const decision = this.authGuard.evaluate('pairing', now)
      if (!decision.allowed) {
        if (decision.reason === 'budget-exhausted') {
          this.handleAuthExhausted('pairing', decision.attempts, decision.max)
        }
        return
      }
      this.pairingRequested = true
      this.authGuard.record('pairing', now)
      if (this.machine.canTransition('pairing-pending')) {
        this.machine.transition('pairing-pending')
      }
      try {
        const flow = createPairingFlow({ phoneNumber: this.phoneNumber })
        const socket = this._socket
        if (!socket) return
        const result = await flow.requestCode(socket)
        this.logStatus({ kind: 'pairing-code', code: result.code })
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
    const now = Date.now()
    const decision = this.authGuard.evaluate('qr', now)
    if (!decision.allowed) {
      this.handleAuthExhausted('qr', decision.attempts, decision.max)
      return
    }
    this.authGuard.record('qr', now)
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
    this.logStatus({ kind: 'qr' })
    this.emit('qr', {
      sessionId: this.sessionId,
      qrString: qr,
      expiresAt: now + QR_DEFAULT_TTL_MS,
    })
  }

  private handleAuthExhausted(kind: ConnectionAuthType, attempts: number, max: number): void {
    if (this.authExhausted) return
    this.authExhausted = true
    this.logger.warn(
      { sessionId: this.sessionId, kind, attempts, max },
      `auth attempts exhausted (${attempts}/${max} ${kind}); stopping to avoid WhatsApp spam restriction — call connect() to retry`,
    )
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = undefined
    }
    this.emit('auth-exhausted', { sessionId: this.sessionId, kind, attempts, max })
    void this.disconnect()
  }

  private handleOpen(): void {
    if (this.machine.canTransition('connected')) {
      this.machine.transition('connected')
    }
    this.openedThisRun = true
    this.credsHintShown = false
    this.postOpenLogoutRetries = 0
    this.authExhausted = false
    this.authGuard.reset()
    this.reconnectStrategy.reset()
    const me = this.resolveMe()
    this.logStatus({ kind: 'connected', id: typeof me.id === 'string' ? me.id : '' })
    this.emit('connect', { sessionId: this.sessionId, me: me as ConnectionEventMap['connect']['me'] })
    const socket = this._socket
    if (socket) {
      this.inboundHandle?.detach()
      this.inboundHandle = attachInboundPipeline(this, socket as unknown as PipelineSocketLike, {
        selfJid: typeof me.id === 'string' ? me.id : '',
        ...(typeof me.lid === 'string' && me.lid.length > 0 ? { selfLid: me.lid } : {}),
        ...(typeof me.name === 'string' && me.name.length > 0 ? { selfName: me.name } : {}),
        channelId: this.sessionId,
        receiverId: typeof me.id === 'string' ? me.id : '',
        prefixes: this.commandPrefixes,
        logger: this.logger,
        ...(this.citationConfig != null ? { citationConfig: this.citationConfig } : {}),
        groupMetadata: (groupId) => this.group.metadata(groupId).catch(() => null),
        receiverName: () => Promise.resolve(this.resolveMe().name ?? null),
        resolveQuoted: (id, remoteJid) => this.lookupQuoted(id, remoteJid),
        resolveLidToPn: (lid) => this.lidToPn(lid),
        sendReply: async (target, content, opts, quoted) =>
          await this.send(target).text(content, opts).reply(quoted),
        react: (key, emoji) => this.react(key, emoji),
        ignoreMe: this.ignoreMe,
      })
    }
    this.attachCommandsIfReady()
    void this.ensureScheduler()
      .loadPending()
      .catch((err) => this.logger.warn(err, 'scheduler loadPending failed'))
    if (this.autoDeleteOptions) {
      this.autoDeleteSweeper?.stop()
      this.autoDeleteSweeper = new AutoDeleteSweeper({
        store: this.store,
        options: this.autoDeleteOptions,
        logger: this.logger,
      })
      this.autoDeleteSweeper.start()
    }
    if (this.pluginsOptions && !this.pluginLoader) {
      this.pluginRegistry = new PluginRegistry({
        client: this as unknown as PluginHost,
        logger: this.logger,
      })
      this.pluginLoader = new PluginLoader({
        registry: this.pluginRegistry,
        options: this.pluginsOptions,
        logger: this.logger,
      })
      void this.pluginLoader.start().catch((err) =>
        this.logger.error(err, 'plugin loader start failed'),
      )
    }
    const resolve = this.connectResolve
    this.connectResolve = undefined
    this.connectReject = undefined
    if (resolve) resolve()
  }

  private async resolveMessageForResend(key: WAMessageKey): Promise<NonNullable<WAMessage['message']> | undefined> {
    try {
      const found = await this.store.getMessage(key)
      return found?.message ?? undefined
    } catch (err) {
      this.logger.warn(err, 'getMessage resend lookup failed')
      return undefined
    }
  }

  private lidMapping(): { getPNForLID?: (l: string) => Promise<string | null>; getLIDForPN?: (p: string) => Promise<string | null> } | undefined {
    return (this._socket as { signalRepository?: { lidMapping?: { getPNForLID?: (l: string) => Promise<string | null>; getLIDForPN?: (p: string) => Promise<string | null> } } } | undefined)?.signalRepository?.lidMapping
  }

  /** Resolve a `@lid` JID to its phone-number JID (uses WhatsApp's LID mapping; may hit the network). */
  async lidToPn(lid: string): Promise<string | null> {
    try {
      const fn = this.lidMapping()?.getPNForLID
      return typeof fn === 'function' ? await fn(lid) : null
    } catch {
      return null
    }
  }

  /** Resolve a phone-number JID to its `@lid` JID (uses WhatsApp's LID mapping; may hit the network). */
  async pnToLid(pn: string): Promise<string | null> {
    try {
      const fn = this.lidMapping()?.getLIDForPN
      return typeof fn === 'function' ? await fn(pn) : null
    } catch {
      return null
    }
  }

  /**
   * Download media bytes for a message stored in the message store (by key).
   * Tries both `fromMe` variants. `null` when the message is unknown or carries no media.
   */
  async downloadMedia(key: WAMessageKey): Promise<MediaDownloadResult | null> {
    const kinds: MediaKind[] = ['image', 'video', 'audio', 'document', 'sticker']
    const fields: Record<MediaKind, string> = {
      image: 'imageMessage',
      video: 'videoMessage',
      audio: 'audioMessage',
      document: 'documentMessage',
      sticker: 'stickerMessage',
    }
    for (const fromMe of [key.fromMe === true, key.fromMe !== true]) {
      const stored = await this.store.getMessage({ ...key, fromMe }).catch(() => undefined)
      const content = stored?.message as Record<string, unknown> | undefined
      if (stored == null || content == null) continue
      const kind = kinds.find((k) => content[fields[k]] != null)
      if (kind === undefined) return null
      if (this._provider === 'cloud') {
        const node = content[fields[kind]] as { cloudMediaId?: string } | undefined
        const mediaId = node?.cloudMediaId
        if (typeof mediaId !== 'string' || !this.cloudTransport) return null
        return this.cloudTransport.downloadMedia(mediaId)
      }
      return createDownloadFn(stored, kind, this.logger)()
    }
    return null
  }

  private async lookupQuoted(id: string, remoteJid: string): Promise<WAMessage | null> {
    for (const fromMe of [false, true]) {
      try {
        const found = await this.store.getMessage({ id, remoteJid, fromMe })
        if (found != null) return found
      } catch {
        continue
      }
    }
    return null
  }

  private async handleClose(lastDisconnect: ConnectionUpdate['lastDisconnect']): Promise<void> {
    this.inboundHandle?.detach()
    this.inboundHandle = undefined
    this.detachCommands()
    const code = extractStatusCode(lastDisconnect?.error)
    const reason = mapDisconnectReason(code)
    let willReconnect = false
    /** Post-open logged-out is likely spurious; reconnect to confirm — a real logout won't re-open and clears then. */
    const spuriousLogout =
      reason === 'logged-out' &&
      this.openedThisRun &&
      !this.authExhausted &&
      this.postOpenLogoutRetries < POST_OPEN_LOGOUT_MAX_RETRIES
    if (spuriousLogout) {
      this.postOpenLogoutRetries += 1
      this.logger.warn(
        { sessionId: this.sessionId, attempt: this.postOpenLogoutRetries },
        'logged-out right after connect; treating as spurious and reconnecting instead of clearing session',
      )
    }
    if (shouldClearAuth(reason) && !spuriousLogout) {
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
    if ((spuriousLogout || !isFatalDisconnect(reason)) && !this.authExhausted) {
      if (isRateLimited(reason)) {
        this.logger.warn(
          { sessionId: this.sessionId },
          'WhatsApp returned rate-limited (429); backing off before reconnect to avoid restriction',
        )
      }
      const decision = spuriousLogout
        ? { attempt: this.postOpenLogoutRetries, delayMs: POST_OPEN_LOGOUT_RETRY_DELAY_MS }
        : this.reconnectStrategy.next(reason)
      if (decision !== null) {
        willReconnect = true
        if (this.machine.canTransition('reconnecting')) {
          this.machine.transition('reconnecting')
        }
        const invalidCredsSuspected =
          this.credsLoadedAtConnect &&
          !this.openedThisRun &&
          decision.attempt >= 2 &&
          !this.credsHintShown
        if (invalidCredsSuspected) this.credsHintShown = true
        this.logStatus({
          kind: 'reconnecting',
          attempt: decision.attempt,
          delayMs: decision.delayMs,
          reason,
          invalidCredsSuspected,
        })
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
    this.logStatus({ kind: 'disconnect', reason, willReconnect })
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

function normalizePrefixes(prefix: string | string[] | undefined): string[] {
  if (prefix === undefined) return []
  const list = Array.isArray(prefix) ? prefix : [prefix]
  return list.filter((p) => p.length > 0)
}

function extractStatusCode(error: unknown): number | undefined {
  if (!error || typeof error !== 'object') return undefined
  const output = (error as { output?: { statusCode?: unknown } }).output
  if (!output) return undefined
  const code = output.statusCode
  return typeof code === 'number' ? code : undefined
}
