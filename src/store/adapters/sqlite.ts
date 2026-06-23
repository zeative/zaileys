import { BufferJSON } from 'baileys'
import type { Chat, Contact, PresenceData, WAMessage, WAMessageKey } from 'baileys'
import { ZaileysStoreError } from '../../types/store-error.js'
import type { BaileysSocketLike, MessageStore, MessageStoreListOptions, PruneOptions } from '../types.js'

type RunResult = { changes: number }

type DatabaseStatement = {
  run: (...args: unknown[]) => RunResult
  get: (...args: unknown[]) => unknown
  all: (...args: unknown[]) => unknown[]
}

type DatabaseInstance = {
  prepare: (sql: string) => DatabaseStatement
  exec: (sql: string) => unknown
  pragma: (sql: string, options?: { simple?: boolean }) => unknown
  transaction: <F extends (...args: never[]) => unknown>(fn: F) => F
  close: () => unknown
}

type RawDriverCtor = new (
  database: string | Buffer,
  options?: { readonly?: boolean },
) => DatabaseInstance

export interface SqliteMessageStoreOptions {
  database: string | Buffer
  readonly?: boolean
}

let cachedDriver: RawDriverCtor | null = null

const loadDriver = async (): Promise<RawDriverCtor> => {
  if (cachedDriver) return cachedDriver
  try {
    const mod = (await import('better-sqlite3')) as { default: unknown }
    cachedDriver = mod.default as RawDriverCtor
    return cachedDriver
  } catch (err) {
    throw new ZaileysStoreError(
      'STORE_NOT_AVAILABLE',
      "better-sqlite3 belum terpasang. Run: pnpm add better-sqlite3",
      { cause: err },
    )
  }
}

type Listener = (...args: unknown[]) => void

type PreparedSet = {
  readonly upsertMessage: DatabaseStatement
  readonly getMessage: DatabaseStatement
  readonly listMessages: DatabaseStatement
  readonly upsertChat: DatabaseStatement
  readonly getChat: DatabaseStatement
  readonly listChats: DatabaseStatement
  readonly listChatsArchived: DatabaseStatement
  readonly upsertContact: DatabaseStatement
  readonly getContact: DatabaseStatement
  readonly listContacts: DatabaseStatement
  readonly upsertPresence: DatabaseStatement
  readonly getPresence: DatabaseStatement
  readonly clearMessages: DatabaseStatement
  readonly clearChats: DatabaseStatement
  readonly clearContacts: DatabaseStatement
  readonly clearPresence: DatabaseStatement
  readonly deleteMessage: DatabaseStatement
  readonly pruneByAge: DatabaseStatement
  readonly pruneByAgeChat: DatabaseStatement
}

const encodeBlob = (value: unknown): Buffer => {
  try {
    return Buffer.from(JSON.stringify(value, BufferJSON.replacer), 'utf8')
  } catch (err) {
    throw new ZaileysStoreError('STORE_WRITE_FAILED', 'failed to serialize sqlite blob', {
      cause: err,
    })
  }
}

const parseBlob = <T,>(blob: Buffer | Uint8Array): T => {
  try {
    const text = Buffer.isBuffer(blob) ? blob.toString('utf8') : Buffer.from(blob).toString('utf8')
    return JSON.parse(text, BufferJSON.reviver) as T
  } catch (err) {
    throw new ZaileysStoreError('STORE_CORRUPTED', 'failed to parse sqlite blob', { cause: err })
  }
}

export class SqliteMessageStore implements MessageStore {
  private readonly options: SqliteMessageStoreOptions
  private db: DatabaseInstance | null = null
  private prepared: PreparedSet | null = null
  private readyPromise: Promise<void> | null = null
  private closed = false
  private boundSocket: BaileysSocketLike | undefined
  private readonly listeners: Map<string, Listener> = new Map()

  constructor(options: SqliteMessageStoreOptions) {
    this.options = options
  }

  async saveMessage(message: WAMessage): Promise<void> {
    const prep = await this.ensureReady()
    const jid = message.key.remoteJid ?? ''
    const id = message.key.id ?? ''
    const fromMe = message.key.fromMe ? 1 : 0
    const timestamp = Number(message.messageTimestamp ?? 0)
    prep.upsertMessage.run(jid, id, fromMe, timestamp, encodeBlob(message))
  }

  async getMessage(key: WAMessageKey): Promise<WAMessage | undefined> {
    const prep = await this.ensureReady()
    const row = prep.getMessage.get(
      key.remoteJid ?? '',
      key.id ?? '',
      key.fromMe ? 1 : 0,
    ) as { data: Buffer | Uint8Array } | undefined
    return row ? parseBlob<WAMessage>(row.data) : undefined
  }

