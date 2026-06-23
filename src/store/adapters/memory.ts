import type { Chat, Contact, PresenceData, WAMessage, WAMessageKey } from 'baileys'
import { ZaileysStoreError } from '../../types/store-error.js'
import type { BaileysSocketLike, MessageStore, MessageStoreListOptions, PruneOptions } from '../types.js'

type Listener = (...args: unknown[]) => void

const encodeKey = (key: WAMessageKey): string =>
  `${key.remoteJid ?? ''}|${key.id ?? ''}|${key.fromMe ? 1 : 0}`

export class MemoryMessageStore implements MessageStore {
  private readonly messages: Map<string, WAMessage> = new Map()
  private readonly messagesByJid: Map<string, Set<string>> = new Map()
  private readonly chats: Map<string, Chat> = new Map()
  private readonly contacts: Map<string, Contact> = new Map()
  private readonly presence: Map<string, PresenceData> = new Map()
  private boundSocket: BaileysSocketLike | undefined
  private readonly listeners: Map<string, Listener> = new Map()
  private closed = false

  async saveMessage(message: WAMessage): Promise<void> {
    this.assertOpen()
    const k = encodeKey(message.key)
    this.messages.set(k, structuredClone(message))
    const jid = message.key.remoteJid ?? ''
    let bucket = this.messagesByJid.get(jid)
    if (!bucket) {
      bucket = new Set<string>()
      this.messagesByJid.set(jid, bucket)
    }
    bucket.add(k)
  }

  async getMessage(key: WAMessageKey): Promise<WAMessage | undefined> {
    this.assertOpen()
    const found = this.messages.get(encodeKey(key))
    return found ? structuredClone(found) : undefined
  }

  async listMessages(jid: string, options?: MessageStoreListOptions): Promise<WAMessage[]> {
    this.assertOpen()
    const bucket = this.messagesByJid.get(jid)
    if (!bucket) return []
    const collected: WAMessage[] = []
    for (const k of bucket) {
      const m = this.messages.get(k)
      if (m) collected.push(m)
    }
    collected.sort((a, b) => Number(b.messageTimestamp) - Number(a.messageTimestamp))
    let filtered = collected
    if (typeof options?.before === 'number') {
      const before = options.before
      filtered = filtered.filter((m) => Number(m.messageTimestamp) < before)
    }
    if (typeof options?.limit === 'number') {
      filtered = filtered.slice(0, options.limit)
    }
    return filtered.map((m) => structuredClone(m))
  }

  async saveChat(chat: Chat): Promise<void> {
    this.assertOpen()
    const id = (chat as { id?: string | null }).id
    if (!id) return
    this.chats.set(id, structuredClone(chat))
  }

  async getChat(jid: string): Promise<Chat | undefined> {
    this.assertOpen()
    const found = this.chats.get(jid)
    return found ? structuredClone(found) : undefined
  }

  async listChats(options?: { archived?: boolean }): Promise<Chat[]> {
    this.assertOpen()
    const out: Chat[] = []
    for (const c of this.chats.values()) {
      if (options?.archived === true && (c as { archived?: boolean }).archived !== true) continue
      out.push(structuredClone(c))
    }
    return out
  }

  async saveContact(contact: Contact): Promise<void> {
    this.assertOpen()
    this.contacts.set(contact.id, structuredClone(contact))
  }

  async getContact(jid: string): Promise<Contact | undefined> {
    this.assertOpen()
    const found = this.contacts.get(jid)
    return found ? structuredClone(found) : undefined
  }

  async listContacts(): Promise<Contact[]> {
    this.assertOpen()
    return Array.from(this.contacts.values(), (c) => structuredClone(c))
  }

  async savePresence(jid: string, presence: PresenceData): Promise<void> {
    this.assertOpen()
    this.presence.set(jid, structuredClone(presence))
  }

  async getPresence(jid: string): Promise<PresenceData | undefined> {
    this.assertOpen()
    const found = this.presence.get(jid)
    return found ? structuredClone(found) : undefined
  }

