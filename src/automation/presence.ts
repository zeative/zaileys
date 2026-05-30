import { ZaileysAutomationError } from './errors.js'

/**
 * Presence states accepted by the underlying socket, mirroring baileys'
 * `WAPresence`. `available`/`unavailable` are global; `composing`/`recording`/
 * `paused` target a specific chat jid.
 */
export type WAPresence = 'unavailable' | 'available' | 'composing' | 'recording' | 'paused'

/**
 * Structural subset of the baileys socket consumed by {@link PresenceModule}.
 * Declared independently of the Phase 3 socket type so the module stays
 * decoupled and testable with a mock.
 */
export interface AutomationSocketLike {
  sendPresenceUpdate(type: WAPresence, toJid?: string): Promise<void>
}

/**
 * Typed wrapper over the baileys presence API, exposed as `client.presence`.
 * Every call funnels through {@link PresenceModule.requireSocket} which throws
 * `NOT_CONNECTED` when the client socket is absent, and wraps a rejecting
 * socket in `PRESENCE_FAILED`.
 *
 * `typing`/`recording` accept an optional `ms` after which presence is
 * auto-cleared back to `paused` for the same jid; the auto-clear runs on a
 * fire-and-forget timer and never rejects the originating call.
 */
export class PresenceModule {
  constructor(private readonly getSocket: () => AutomationSocketLike | undefined) {}

  protected requireSocket(): AutomationSocketLike {
    const socket = this.getSocket()
    if (!socket) {
      throw new ZaileysAutomationError('NOT_CONNECTED', 'client not connected')
    }
    return socket
  }

  private async update(type: WAPresence, jid?: string): Promise<void> {
    const socket = this.requireSocket()
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

  /** Mark the account globally available (online). */
  async online(): Promise<void> {
    await this.update('available')
  }

  /** Mark the account globally unavailable (offline). */
  async offline(): Promise<void> {
    await this.update('unavailable')
  }

  /**
   * Signal `composing` to `jid`. When `ms` is supplied the presence is
   * auto-cleared to `paused` after that delay.
   */
  async typing(jid: string, ms?: number): Promise<void> {
    await this.update('composing', jid)
    if (ms !== undefined) this.scheduleClear(jid, ms)
  }

  /**
   * Signal `recording` to `jid`. When `ms` is supplied the presence is
   * auto-cleared to `paused` after that delay.
   */
  async recording(jid: string, ms?: number): Promise<void> {
    await this.update('recording', jid)
    if (ms !== undefined) this.scheduleClear(jid, ms)
  }
}
