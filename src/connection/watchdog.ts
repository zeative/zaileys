import { DisconnectReason } from 'baileys'
import type { Logger } from '../client/types.js'
import { isPnJid } from '../utils/jid.js'
import { clampTimerDelay } from '../utils/timer.js'
import { ZaileysConnectionError } from './errors.js'

/** Experimental: reconnects a WhatsApp Web session that stays open but stops receiving. Off by default. */
export interface WatchdogOptions {
  /** Quiet time without inbound delivery traffic before a probe runs; at least `60000`. Default `900000` (15 min). */
  idleMs?: number
  /** How long the probe may take before the session counts as deaf; above `0`. Default `10000`. */
  probeTimeoutMs?: number
}

export interface ResolvedWatchdogOptions {
  idleMs: number
  probeTimeoutMs: number
}

export const WATCHDOG_DEFAULTS: Readonly<ResolvedWatchdogOptions> = Object.freeze({
  idleMs: 15 * 60_000,
  probeTimeoutMs: 10_000,
})

export const WATCHDOG_MIN_IDLE_MS = 60_000

/** Server-pushed stanzas only: `iq` and `ack` also answer baileys' own keepalive and sends, so they would hide deafness. */
export const WATCHDOG_ACTIVITY_TAGS: ReadonlySet<string> = new Set([
  'message',
  'receipt',
  'notification',
  'call',
  'presence',
  'chatstate',
])

export interface WatchdogClock {
  now: () => number
}

export interface WatchdogTimer {
  setTimeout: (fn: () => void, ms: number) => unknown
  clearTimeout: (handle: unknown) => void
}

export interface WatchdogDeafInfo {
  idleMs: number
  error: unknown
}

export interface WatchdogDeps {
  /** Resolves when the server answered; rejects or hangs when it did not. */
  probe: () => Promise<unknown>
  /** Called at most once per start(), after a failed probe with no inbound traffic during it. */
  onDeaf: (info: WatchdogDeafInfo) => void
  clock?: WatchdogClock
  timer?: WatchdogTimer
}

const systemTimer: WatchdogTimer = {
  setTimeout: (fn, ms) => setTimeout(fn, ms),
  clearTimeout: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
}

const assertWatchdogMs = (name: keyof ResolvedWatchdogOptions, value: unknown, min: number, inclusive: boolean) => {
  const ok = typeof value === 'number' && Number.isFinite(value) && (inclusive ? value >= min : value > min)
  if (!ok) {
    throw new ZaileysConnectionError(
      'INVALID_OPTIONS',
      `watchdog.${name} must be a finite number of milliseconds ${inclusive ? '>=' : '>'} ${min}, got ${String(value)}`,
    )
  }
  return value
}

/** Returns `undefined` when the watchdog is off; throws INVALID_OPTIONS naming the field on a bad value. */
export const resolveWatchdogOptions = (
  input: WatchdogOptions | boolean | undefined,
): ResolvedWatchdogOptions | undefined => {
  if (input === undefined || input === false) return undefined
  if (input === true) return { ...WATCHDOG_DEFAULTS }
  if (typeof input !== 'object' || input === null) {
    throw new ZaileysConnectionError(
      'INVALID_OPTIONS',
      `watchdog must be true, false or { idleMs?, probeTimeoutMs? }, got ${String(input)}`,
    )
  }
  return {
    idleMs: assertWatchdogMs('idleMs', input.idleMs ?? WATCHDOG_DEFAULTS.idleMs, WATCHDOG_MIN_IDLE_MS, true),
    probeTimeoutMs: assertWatchdogMs('probeTimeoutMs', input.probeTimeoutMs ?? WATCHDOG_DEFAULTS.probeTimeoutMs, 0, false),
  }
}

/** Mirrors baileys' own keepalive failure, so the close maps to `connection-lost` and reconnects without touching creds. */
export const createWatchdogCloseError = (message: string): ZaileysConnectionError & { output: { statusCode: number } } =>
  Object.assign(new ZaileysConnectionError('CONNECTION_CLOSED', message), {
    output: { statusCode: DisconnectReason.connectionLost },
  })

/** Experimental: probes the server after a quiet spell and reports a session that no longer answers. */
export class ConnectionWatchdog {
  private readonly idleMs: number
  private readonly probeTimeoutMs: number
  private readonly probe: () => Promise<unknown>
  private readonly onDeaf: (info: WatchdogDeafInfo) => void
  private readonly now: () => number
  private readonly timer: WatchdogTimer
  private idleHandle: unknown
  private probeHandle: unknown
  private lastActivityAt = 0
  /** Bumped by start() and stop() so a probe from an earlier run cannot act on this one. */
  private generation = 0
  private running = false
  private probing = false

  constructor(options: ResolvedWatchdogOptions, deps: WatchdogDeps) {
    this.idleMs = options.idleMs
    this.probeTimeoutMs = clampTimerDelay(options.probeTimeoutMs)
    this.probe = deps.probe
    this.onDeaf = deps.onDeaf
    const clock = deps.clock
    this.now = clock ? () => clock.now() : () => Date.now()
    this.timer = deps.timer ?? systemTimer
  }

  get active(): boolean {
    return this.running
  }

