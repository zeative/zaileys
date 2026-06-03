import { ZaileysAutomationError } from './errors.js'

export type WAPresence = 'unavailable' | 'available' | 'composing' | 'recording' | 'paused'

export interface AutomationSocketLike {
  sendPresenceUpdate(type: WAPresence, toJid?: string): Promise<void>
}

/** Drops presence updates that repeat the same (type, chat) inside `minIntervalMs`. */
export interface PresenceThrottleOptions {
  enabled?: boolean
  minIntervalMs?: number
}

export type PresenceClock = { now?: () => number }

const DEFAULT_MIN_INTERVAL_MS = 1000

export class PresenceModule {
  private readonly throttleEnabled: boolean
  private readonly minIntervalMs: number
  private readonly now: () => number
  private readonly lastSent = new Map<string, number>()

  constructor(
    private readonly getSocket: () => AutomationSocketLike | undefined,
    throttle?: PresenceThrottleOptions,
    clock?: PresenceClock,
  ) {
    this.throttleEnabled = throttle?.enabled ?? true
    this.minIntervalMs = throttle?.minIntervalMs ?? DEFAULT_MIN_INTERVAL_MS
    this.now = clock?.now ?? Date.now
  }

  protected requireSocket(): AutomationSocketLike {
    const socket = this.getSocket()
    if (!socket) {
      throw new ZaileysAutomationError('NOT_CONNECTED', 'client not connected')
    }
    return socket
  }

  private throttled(type: WAPresence, jid?: string): boolean {
    if (!this.throttleEnabled || this.minIntervalMs <= 0) return false
    const key = `${type}:${jid ?? 'global'}`
    const prev = this.lastSent.get(key)
    const ts = this.now()
    if (prev !== undefined && ts - prev < this.minIntervalMs) return true
    this.lastSent.set(key, ts)
    return false
  }

  private async update(type: WAPresence, jid?: string): Promise<void> {
    const socket = this.requireSocket()
    if (this.throttled(type, jid)) return
    try {
      await (jid === undefined ? socket.sendPresenceUpdate(type) : socket.sendPresenceUpdate(type, jid))
    } catch (err) {
      throw new ZaileysAutomationError('PRESENCE_FAILED', `presence update '${type}' failed`, {
        cause: err,
      })
    }
  }

  private scheduleClear(jid: string, ms: number): void {
    const socket = this.getSocket()
    if (!socket) return
    const timer = setTimeout(() => {
      void socket.sendPresenceUpdate('paused', jid).catch(() => undefined)
    }, ms)
    if (typeof timer.unref === 'function') timer.unref()
  }

  async online(): Promise<void> {
    await this.update('available')
  }

  async offline(): Promise<void> {
    await this.update('unavailable')
  }

  async typing(jid: string, ms?: number): Promise<void> {
    await this.update('composing', jid)
    if (ms !== undefined) this.scheduleClear(jid, ms)
  }

  async recording(jid: string, ms?: number): Promise<void> {
    await this.update('recording', jid)
    if (ms !== undefined) this.scheduleClear(jid, ms)
  }
}
