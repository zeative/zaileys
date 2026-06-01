import { BufferJSON } from 'baileys'
import type { Chat, Contact, PresenceData, WAMessage, WAMessageKey } from 'baileys'
import type { RedisClientType } from 'redis'
import { ZaileysStoreError } from '../../types/store-error.js'
import type { BaileysSocketLike, MessageStore, MessageStoreListOptions } from '../types.js'

export interface RedisMessageStoreOptions {
  client?: RedisClientType
  url?: string
  namespace?: string
}

const DEFAULT_NAMESPACE = 'zaileys'
const PRESENCE_TTL_SECONDS = 300
const SCAN_BATCH = 1000

type Listener = (...args: unknown[]) => void

const encodeMember = (key: WAMessageKey): string =>
  `${key.id ?? ''}|${key.fromMe ? 1 : 0}`

const isPeerMissingError = (err: unknown): boolean => {
  if (typeof err !== 'object' || err === null) return false
  const code = (err as { code?: string }).code
  return code === 'ERR_MODULE_NOT_FOUND' || code === 'MODULE_NOT_FOUND'
}

export class RedisMessageStore implements MessageStore {
  private readonly namespace: string
  private readonly externalClient: RedisClientType | undefined
  private readonly url: string | undefined
  private ownedClient: RedisClientType | undefined
  private ready: Promise<RedisClientType> | undefined
  private closed = false
  private boundSocket: BaileysSocketLike | undefined
  private readonly listeners: Map<string, Listener> = new Map()

  constructor(options: RedisMessageStoreOptions) {
    if (options.client && options.url) {
      throw new ZaileysStoreError(
        'STORE_CONNECTION_FAILED',
        'pass either client OR url, not both',
      )
    }
    if (!options.client && !options.url) {
      throw new ZaileysStoreError(
        'STORE_CONNECTION_FAILED',
        'RedisMessageStore requires either client or url',
      )
    }
    this.namespace = options.namespace ?? DEFAULT_NAMESPACE
    this.externalClient = options.client
    this.url = options.url
  }

  async saveMessage(message: WAMessage): Promise<void> {
    this.assertOpen()
    const client = await this.ensureReady()
    const jid = message.key.remoteJid ?? ''
    const member = encodeMember(message.key)
    const timestamp = Number(message.messageTimestamp ?? 0)
    const payload = JSON.stringify(message, BufferJSON.replacer)
    const multi = client.multi()
    multi.zAdd(this.msgIndexKey(jid), { score: timestamp, value: member })
    multi.hSet(this.msgDataKey(jid), member, payload)
    await this.runWrite(() => multi.exec())
  }

  async getMessage(key: WAMessageKey): Promise<WAMessage | undefined> {
    this.assertOpen()
    const client = await this.ensureReady()
    const jid = key.remoteJid ?? ''
    const raw = await this.runRead(() => client.hGet(this.msgDataKey(jid), encodeMember(key)))
    if (raw == null) return undefined
    return JSON.parse(raw, BufferJSON.reviver) as WAMessage
  }

  async listMessages(jid: string, options?: MessageStoreListOptions): Promise<WAMessage[]> {
    this.assertOpen()
    const client = await this.ensureReady()
    const limit = options?.limit ?? 100
    const max = typeof options?.before === 'number' ? `(${options.before}` : '+inf'
    const members = await this.runRead(() =>
      client.zRangeByScore(this.msgIndexKey(jid), '-inf', max, {
        LIMIT: { offset: 0, count: limit + 1024 },
      }),
    )
    if (members.length === 0) return []
    const ordered = [...members].reverse()
    const sliced = ordered.slice(0, limit)
    const raws = await this.runRead(() => client.hmGet(this.msgDataKey(jid), sliced))
    const out: WAMessage[] = []
    for (const raw of raws) {
      if (raw == null) continue
      out.push(JSON.parse(raw, BufferJSON.reviver) as WAMessage)
    }
    return out
  }

