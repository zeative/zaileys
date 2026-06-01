import type { Chat, Contact, PresenceData, WAMessage, WAMessageKey } from 'baileys'

export type MessageStoreListOptions = {
  limit?: number
  before?: number
}

export type ScheduledJobRecord = {
  id: string
  fireAt: number
  recipient: string
  payload: unknown
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
  saveScheduledJob?(job: ScheduledJobRecord): Promise<void>
  listScheduledJobs?(): Promise<ScheduledJobRecord[]>
  deleteScheduledJob?(id: string): Promise<void>
}