  async listMessages(jid: string, options?: MessageStoreListOptions): Promise<WAMessage[]> {
    const prep = await this.ensureReady()
    const limit = options?.limit ?? 100
    const before = options?.before
    const rows =
      typeof before === 'number'
        ? (prep.listMessages.all(jid, before, limit) as Array<{ data: Buffer | Uint8Array }>)
        : (prep.listMessages.all(jid, Number.MAX_SAFE_INTEGER, limit) as Array<{
            data: Buffer | Uint8Array
          }>)
    return rows.map((r) => parseBlob<WAMessage>(r.data))
  }

  async saveChat(chat: Chat): Promise<void> {
    const prep = await this.ensureReady()
    const id = (chat as { id?: string | null }).id
    if (!id) return
    const archived = (chat as { archived?: boolean }).archived ? 1 : 0
    prep.upsertChat.run(id, archived, encodeBlob(chat))
  }

  async getChat(jid: string): Promise<Chat | undefined> {
    const prep = await this.ensureReady()
    const row = prep.getChat.get(jid) as { data: Buffer | Uint8Array } | undefined
    return row ? parseBlob<Chat>(row.data) : undefined
  }

  async listChats(options?: { archived?: boolean }): Promise<Chat[]> {
    const prep = await this.ensureReady()
    const rows =
      options?.archived === true
        ? (prep.listChatsArchived.all() as Array<{ data: Buffer | Uint8Array }>)
        : (prep.listChats.all() as Array<{ data: Buffer | Uint8Array }>)
    return rows.map((r) => parseBlob<Chat>(r.data))
  }

  async saveContact(contact: Contact): Promise<void> {
    const prep = await this.ensureReady()
    prep.upsertContact.run(contact.id, encodeBlob(contact))
  }

  async getContact(jid: string): Promise<Contact | undefined> {
    const prep = await this.ensureReady()
    const row = prep.getContact.get(jid) as { data: Buffer | Uint8Array } | undefined
    return row ? parseBlob<Contact>(row.data) : undefined
  }

  async listContacts(): Promise<Contact[]> {
    const prep = await this.ensureReady()
    const rows = prep.listContacts.all() as Array<{ data: Buffer | Uint8Array }>
    return rows.map((r) => parseBlob<Contact>(r.data))
  }

  async savePresence(jid: string, presence: PresenceData): Promise<void> {
    const prep = await this.ensureReady()
    prep.upsertPresence.run(jid, encodeBlob(presence))
  }

  async getPresence(jid: string): Promise<PresenceData | undefined> {
    const prep = await this.ensureReady()
    const row = prep.getPresence.get(jid) as { data: Buffer | Uint8Array } | undefined
    return row ? parseBlob<PresenceData>(row.data) : undefined
  }

  async deleteMessage(key: WAMessageKey): Promise<void> {
    const prep = await this.ensureReady()
    prep.deleteMessage.run(key.remoteJid ?? '', key.id ?? '', key.fromMe === true ? 1 : 0)
  }

  async pruneMessages(opts: PruneOptions): Promise<number> {
    const prep = await this.ensureReady()
    const db = this.db!
    let removed = 0
    const jids = opts.chatFilter
      ? (db.prepare('SELECT DISTINCT remote_jid FROM messages').all() as Array<{ remote_jid: string }>)
          .map((r) => r.remote_jid)
          .filter((j) => opts.chatFilter!(j))
      : undefined
    if (opts.olderThan !== undefined) {
      if (jids) {
        for (const j of jids) removed += prep.pruneByAgeChat.run(opts.olderThan, j).changes
      } else {
        removed += prep.pruneByAge.run(opts.olderThan).changes
      }
    }
    if (opts.maxPerChat !== undefined) {
      const placeholder = jids ? 'WHERE remote_jid IN (' + jids.map(() => '?').join(',') + ')' : ''
      const stmt = db.prepare(
        `DELETE FROM messages WHERE rowid IN (
           SELECT rowid FROM (
             SELECT rowid, ROW_NUMBER() OVER (PARTITION BY remote_jid ORDER BY timestamp DESC) AS rn
             FROM messages ${placeholder}
           ) WHERE rn > ?
         )`,
      )
      removed += stmt.run(...(jids ?? []), opts.maxPerChat).changes
    }
    return removed
  }

  bind(socket: BaileysSocketLike): void {
    if (this.closed) {
      throw new ZaileysStoreError('STORE_CLOSED', 'SqliteMessageStore is closed')
    }
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
    for (const [event, handler] of this.listeners) socket.ev.on(event, handler)
  }

  async clear(): Promise<void> {
    const prep = await this.ensureReady()
    const db = this.db!
    const tx = db.transaction(() => {
      prep.clearMessages.run()
      prep.clearChats.run()
      prep.clearContacts.run()
      prep.clearPresence.run()
    })
    tx()
  }