  async saveChat(chat: Chat): Promise<void> {
    this.assertOpen()
    const id = (chat as { id?: string | null }).id
    if (!id) return
    const client = await this.ensureReady()
    const multi = client.multi()
    multi.hSet(this.chatsKey(), id, JSON.stringify(chat, BufferJSON.replacer))
    if ((chat as { archived?: boolean }).archived === true) {
      multi.sAdd(this.chatsArchiveKey(), id)
    } else {
      multi.sRem(this.chatsArchiveKey(), id)
    }
    await this.runWrite(() => multi.exec())
  }

  async getChat(jid: string): Promise<Chat | undefined> {
    this.assertOpen()
    const client = await this.ensureReady()
    const raw = await this.runRead(() => client.hGet(this.chatsKey(), jid))
    if (raw == null) return undefined
    return JSON.parse(raw, BufferJSON.reviver) as Chat
  }

  async listChats(options?: { archived?: boolean }): Promise<Chat[]> {
    this.assertOpen()
    const client = await this.ensureReady()
    if (options?.archived === true) {
      const ids = await this.runRead(() => client.sMembers(this.chatsArchiveKey()))
      if (ids.length === 0) return []
      const raws = await this.runRead(() => client.hmGet(this.chatsKey(), ids))
      const out: Chat[] = []
      for (const raw of raws) {
        if (raw == null) continue
        out.push(JSON.parse(raw, BufferJSON.reviver) as Chat)
      }
      return out
    }
    const all = await this.runRead(() => client.hGetAll(this.chatsKey()))
    const out: Chat[] = []
    for (const id of Object.keys(all)) {
      const raw = all[id]
      if (raw == null) continue
      const chat = JSON.parse(raw, BufferJSON.reviver) as Chat
      if (options?.archived === false) {
        const archived = await this.runRead(() => client.sIsMember(this.chatsArchiveKey(), id))
        if (archived) continue
      }
      out.push(chat)
    }
    return out
  }

  async saveContact(contact: Contact): Promise<void> {
    this.assertOpen()
    const client = await this.ensureReady()
    await this.runWrite(() =>
      client.hSet(this.contactsKey(), contact.id, JSON.stringify(contact, BufferJSON.replacer)),
    )
  }

  async getContact(jid: string): Promise<Contact | undefined> {
    this.assertOpen()
    const client = await this.ensureReady()
    const raw = await this.runRead(() => client.hGet(this.contactsKey(), jid))
    if (raw == null) return undefined
    return JSON.parse(raw, BufferJSON.reviver) as Contact
  }

  async listContacts(): Promise<Contact[]> {
    this.assertOpen()
    const client = await this.ensureReady()
    const all = await this.runRead(() => client.hGetAll(this.contactsKey()))
    const out: Contact[] = []
    for (const id of Object.keys(all)) {
      const raw = all[id]
      if (raw == null) continue
      out.push(JSON.parse(raw, BufferJSON.reviver) as Contact)
    }
    return out
  }

  async savePresence(jid: string, presence: PresenceData): Promise<void> {
    this.assertOpen()
    const client = await this.ensureReady()
    await this.runWrite(() =>
      client.set(this.presenceKey(jid), JSON.stringify(presence, BufferJSON.replacer), {
        EX: PRESENCE_TTL_SECONDS,
      }),
    )
  }

  async getPresence(jid: string): Promise<PresenceData | undefined> {
    this.assertOpen()
    const client = await this.ensureReady()
    const raw = await this.runRead(() => client.get(this.presenceKey(jid)))
    if (raw == null) return undefined
    return JSON.parse(raw, BufferJSON.reviver) as PresenceData
  }