  start(): void {
    this.stop()
    this.running = true
    this.generation += 1
    this.lastActivityAt = this.now()
    this.arm(this.idleMs)
  }

  stop(): void {
    this.running = false
    this.probing = false
    this.generation += 1
    this.clearIdle()
    this.clearProbe()
  }

  /** Cheap enough to call on every inbound frame: it records a timestamp and arms nothing. */
  activity(): void {
    if (this.running) this.lastActivityAt = this.now()
  }

  private arm(ms: number): void {
    this.clearIdle()
    this.idleHandle = this.timer.setTimeout(() => {
      this.idleHandle = undefined
      this.check()
    }, clampTimerDelay(ms))
  }

  private check(): void {
    if (!this.running || this.probing) return
    const idle = this.now() - this.lastActivityAt
    if (idle < this.idleMs) {
      this.arm(this.idleMs - idle)
      return
    }
    void this.runProbe(idle)
  }

  private async runProbe(idle: number): Promise<void> {
    const generation = this.generation
    const startedAt = this.now()
    this.probing = true
    let failure: unknown
    let failed = false
    try {
      await new Promise<void>((resolve, reject) => {
        this.probeHandle = this.timer.setTimeout(() => {
          this.probeHandle = undefined
          reject(new Error(`probe timed out after ${this.probeTimeoutMs} ms`))
        }, this.probeTimeoutMs)
        this.probe().then(() => resolve(), reject)
      })
    } catch (err) {
      failed = true
      failure = err
    }
    if (generation !== this.generation) return
    this.clearProbe()
    this.probing = false
    if (!failed || this.lastActivityAt >= startedAt) {
      if (!failed) this.lastActivityAt = this.now()
      this.arm(this.idleMs - (this.now() - this.lastActivityAt))
      return
    }
    this.stop()
    this.onDeaf({ idleMs: idle, error: failure })
  }

  private clearIdle(): void {
    if (this.idleHandle !== undefined) {
      this.timer.clearTimeout(this.idleHandle)
      this.idleHandle = undefined
    }
  }

  private clearProbe(): void {
    if (this.probeHandle !== undefined) {
      this.timer.clearTimeout(this.probeHandle)
      this.probeHandle = undefined
    }
  }
}

/** Structural view of the baileys socket bits the watchdog needs. */
export interface WatchdogSocketLike {
  ws?: unknown
  user?: { id?: unknown } | undefined
  onWhatsApp?: (...jids: string[]) => Promise<unknown>
  end: (error: Error | undefined) => void
}

interface FrameEmitter {
  on: (event: string, fn: (frame: unknown) => void) => void
  off: (event: string, fn: (frame: unknown) => void) => void
}

export interface WatchdogHandle {
  stop: () => void
}

export interface AttachWatchdogDeps {
  logger: Logger
  sessionId: string
  clock?: WatchdogClock
  timer?: WatchdogTimer
}

/** A USync lookup needs a backend answer, unlike the keepalive ping; baileys turns a timeout into `undefined`. */
const probeOwnNumber = async (socket: WatchdogSocketLike, ownJid: string): Promise<void> => {
  const result = await socket.onWhatsApp?.(ownJid)
  if (!Array.isArray(result)) throw new Error('the server did not answer the probe')
}

/** Experimental: ends a WhatsApp Web socket that went deaf; `undefined` when this socket cannot be watched. */
export const attachConnectionWatchdog = (
  socket: WatchdogSocketLike,
  options: ResolvedWatchdogOptions,
  deps: AttachWatchdogDeps,
): WatchdogHandle | undefined => {
  const ws = socket.ws as Partial<FrameEmitter> | undefined
  const ownJid = typeof socket.user?.id === 'string' ? socket.user.id : ''
  const canWatch = typeof ws?.on === 'function' && typeof ws.off === 'function' && typeof socket.onWhatsApp === 'function'
  if (!canWatch || !isPnJid(ownJid)) {
    deps.logger.warn({ sessionId: deps.sessionId }, 'watchdog: this socket cannot be probed; the watchdog stays off')
    return undefined
  }
  const emitter = ws as FrameEmitter
  const watchdog = new ConnectionWatchdog(options, {
    probe: () => probeOwnNumber(socket, ownJid),
    onDeaf: ({ idleMs, error }) => {
      const message = `watchdog: no inbound traffic for ${Math.round(idleMs / 60_000)} min and the probe failed; reconnecting`
      deps.logger.warn({ sessionId: deps.sessionId, idleMs, err: error }, message)
      try {
        socket.end(createWatchdogCloseError(message))
      } catch (err) {
        deps.logger.warn(err, 'watchdog: socket.end threw')
      }
    },
    ...(deps.clock ? { clock: deps.clock } : {}),
    ...(deps.timer ? { timer: deps.timer } : {}),
  })
  const onFrame = (frame: unknown): void => {
    const tag = (frame as { tag?: unknown } | null)?.tag
    if (typeof tag === 'string' && WATCHDOG_ACTIVITY_TAGS.has(tag)) watchdog.activity()
  }
  emitter.on('frame', onFrame)
  watchdog.start()
  return {
    stop: () => {
      watchdog.stop()
      emitter.off('frame', onFrame)
    },
  }
}
