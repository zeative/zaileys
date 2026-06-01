import { ZaileysAutomationError } from './errors.js'

export type WAPresence = 'unavailable' | 'available' | 'composing' | 'recording' | 'paused'

export interface AutomationSocketLike {
  sendPresenceUpdate(type: WAPresence, toJid?: string): Promise<void>
}

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
