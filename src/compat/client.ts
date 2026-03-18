import { warnOnce } from './warning'

/**
 * Mixin or Wrapper that adds V3-compatible methods to the Zaileys client.
 */
export class CompatWrapper {
  constructor(private client: any) {}

  /**
   * V3: wa.sendText(jid, text, options)
   */
  async sendText(jid: string, text: string, options: any = {}) {
    warnOnce('wa.sendText', 'wa.sendText() is deprecated. Use wa.send(jid, text) instead.')
    return this.client.socket.sendMessage(jid, { text }, options)
  }

  /**
   * V3: wa.reply(jid, text, quoted, options)
   */
  async reply(jid: string, text: string, quoted: any, options: any = {}) {
    warnOnce('wa.reply', 'wa.reply() is deprecated. Use wa.send(jid, text, { quoted }) instead.')
    return this.client.socket.sendMessage(jid, { text }, { quoted, ...options })
  }

  /**
   * V3: wa.sendReaction(jid, emoji, key)
   */
  async sendReaction(jid: string, emoji: string, key: any) {
    warnOnce('wa.sendReaction', 'wa.sendReaction() is deprecated. Use wa.send(jid, reaction(emoji, key)) instead.')
    return this.client.socket.sendMessage(jid, { reaction: { text: emoji, key } })
  }
}
