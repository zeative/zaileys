import type { Chat, Contact, PresenceData, WAMessage, WAMessageKey } from 'baileys'

/** Pagination options for {@link MessageStore.listMessages}. */
export type MessageStoreListOptions = {
  limit?: number
  before?: number
}

/**
 * Minimal structural surface of a Baileys socket required by
 * {@link MessageStore.bind}. Phase 3 `Client` is assignable to this type.
 */
export interface BaileysSocketLike {
  ev: {
    on: (event: string, handler: (...args: any[]) => void) => void
    off?: (event: string, handler: (...args: any[]) => void) => void
  }
}

/**
 * Pluggable chat / message / contact / presence store.
 * After {@link MessageStore.close} resolves every other method MUST throw
 * `ZaileysStoreError` with code `STORE_CLOSED`.
 */
export interface MessageStore {
  /** Persist a single WAMessage. */
  saveMessage(message: WAMessage): Promise<void>
  /**
   * Look up a message by Baileys key.
   * @returns The stored message or `undefined`.
   */
  getMessage(key: WAMessageKey): Promise<WAMessage | undefined>
  /**
   * List messages for a chat, newest-first by default.
   * @param jid Remote jid to query.
   * @param options Pagination controls.
   */
  listMessages(jid: string, options?: MessageStoreListOptions): Promise<WAMessage[]>
  /** Upsert a chat record. */
  saveChat(chat: Chat): Promise<void>
  /** Fetch a chat by jid. */
  getChat(jid: string): Promise<Chat | undefined>
  /** List chats with optional archive filter. */
  listChats(options?: { archived?: boolean }): Promise<Chat[]>
  /** Upsert a contact. */
  saveContact(contact: Contact): Promise<void>
  /** Fetch a contact by jid. */
  getContact(jid: string): Promise<Contact | undefined>
  /** List every known contact. */
  listContacts(): Promise<Contact[]>
  /** Record latest presence for a jid. */
  savePresence(jid: string, presence: PresenceData): Promise<void>
  /** Fetch latest presence for a jid. */
  getPresence(jid: string): Promise<PresenceData | undefined>
  /**
   * Subscribe to socket events for auto-persistence.
   * Implementations attach the listeners they need on the supplied socket.
   */
  bind(socket: BaileysSocketLike): void
  /** Wipe all stored data. */
  clear(): Promise<void>
  /** Release backing resources; idempotent. */
  close(): Promise<void>
}
