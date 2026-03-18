import type { WASocket } from '@whiskeysockets/baileys'

/**
 * Manages automated presence and read receipt effects.
 */
export class PresenceManager {
  constructor(private socket: WASocket) {}

  /**
   * Simulate typing or recording.
   */
  async simulate(jid: string, type: 'composing' | 'recording', duration: number = 2000) {
    await this.socket.sendPresenceUpdate(type, jid)
    await new Promise(resolve => setTimeout(resolve, duration))
    await this.socket.sendPresenceUpdate('paused', jid)
  }

  /**
   * Mark message as read.
   */
  async read(jid: string, participant: string, messageId: string) {
    await this.socket.readMessages([{ remoteJid: jid, id: messageId, participant }])
  }
}
