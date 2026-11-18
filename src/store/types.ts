import type { Chat, Contact, PresenceData, WAMessage, WAMessageKey } from 'baileys'

export type MessageStoreListOptions = {
  limit?: number
  before?: number
}

export type PruneOptions = {
  /** Delete messages whose `messageTimestamp` is strictly older than this epoch value, in **seconds** (matching stored `messageTimestamp`). */
  olderThan?: number
  /** Keep only the newest N messages per chat. */
  maxPerChat?: number
  /** Restrict pruning to chats whose jid passes this predicate. */
  chatFilter?: (jid: string) => boolean
}

export type ScheduledJobRecord = {
  id: string
  fireAt: number
  recipient: string
  payload: unknown
}

/** Options for `SessionHandle.set()`. */
export interface SessionSetOptions {
  /** Milliseconds until the value expires and reads return `undefined`. Default none: kept until deleted. */
  ttl?: number
}

/** Small JSON values kept for one user (or any JID) in the message store's own session space. */
export interface SessionHandle {
  /** The saved value, or `undefined` when it was never set, was deleted, or has expired. */
  get<T = unknown>(key: string): Promise<T | undefined>
  /** Save a JSON-serialisable value of at most 64 KB; saving again replaces it and its TTL. */
  set(key: string, value: unknown, options?: SessionSetOptions): Promise<void>
  delete(key: string): Promise<void>
  /** Remove every value in this scope. */
  clear(): Promise<void>
}

export interface BaileysSocketLike {
  ev: {
    on: (event: string, handler: (...args: unknown[]) => void) => void
    off?: (event: string, handler: (...args: unknown[]) => void) => void
  }
}

export interface MessageStore {
  saveMessage(message: WAMessage): Promise<void>
  getMessage(key: WAMessageKey): Promise<WAMessage | undefined>
  listMessages(jid: string, options?: MessageStoreListOptions): Promise<WAMessage[]>
  saveChat(chat: Chat): Promise<void>
  getChat(jid: string): Promise<Chat | undefined>
  listChats(options?: { archived?: boolean }): Promise<Chat[]>
  saveContact(contact: Contact): Promise<void>
  getContact(jid: string): Promise<Contact | undefined>
  listContacts(): Promise<Contact[]>
  savePresence(jid: string, presence: PresenceData): Promise<void>
  getPresence(jid: string): Promise<PresenceData | undefined>
  bind(socket: BaileysSocketLike): void
  clear(): Promise<void>
  close(): Promise<void>
  /** Undo `close()` so a disconnected client can connect again. Optional. */
  reopen?(): Promise<void>
  saveScheduledJob?(job: ScheduledJobRecord): Promise<void>
  listScheduledJobs?(): Promise<ScheduledJobRecord[]>
  deleteScheduledJob?(id: string): Promise<void>
  deleteMessage?(key: WAMessageKey): Promise<void>
  pruneMessages?(opts: PruneOptions): Promise<number>
  /** One session value, or `undefined` when missing or expired. Optional; backs `ctx.session`. */
  getSessionValue?(scope: string, key: string): Promise<unknown>
  /** Save a JSON value under `scope`/`key`, replacing any earlier value and TTL; `ttlMs` expires it. Optional. */
  setSessionValue?(scope: string, key: string, value: unknown, ttlMs?: number): Promise<void>
  /** Remove one session value. Optional. */
  deleteSessionValue?(scope: string, key: string): Promise<void>
  /** Remove every session value in `scope`, and nothing else. Optional. */
  clearSession?(scope: string): Promise<void>
}
