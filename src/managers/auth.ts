import EventEmitter from 'eventemitter3'
import { useMultiFileAuthState } from 'baileys'

/**
 * Handles unified authentication (QR/Pairing).
 */
export class AuthHandler extends EventEmitter {
  constructor(private sessionId: string, private sessionPath: string) {
    super()
  }

  /**
   * Get Baileys auth state.
   */
  async getAuthState() {
    return useMultiFileAuthState(this.sessionPath)
  }

  /**
   * Handle connection updates and emit specialized events.
   */
  handleUpdate(update: any) {
    const { connection, lastDisconnect, qr } = update

    if (qr) {
      this.emit('qr', qr)
    }

    if (connection === 'connecting') {
      this.emit('connecting')
    }

    if (connection === 'open') {
      this.emit('ready')
    }

    if (connection === 'close') {
      this.emit('close', lastDisconnect?.error)
    }
  }
}
