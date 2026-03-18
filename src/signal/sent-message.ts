import type { MessageActions } from '../types/context'

/**
 * Fluent abstraction for a message that was just sent.
 * Allows chainable follow-ups like .edit(), .delete(), and .react().
 */
export class SentMessage {
  constructor(
    public readonly jid: string,
    public readonly id: string,
    private actions: MessageActions
  ) {}

  async edit(newText: string) {
    return this.actions.send({
      edit: { id: this.id, remoteJid: this.jid },
      text: newText
    })
  }

  async delete() {
    return this.actions.send({
      delete: { id: this.id, remoteJid: this.jid }
    })
  }

  async react(emoji: string) {
    return this.actions.send({
      react: { text: emoji, key: { id: this.id, remoteJid: this.jid } }
    })
  }
}