  bind(socket: BaileysSocketLike): void {
    this.assertOpen()
    if (this.boundSocket && this.boundSocket.ev.off) {
      for (const [event, handler] of this.listeners) {
        this.boundSocket.ev.off(event, handler)
      }
    }
    this.listeners.clear()
    this.boundSocket = socket
    const messagesUpsert: Listener = (...args: unknown[]) => {
      const payload = args[0] as { messages?: WAMessage[] } | undefined
      const list = payload?.messages
      if (!Array.isArray(list)) return
      for (const m of list) void this.saveMessage(m).catch(() => undefined)
    }
    const chatsUpsert: Listener = (...args: unknown[]) => {
      const list = args[0] as Chat[] | undefined
      if (!Array.isArray(list)) return
      for (const c of list) void this.saveChat(c).catch(() => undefined)
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
    this.listeners.set('chats.upsert', chatsUpsert)
    this.listeners.set('contacts.upsert', contactsUpsert)
    this.listeners.set('presence.update', presenceUpdate)
    for (const [event, handler] of this.listeners) {
      socket.ev.on(event, handler)
    }
  }

  async clear(): Promise<void> {
    this.assertOpen()
    const client = await this.ensureReady()
    const match = `${this.namespace}:*`
    let cursor = 0
    do {
      const result = await this.runRead(() =>
        client.scan(cursor, { MATCH: match, COUNT: SCAN_BATCH }),
      )
      cursor = Number(result.cursor)
      if (result.keys.length > 0) {
        await this.runWrite(() => client.del(result.keys))
      }
    } while (cursor !== 0)
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
    if (this.ownedClient) {
      try {
        await this.ownedClient.quit()
      } catch {
        void 0
      }
      this.ownedClient = undefined
    }
    this.ready = undefined
  }

  private msgIndexKey(jid: string): string {
    return `${this.namespace}:msg:${jid}`
  }

  private msgDataKey(jid: string): string {
    return `${this.namespace}:msg-data:${jid}`
  }

  private chatsKey(): string {
    return `${this.namespace}:chats`
  }

  private chatsArchiveKey(): string {
    return `${this.namespace}:chats-archived`
  }

  private contactsKey(): string {
    return `${this.namespace}:contacts`
  }

  private presenceKey(jid: string): string {
    return `${this.namespace}:presence:${jid}`
  }

  private async ensureReady(): Promise<RedisClientType> {
    if (!this.ready) {
      this.ready = this.connect()
    }
    return this.ready
  }

  private async connect(): Promise<RedisClientType> {
    if (this.externalClient) {
      if (!this.externalClient.isOpen) {
        throw new ZaileysStoreError(
          'STORE_CONNECTION_FAILED',
          'provided redis client is not open (call await client.connect() first)',
        )
      }
      return this.externalClient
    }
    let mod: typeof import('redis')
    try {
      mod = await import('redis')
    } catch (err) {
      if (isPeerMissingError(err)) {
        throw new ZaileysStoreError(
          'STORE_NOT_AVAILABLE',
          'redis peer dependency missing. Run: pnpm add redis',
          { cause: err },
        )
      }
      throw new ZaileysStoreError(
        'STORE_CONNECTION_FAILED',
        'failed to load redis module',
        { cause: err },
      )
    }
    const created = mod.createClient({ url: this.url! }) as RedisClientType
    try {
      await created.connect()
    } catch (err) {
      throw new ZaileysStoreError(
        'STORE_CONNECTION_FAILED',
        `failed to connect to redis at ${this.url}`,
        { cause: err },
      )
    }
    this.ownedClient = created
    return created
  }

  private async runRead<T>(fn: () => Promise<T>): Promise<T> {
    try {
      return await fn()
    } catch (err) {
      throw new ZaileysStoreError('STORE_READ_FAILED', 'redis read failed', { cause: err })
    }
  }

  private async runWrite<T>(fn: () => Promise<T>): Promise<T> {
    try {
      return await fn()
    } catch (err) {
      throw new ZaileysStoreError('STORE_WRITE_FAILED', 'redis write failed', { cause: err })
    }
  }

  private assertOpen(): void {
    if (this.closed) {
      throw new ZaileysStoreError('STORE_CLOSED', 'RedisMessageStore is closed')
    }
  }
}
