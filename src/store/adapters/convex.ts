import { BufferJSON } from 'baileys'
import type { Chat, Contact, PresenceData, WAMessage, WAMessageKey } from 'baileys'
import { ConvexKv, type ConvexKvOptions, type ConvexKvRow } from '../../types/convex.js'
import { ZaileysStoreError } from '../../types/store-error.js'
import type { BaileysSocketLike, MessageStore, MessageStoreListOptions, ScheduledJobRecord } from '../types.js'

/** Constructor input for {@link ConvexMessageStore}. */
export type ConvexMessageStoreOptions = ConvexKvOptions

type Listener = (...args: unknown[]) => void

const MSG = 'msg:'
const CHAT = 'chat:'
const CONTACT = 'contact:'
const PRESENCE = 'presence:'
const JOB = 'job:'

const member = (key: WAMessageKey): string => `${key.id ?? ''}|${key.fromMe ? 1 : 0}`
const msgKey = (key: WAMessageKey): string => `${MSG}${key.remoteJid ?? ''}:${member(key)}`
const encode = (value: unknown): string => JSON.stringify(value, BufferJSON.replacer)
const decode = <T>(raw: string): T => JSON.parse(raw, BufferJSON.reviver) as T

/**
 * Convex-backed `MessageStore`. Persists messages/chats/contacts/presence/jobs as
 * `BufferJSON`-serialized rows in the user-deployed `zaileys_kv` table via a
 * {@link ConvexKv} client (`url` XOR `client`). Messages carry `sortKey =
 * messageTimestamp` so `listMessages` returns newest-first with `before` paging.
 *
 * Requires the `zaileys_kv` schema + functions deployed in the Convex project
 * (template under `docs/convex/`). `convex` is an optional peer dependency.
 */
export class ConvexMessageStore implements MessageStore {
  private readonly kv: ConvexKv
  private closed = false
  private boundSocket: BaileysSocketLike | undefined
  private readonly listeners: Map<string, Listener> = new Map()

  constructor(options: ConvexMessageStoreOptions) {
    this.kv = new ConvexKv(options)
  }

  /** Persist a single WAMessage with `sortKey = messageTimestamp`. */
  async saveMessage(message: WAMessage): Promise<void> {
    this.assertOpen()
    await this.kv.set([{ key: msgKey(message.key), value: encode(message), sortKey: Number(message.messageTimestamp ?? 0) }])
  }

  /** Look up a message by Baileys key. */
  async getMessage(key: WAMessageKey): Promise<WAMessage | undefined> {
    this.assertOpen()
    const found = await this.kv.get([msgKey(key)])
    const raw = found.get(msgKey(key))
    return raw === undefined ? undefined : decode<WAMessage>(raw)
  }

  /** List messages for a jid, newest-first, honouring `limit` + `before`. */
  async listMessages(jid: string, options?: MessageStoreListOptions): Promise<WAMessage[]> {
    this.assertOpen()
    const listOpts: { before?: number; limit?: number } = {}
    if (typeof options?.before === 'number') listOpts.before = options.before
    if (typeof options?.limit === 'number') listOpts.limit = options.limit
    const rows = await this.kv.list(`${MSG}${jid}:`, listOpts)
    return rows.map((r) => decode<WAMessage>(r.value))
  }

  /** Persist or update a chat record. */
  async saveChat(chat: Chat): Promise<void> {
    this.assertOpen()
    const id = (chat as { id?: string | null }).id
    if (!id) return
    await this.kv.set([{ key: `${CHAT}${id}`, value: encode(chat) }])
  }

  /** Fetch a chat by jid. */
  async getChat(jid: string): Promise<Chat | undefined> {
    this.assertOpen()
    const found = await this.kv.get([`${CHAT}${jid}`])
    const raw = found.get(`${CHAT}${jid}`)
    return raw === undefined ? undefined : decode<Chat>(raw)
  }

