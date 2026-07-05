import type { WAMessageKey } from 'baileys'
import { ZaileysDomainError } from './errors.js'
import type { DomainSocketLike } from './socket-like.js'

export type LastMessage = { key: WAMessageKey; messageTimestamp: number }
export type LastMessageResolver = (jid: string) => Promise<LastMessage[]>

const requireRemoteJid = (key: WAMessageKey): string => {
  if (typeof key.remoteJid !== 'string' || key.remoteJid.length === 0) {
    throw new ZaileysDomainError('OPERATION_FAILED', 'message key is missing remoteJid')
  }
  return key.remoteJid
}

export class ChatModule {
  constructor(
    private readonly getSocket: () => DomainSocketLike | undefined,
    private readonly resolveLast?: LastMessageResolver,
  ) {}

  protected requireSocket(): DomainSocketLike {
    const socket = this.getSocket()
    if (!socket) {
      throw new ZaileysDomainError('NOT_CONNECTED', 'client not connected')
    }
    return socket
  }

  private async last(jid: string): Promise<LastMessage[]> {
    return (await this.resolveLast?.(jid)) ?? []
  }

  async archive(jid: string): Promise<void> {
    await this.requireSocket().chatModify({ archive: true, lastMessages: await this.last(jid) }, jid)
  }

  async unarchive(jid: string): Promise<void> {
    await this.requireSocket().chatModify({ archive: false, lastMessages: await this.last(jid) }, jid)
  }

  async pin(jid: string): Promise<void> {
    await this.requireSocket().chatModify({ pin: true }, jid)
  }

  async unpin(jid: string): Promise<void> {
    await this.requireSocket().chatModify({ pin: false }, jid)
  }

  /** Mute for `durationMs` (e.g. 8h = 28_800_000). Omit to mute indefinitely. */
  async mute(jid: string, durationMs?: number): Promise<void> {
    await this.requireSocket().chatModify({ mute: durationMs ?? Date.now() + 365 * 24 * 60 * 60 * 1000 }, jid)
  }

  async unmute(jid: string): Promise<void> {
    await this.requireSocket().chatModify({ mute: null }, jid)
  }

  async markRead(jid: string): Promise<void> {
    const lastMessages = await this.last(jid)
    if (lastMessages.length === 0) return
    await this.requireSocket().chatModify({ markRead: true, lastMessages }, jid)
  }

  async markUnread(jid: string): Promise<void> {
    const lastMessages = await this.last(jid)
    if (lastMessages.length === 0) return
    await this.requireSocket().chatModify({ markRead: false, lastMessages }, jid)
  }

  async star(key: WAMessageKey, starred = true): Promise<void> {
    const jid = requireRemoteJid(key)
    await this.requireSocket().chatModify(
      { star: { messages: [{ id: key.id ?? '', fromMe: key.fromMe === true }], star: starred } },
      jid,
    )
  }

  async unstar(key: WAMessageKey): Promise<void> {
    await this.star(key, false)
  }

  async delete(jid: string): Promise<void> {
    await this.requireSocket().chatModify({ delete: true, lastMessages: await this.last(jid) }, jid)
  }

  async clear(jid: string): Promise<void> {
    await this.requireSocket().chatModify({ clear: true, lastMessages: await this.last(jid) }, jid)
  }
}