  async close(): Promise<void> {
    if (this.closed) return
    this.closed = true
    if (this.boundSocket?.ev.off) {
      for (const [event, handler] of this.listeners) this.boundSocket.ev.off(event, handler)
    }
    this.listeners.clear()
    this.boundSocket = undefined
    try {
      this.db?.close()
    } catch (err) {
      throw new ZaileysStoreError('STORE_WRITE_FAILED', 'failed to close sqlite database', {
        cause: err,
      })
    } finally {
      this.db = null
      this.prepared = null
    }
  }

  private async ensureReady(): Promise<PreparedSet> {
    if (this.closed) {
      throw new ZaileysStoreError('STORE_CLOSED', 'SqliteMessageStore is closed')
    }
    if (this.prepared) return this.prepared
    if (!this.readyPromise) {
      this.readyPromise = this.openAndMigrate().catch((err) => {
        this.readyPromise = null
        throw err
      })
    }
    await this.readyPromise
    return this.prepared!
  }

  private async openAndMigrate(): Promise<void> {
    const Driver = await loadDriver()
    let db: DatabaseInstance
    try {
      db = new Driver(this.options.database as string, { readonly: this.options.readonly ?? false })
    } catch (err) {
      throw new ZaileysStoreError(
        'STORE_CONNECTION_FAILED',
        `failed to open sqlite database at ${String(this.options.database)}`,
        { cause: err },
      )
    }
    try {
      db.pragma('journal_mode = WAL')
      db.pragma('synchronous = NORMAL')
      db.pragma('foreign_keys = ON')
      db.exec(
        `CREATE TABLE IF NOT EXISTS messages (
           remote_jid TEXT NOT NULL,
           id TEXT NOT NULL,
           from_me INTEGER NOT NULL,
           timestamp INTEGER NOT NULL,
           data BLOB NOT NULL,
           PRIMARY KEY(remote_jid, id, from_me)
         );
         CREATE INDEX IF NOT EXISTS messages_by_jid_ts ON messages(remote_jid, timestamp DESC);
         CREATE TABLE IF NOT EXISTS chats (jid TEXT PRIMARY KEY, archived INTEGER NOT NULL DEFAULT 0, data BLOB NOT NULL) WITHOUT ROWID;
         CREATE TABLE IF NOT EXISTS contacts (jid TEXT PRIMARY KEY, data BLOB NOT NULL) WITHOUT ROWID;
         CREATE TABLE IF NOT EXISTS presence (jid TEXT PRIMARY KEY, data BLOB NOT NULL) WITHOUT ROWID;`,
      )
    } catch (err) {
      db.close()
      throw new ZaileysStoreError('STORE_CONNECTION_FAILED', 'failed to migrate sqlite schema', {
        cause: err,
      })
    }
    this.db = db
    this.prepared = {
      upsertMessage: db.prepare(
        `INSERT INTO messages(remote_jid, id, from_me, timestamp, data) VALUES(?, ?, ?, ?, ?)
         ON CONFLICT(remote_jid, id, from_me) DO UPDATE SET timestamp = excluded.timestamp, data = excluded.data`,
      ),
      getMessage: db.prepare(
        'SELECT data FROM messages WHERE remote_jid = ? AND id = ? AND from_me = ?',
      ),
      listMessages: db.prepare(
        'SELECT data FROM messages WHERE remote_jid = ? AND timestamp < ? ORDER BY timestamp DESC LIMIT ?',
      ),
      upsertChat: db.prepare(
        `INSERT INTO chats(jid, archived, data) VALUES(?, ?, ?)
         ON CONFLICT(jid) DO UPDATE SET archived = excluded.archived, data = excluded.data`,
      ),
      getChat: db.prepare('SELECT data FROM chats WHERE jid = ?'),
      listChats: db.prepare('SELECT data FROM chats'),
      listChatsArchived: db.prepare('SELECT data FROM chats WHERE archived = 1'),
      upsertContact: db.prepare(
        `INSERT INTO contacts(jid, data) VALUES(?, ?)
         ON CONFLICT(jid) DO UPDATE SET data = excluded.data`,
      ),
      getContact: db.prepare('SELECT data FROM contacts WHERE jid = ?'),
      listContacts: db.prepare('SELECT data FROM contacts'),
      upsertPresence: db.prepare(
        `INSERT INTO presence(jid, data) VALUES(?, ?)
         ON CONFLICT(jid) DO UPDATE SET data = excluded.data`,
      ),
      getPresence: db.prepare('SELECT data FROM presence WHERE jid = ?'),
      clearMessages: db.prepare('DELETE FROM messages'),
      clearChats: db.prepare('DELETE FROM chats'),
      clearContacts: db.prepare('DELETE FROM contacts'),
      clearPresence: db.prepare('DELETE FROM presence'),
      deleteMessage: db.prepare(
        'DELETE FROM messages WHERE remote_jid = ? AND id = ? AND from_me = ?',
      ),
      pruneByAge: db.prepare('DELETE FROM messages WHERE timestamp < ?'),
      pruneByAgeChat: db.prepare('DELETE FROM messages WHERE timestamp < ? AND remote_jid = ?'),
    }
  }
}