  bind(socket: BaileysSocketLike): void {
    this.assertOpen()
    this.boundSocket = socket
    const messagesUpsert: Listener = (...args: unknown[]) => {
      const payload = args[0] as { messages?: WAMessage[] } | undefined
      const list = payload?.messages
      if (!Array.isArray(list)) return
      for (const m of list) {
        void this.saveMessage(m).catch(() => undefined)
      }
    }
    const messagesUpdate: Listener = (...args: unknown[]) => {
      const updates = args[0] as Array<{ key: WAMessageKey; update: Partial<WAMessage> }> | undefined
      if (!Array.isArray(updates)) return
      for (const u of updates) {
        const existing = this.messages.get(encodeKey(u.key))
        if (existing) {
          const merged = { ...existing, ...u.update } as WAMessage
          void this.saveMessage(merged).catch(() => undefined)
        }
      }
    }
    const chatsUpsert: Listener = (...args: unknown[]) => {
      const list = args[0] as Chat[] | undefined
      if (!Array.isArray(list)) return
      for (const c of list) void this.saveChat(c).catch(() => undefined)
    }
    const chatsUpdate: Listener = (...args: unknown[]) => {
      const list = args[0] as Array<Partial<Chat> & { id: string }> | undefined
      if (!Array.isArray(list)) return
      for (const c of list) {
        const existing = this.chats.get(c.id)
        const merged = { ...(existing ?? {}), ...c } as Chat
        void this.saveChat(merged).catch(() => undefined)
      }
    }
    const contactsUpsert: Listener = (...args: unknown[]) => {
      const list = args[0] as Contact[] | undefined
      if (!Array.isArray(list)) return
      for (const c of list) void this.saveContact(c).catch(() => undefined)
    }
    const presenceUpdate: Listener = (...args: unknown[]) => {
      const payload = args[0] as { id?: string; presences?: Record<string, PresenceData> } | undefined
      if (!payload?.presences) return
      for (const jid of Object.keys(payload.presences)) {
        const p = payload.presences[jid]
        if (p) void this.savePresence(jid, p).catch(() => undefined)
      }
    }
    this.listeners.set('messages.upsert', messagesUpsert)
    this.listeners.set('messages.update', messagesUpdate)
    this.listeners.set('chats.upsert', chatsUpsert)
    this.listeners.set('chats.update', chatsUpdate)
    this.listeners.set('contacts.upsert', contactsUpsert)
    this.listeners.set('presence.update', presenceUpdate)
    for (const [event, handler] of this.listeners) {
      socket.ev.on(event, handler)
    }
  }

  async deleteMessage(key: WAMessageKey): Promise<void> {
    this.assertOpen()
    const k = encodeKey(key)
    this.messages.delete(k)
    const jid = key.remoteJid ?? ''
    const bucket = this.messagesByJid.get(jid)
    if (bucket) {
      bucket.delete(k)
      if (bucket.size === 0) this.messagesByJid.delete(jid)
    }
  }

  async pruneMessages(opts: PruneOptions): Promise<number> {
    this.assertOpen()
    let removed = 0
    for (const [jid, bucket] of [...this.messagesByJid.entries()]) {
      if (opts.chatFilter && !opts.chatFilter(jid)) continue
      const msgs: WAMessage[] = []
      for (const k of bucket) {
        const m = this.messages.get(k)
        if (m) msgs.push(m)
      }
      msgs.sort((a, b) => Number(b.messageTimestamp ?? 0) - Number(a.messageTimestamp ?? 0))
      const victims = msgs.filter((m, idx) => {
        const ts = Number(m.messageTimestamp ?? 0)
        if (opts.olderThan !== undefined && ts < opts.olderThan) return true
        if (opts.maxPerChat !== undefined && idx >= opts.maxPerChat) return true
        return false
      })
      for (const m of victims) {
        await this.deleteMessage(m.key)
        removed += 1
      }
    }
    return removed
  }

  async clear(): Promise<void> {
    this.assertOpen()
    this.messages.clear()
    this.messagesByJid.clear()
    this.chats.clear()
    this.contacts.clear()
    this.presence.clear()
  }

  async close(): Promise<void> {
    if (this.closed) return
    this.closed = true
    if (this.boundSocket?.ev.off) {
      for (const [event, handler] of this.listeners) {
        this.boundSocket.ev.off(event, handler)
      }
    }
    this.listeners.clear()
    this.boundSocket = undefined
    return Promise.resolve()
  }

  private assertOpen(): void {
    if (this.closed) {
      throw new ZaileysStoreError('STORE_CLOSED', 'MemoryMessageStore is closed')
    }
  }
}
