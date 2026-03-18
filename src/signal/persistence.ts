import { msgStore } from '../store/namespaces'
import type { WASocket } from 'baileys'

/**
 * Ensures outgoing signals are persisted and can be re-sent if failed.
 */
export class SignalPersistence {
  constructor(private socket: WASocket) {}

  /**
   * Queue a message for sending.
   */
  async queue(jid: string, content: any, options: any = {}) {
    const id = options.messageId || Math.random().toString(36).substring(7)
    
    // Store in persistence
    msgStore.set(id, { jid, content, options, status: 'pending' })

    try {
      const result = await this.socket.sendMessage(jid, content, options)
      msgStore.set(id, { ...msgStore.get(id), status: 'sent', result })
      return result
    } catch (err) {
      msgStore.set(id, { ...msgStore.get(id), status: 'failed', error: err })
      throw err
    }
  }

  /**
   * Get all failed messages.
   */
  getFailed() {
    return Array.from(msgStore.all().entries())
      .filter(([_, data]) => data.value.status === 'failed')
      .map(([id, data]) => ({ id, ...data.value }))
  }
}