  /** List chats, optionally filtered by archived flag. */
  async listChats(options?: { archived?: boolean }): Promise<Chat[]> {
    this.assertOpen()
    const rows = await this.kv.list(CHAT)
    const out: Chat[] = []
    for (const r of rows) {
      const chat = decode<Chat>(r.value)
      const archived = (chat as { archived?: boolean }).archived === true
      if (options?.archived === true && !archived) continue
      if (options?.archived === false && archived) continue
      out.push(chat)
    }
    return out
  }

  /** Persist or update a contact. */
  async saveContact(contact: Contact): Promise<void> {
    this.assertOpen()
    await this.kv.set([{ key: `${CONTACT}${contact.id}`, value: encode(contact) }])
  }

  /** Fetch a contact by jid. */
  async getContact(jid: string): Promise<Contact | undefined> {
    this.assertOpen()
    const found = await this.kv.get([`${CONTACT}${jid}`])
    const raw = found.get(`${CONTACT}${jid}`)
    return raw === undefined ? undefined : decode<Contact>(raw)
  }

  /** List every saved contact. */
  async listContacts(): Promise<Contact[]> {
    this.assertOpen()
    const rows = await this.kv.list(CONTACT)
    return rows.map((r) => decode<Contact>(r.value))
  }

  /** Record latest presence for a jid. */
  async savePresence(jid: string, presence: PresenceData): Promise<void> {
    this.assertOpen()
    await this.kv.set([{ key: `${PRESENCE}${jid}`, value: encode(presence) }])
  }

  /** Fetch latest presence for a jid. */
  async getPresence(jid: string): Promise<PresenceData | undefined> {
    this.assertOpen()
    const found = await this.kv.get([`${PRESENCE}${jid}`])
    const raw = found.get(`${PRESENCE}${jid}`)
    return raw === undefined ? undefined : decode<PresenceData>(raw)
  }

  /** Persist a scheduled-send record (restart-survival). */
  async saveScheduledJob(job: ScheduledJobRecord): Promise<void> {
    this.assertOpen()
    await this.kv.set([{ key: `${JOB}${job.id}`, value: encode(job), sortKey: job.fireAt }])
  }

  /** List persisted scheduled-send records. */
  async listScheduledJobs(): Promise<ScheduledJobRecord[]> {
    this.assertOpen()
    const rows = await this.kv.list(JOB)
    return rows.map((r) => decode<ScheduledJobRecord>(r.value))
  }

  /** Delete a persisted scheduled-send record by id. */
  async deleteScheduledJob(id: string): Promise<void> {
    this.assertOpen()
    await this.kv.del([`${JOB}${id}`])
  }

  /**
   * Subscribe to a Baileys-like socket and auto-persist incoming events.
   * Idempotent: repeat calls detach previous listeners before re-binding.
   */
  bind(socket: BaileysSocketLike): void {
    this.assertOpen()
    if (this.boundSocket?.ev.off) {
      for (const [event, handler] of this.listeners) this.boundSocket.ev.off(event, handler)
    }
    this.listeners.clear()
    this.boundSocket = socket
    const messagesUpsert: Listener = (...args: unknown[]) => {
      const list = (args[0] as { messages?: WAMessage[] } | undefined)?.messages
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
      const payload = args[0] as { presences?: Record<string, PresenceData> } | undefined
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
    for (const [event, handler] of this.listeners) socket.ev.on(event, handler)
  }

  /** Wipe every row in the namespace. */
  async clear(): Promise<void> {
    this.assertOpen()
    await this.kv.clear()
  }

  /** Detach listeners and freeze the store. Idempotent. */
  async close(): Promise<void> {
    if (this.closed) return
    this.closed = true
    if (this.boundSocket?.ev.off) {
      for (const [event, handler] of this.listeners) this.boundSocket.ev.off(event, handler)
    }
    this.listeners.clear()
    this.boundSocket = undefined
    this.kv.close()
  }

  private assertOpen(): void {
    if (this.closed) {
      throw new ZaileysStoreError('STORE_CLOSED', 'ConvexMessageStore is closed')
    }
  }
}
