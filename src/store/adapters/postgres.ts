import type { Chat, Contact, PresenceData, WAMessage, WAMessageKey } from 'baileys'
import { BufferJSON } from 'baileys'
import type { Pool, PoolClient } from 'pg'
import { ZaileysStoreError } from '../../types/store-error.js'
import type { BaileysSocketLike, MessageStore, MessageStoreListOptions, PruneOptions } from '../types.js'

export interface PostgresMessageStoreOptions {
  pool?: Pool
  connectionString?: string
  max?: number
}

type PgModule = typeof import('pg')
type Listener = (...args: unknown[]) => void

let pgModulePromise: Promise<PgModule> | undefined

const loadPg = async (): Promise<PgModule> => {
  if (!pgModulePromise) {
    pgModulePromise = import('pg').catch((err) => {
      pgModulePromise = undefined
      throw new ZaileysStoreError(
        'STORE_NOT_AVAILABLE',
        "pg is not installed. Run: pnpm add pg",
        { cause: err },
      )
    })
  }
  return pgModulePromise
}

const MIGRATIONS: readonly string[] = [
  'CREATE TABLE IF NOT EXISTS zaileys_messages (remote_jid text NOT NULL, id text NOT NULL, from_me boolean NOT NULL, timestamp bigint NOT NULL, data jsonb NOT NULL, PRIMARY KEY(remote_jid, id, from_me))',
  'CREATE INDEX IF NOT EXISTS zaileys_messages_jid_ts_idx ON zaileys_messages(remote_jid, timestamp DESC)',
  'CREATE TABLE IF NOT EXISTS zaileys_chats (jid text PRIMARY KEY, archived boolean NOT NULL DEFAULT false, data jsonb NOT NULL)',
  'CREATE INDEX IF NOT EXISTS zaileys_chats_archived_idx ON zaileys_chats(archived) WHERE archived = true',
  'CREATE TABLE IF NOT EXISTS zaileys_contacts (jid text PRIMARY KEY, data jsonb NOT NULL)',
  'CREATE TABLE IF NOT EXISTS zaileys_presence (jid text PRIMARY KEY, data jsonb NOT NULL, updated_at timestamptz NOT NULL DEFAULT now())',
]

const reviveJson = <T>(value: unknown): T => {
  if (value === null || value === undefined) return value as T
  const text = typeof value === 'string' ? value : JSON.stringify(value)
  return JSON.parse(text, BufferJSON.reviver) as T
}

export class PostgresMessageStore implements MessageStore {
  private readonly externalPool: Pool | undefined
  private readonly connectionString: string | undefined
  private readonly poolMax: number | undefined
  private ownedPool: Pool | undefined
  private resolvedPool: Pool | undefined
  private readyPromise: Promise<Pool> | undefined
  private boundSocket: BaileysSocketLike | undefined
  private readonly listeners: Map<string, Listener> = new Map()
  private closed = false

  constructor(options: PostgresMessageStoreOptions) {
    const hasPool = options.pool !== undefined
    const hasConn = options.connectionString !== undefined
    if (hasPool && hasConn) {
      throw new ZaileysStoreError(
        'STORE_CONNECTION_FAILED',
        'PostgresMessageStore: provide either pool or connectionString, not both',
      )
    }
    if (!hasPool && !hasConn) {
      throw new ZaileysStoreError(
        'STORE_CONNECTION_FAILED',
        'PostgresMessageStore: pool or connectionString is required',
      )
    }
    this.externalPool = options.pool
    this.connectionString = options.connectionString
    this.poolMax = options.max
  }

  private assertOpen(): void {
    if (this.closed) {
      throw new ZaileysStoreError('STORE_CLOSED', 'PostgresMessageStore is closed')
    }
  }

  private async ensureReady(): Promise<Pool> {
    this.assertOpen()
    if (this.resolvedPool) return this.resolvedPool
    if (!this.readyPromise) {
      this.readyPromise = (async () => {
        let pool: Pool
        if (this.externalPool) {
          pool = this.externalPool
        } else {
          const pg = await loadPg()
          const PoolCtor = pg.Pool ?? (pg as unknown as { default: PgModule }).default?.Pool
          if (!PoolCtor) {
            throw new ZaileysStoreError('STORE_NOT_AVAILABLE', 'pg.Pool constructor not found')
          }
          pool = new PoolCtor({ connectionString: this.connectionString, max: this.poolMax })
          this.ownedPool = pool
        }
        try {
          for (const stmt of MIGRATIONS) {
            await pool.query(stmt)
          }
        } catch (err) {
          throw new ZaileysStoreError(
            'STORE_CONNECTION_FAILED',
            'failed to migrate message schema',
            { cause: err },
          )
        }
        this.resolvedPool = pool
        return pool
      })()
    }
    try {
      return await this.readyPromise
    } catch (err) {
      this.readyPromise = undefined
      throw err
    }
  }

  async saveMessage(message: WAMessage): Promise<void> {
    const pool = await this.ensureReady()
    const remoteJid = message.key.remoteJid ?? ''
    const id = message.key.id ?? ''
    const fromMe = message.key.fromMe === true
    const ts = Number(message.messageTimestamp ?? 0)
    try {
      await pool.query(
        'INSERT INTO zaileys_messages(remote_jid, id, from_me, timestamp, data) VALUES ($1, $2, $3, $4, $5::jsonb) ON CONFLICT (remote_jid, id, from_me) DO UPDATE SET data = EXCLUDED.data, timestamp = EXCLUDED.timestamp',
        [remoteJid, id, fromMe, ts, JSON.stringify(message, BufferJSON.replacer)],
      )
    } catch (err) {
      throw new ZaileysStoreError('STORE_WRITE_FAILED', 'failed to save message', { cause: err })
    }
  }

  async getMessage(key: WAMessageKey): Promise<WAMessage | undefined> {
    const pool = await this.ensureReady()
    try {
      const res = await pool.query<{ data: unknown }>(
        'SELECT data FROM zaileys_messages WHERE remote_jid = $1 AND id = $2 AND from_me = $3',
        [key.remoteJid ?? '', key.id ?? '', key.fromMe === true],
      )
      const row = res.rows[0]
      if (!row) return undefined
      return reviveJson<WAMessage>(row.data)
    } catch (err) {
      if (err instanceof ZaileysStoreError) throw err
      throw new ZaileysStoreError('STORE_READ_FAILED', 'failed to read message', { cause: err })
    }
  }

  async listMessages(jid: string, options?: MessageStoreListOptions): Promise<WAMessage[]> {
    const pool = await this.ensureReady()
    const limit = options?.limit ?? 100
    const before = typeof options?.before === 'number' ? options.before : null
    try {
      const res = await pool.query<{ data: unknown }>(
        'SELECT data FROM zaileys_messages WHERE remote_jid = $1 AND ($2::bigint IS NULL OR timestamp < $2::bigint) ORDER BY timestamp DESC LIMIT $3',
        [jid, before, limit],
      )
      return res.rows.map((r) => reviveJson<WAMessage>(r.data))
    } catch (err) {
      throw new ZaileysStoreError('STORE_READ_FAILED', 'failed to list messages', { cause: err })
    }
  }

  async saveChat(chat: Chat): Promise<void> {
    const pool = await this.ensureReady()
    const id = (chat as { id?: string | null }).id
    if (!id) return
    const archived = (chat as { archived?: boolean }).archived === true
    try {
      await pool.query(
        'INSERT INTO zaileys_chats(jid, archived, data) VALUES ($1, $2, $3::jsonb) ON CONFLICT (jid) DO UPDATE SET archived = EXCLUDED.archived, data = EXCLUDED.data',
        [id, archived, JSON.stringify(chat, BufferJSON.replacer)],
      )
    } catch (err) {
      throw new ZaileysStoreError('STORE_WRITE_FAILED', 'failed to save chat', { cause: err })
    }
  }

  async getChat(jid: string): Promise<Chat | undefined> {
    const pool = await this.ensureReady()
    try {
      const res = await pool.query<{ data: unknown }>(
        'SELECT data FROM zaileys_chats WHERE jid = $1',
        [jid],
      )
      const row = res.rows[0]
      if (!row) return undefined
      return reviveJson<Chat>(row.data)
    } catch (err) {
      throw new ZaileysStoreError('STORE_READ_FAILED', 'failed to read chat', { cause: err })
    }
  }

  async listChats(options?: { archived?: boolean }): Promise<Chat[]> {
    const pool = await this.ensureReady()
    const archived = typeof options?.archived === 'boolean' ? options.archived : null
    try {
      const res = await pool.query<{ data: unknown }>(
        'SELECT data FROM zaileys_chats WHERE ($1::boolean IS NULL OR archived = $1::boolean)',
        [archived],
      )
      return res.rows.map((r) => reviveJson<Chat>(r.data))
    } catch (err) {
      throw new ZaileysStoreError('STORE_READ_FAILED', 'failed to list chats', { cause: err })
    }
  }

  async saveContact(contact: Contact): Promise<void> {
    const pool = await this.ensureReady()
    try {
      await pool.query(
        'INSERT INTO zaileys_contacts(jid, data) VALUES ($1, $2::jsonb) ON CONFLICT (jid) DO UPDATE SET data = EXCLUDED.data',
        [contact.id, JSON.stringify(contact, BufferJSON.replacer)],
      )
    } catch (err) {
      throw new ZaileysStoreError('STORE_WRITE_FAILED', 'failed to save contact', { cause: err })
    }
  }

  async getContact(jid: string): Promise<Contact | undefined> {
    const pool = await this.ensureReady()
    try {
      const res = await pool.query<{ data: unknown }>(
        'SELECT data FROM zaileys_contacts WHERE jid = $1',
        [jid],
      )
      const row = res.rows[0]
      if (!row) return undefined
      return reviveJson<Contact>(row.data)
    } catch (err) {
      throw new ZaileysStoreError('STORE_READ_FAILED', 'failed to read contact', { cause: err })
    }
  }

  async listContacts(): Promise<Contact[]> {
    const pool = await this.ensureReady()
    try {
      const res = await pool.query<{ data: unknown }>('SELECT data FROM zaileys_contacts')
      return res.rows.map((r) => reviveJson<Contact>(r.data))
    } catch (err) {
      throw new ZaileysStoreError('STORE_READ_FAILED', 'failed to list contacts', { cause: err })
    }
  }

  async savePresence(jid: string, presence: PresenceData): Promise<void> {
    const pool = await this.ensureReady()
    try {
      await pool.query(
        'INSERT INTO zaileys_presence(jid, data, updated_at) VALUES ($1, $2::jsonb, now()) ON CONFLICT (jid) DO UPDATE SET data = EXCLUDED.data, updated_at = now()',
        [jid, JSON.stringify(presence, BufferJSON.replacer)],
      )
    } catch (err) {
      throw new ZaileysStoreError('STORE_WRITE_FAILED', 'failed to save presence', { cause: err })
    }
  }

  async getPresence(jid: string): Promise<PresenceData | undefined> {
    const pool = await this.ensureReady()
    try {
      const res = await pool.query<{ data: unknown }>(
        'SELECT data FROM zaileys_presence WHERE jid = $1',
        [jid],
      )
      const row = res.rows[0]
      if (!row) return undefined
      return reviveJson<PresenceData>(row.data)
    } catch (err) {
      throw new ZaileysStoreError('STORE_READ_FAILED', 'failed to read presence', { cause: err })
    }
  }

  async deleteMessage(key: WAMessageKey): Promise<void> {
    const pool = await this.ensureReady()
    try {
      await pool.query(
        'DELETE FROM zaileys_messages WHERE remote_jid = $1 AND id = $2 AND from_me = $3',
        [key.remoteJid ?? '', key.id ?? '', key.fromMe === true],
      )
    } catch (err) {
      throw new ZaileysStoreError('STORE_WRITE_FAILED', 'failed to delete message', { cause: err })
    }
  }

  async pruneMessages(opts: PruneOptions): Promise<number> {
    const pool = await this.ensureReady()
    try {
      let removed = 0
      let jids: string[] | undefined
      if (opts.chatFilter) {
        const res = await pool.query<{ remote_jid: string }>(
          'SELECT DISTINCT remote_jid FROM zaileys_messages',
          [],
        )
        jids = res.rows.map((r) => r.remote_jid).filter((j) => opts.chatFilter!(j))
      }
      if (opts.olderThan !== undefined) {
        const res = jids
          ? await pool.query(
              'DELETE FROM zaileys_messages WHERE timestamp < $1 AND remote_jid = ANY($2::text[])',
              [opts.olderThan, jids],
            )
          : await pool.query('DELETE FROM zaileys_messages WHERE timestamp < $1', [opts.olderThan])
        removed += res.rowCount ?? 0
      }
      if (opts.maxPerChat !== undefined) {
        const scope: string[] = jids ?? await pool
          .query<{ remote_jid: string }>('SELECT DISTINCT remote_jid FROM zaileys_messages', [])
          .then((r) => r.rows.map((row) => row.remote_jid))
        for (const jid of scope) {
          const rows = await pool.query<{ id: string; from_me: boolean }>(
            'SELECT id, from_me FROM zaileys_messages WHERE remote_jid = $1 ORDER BY timestamp DESC',
            [jid],
          )
          const toDelete = rows.rows.slice(opts.maxPerChat)
          if (toDelete.length === 0) continue
          for (const row of toDelete) {
            const r = await pool.query(
              'DELETE FROM zaileys_messages WHERE remote_jid = $1 AND id = $2 AND from_me = $3',
              [jid, row.id, row.from_me],
            )
            removed += r.rowCount ?? 0
          }
        }
      }
      return removed
    } catch (err) {
      throw new ZaileysStoreError('STORE_WRITE_FAILED', 'failed to prune messages', { cause: err })
    }
  }

  bind(socket: BaileysSocketLike): void {
    this.assertOpen()
    this.boundSocket = socket
    const messagesUpsert: Listener = (...args: unknown[]) => {
      const payload = args[0] as { messages?: WAMessage[] } | undefined
      const list = payload?.messages
      if (!Array.isArray(list)) return
      for (const m of list) void this.saveMessage(m).catch(() => undefined)
    }
    const messagesUpdate: Listener = (...args: unknown[]) => {
      const updates = args[0] as Array<{ key: WAMessageKey; update: Partial<WAMessage> }> | undefined
      if (!Array.isArray(updates)) return
      for (const u of updates) {
        void this.getMessage(u.key).then((existing) => {
          if (!existing) return
          const merged = { ...existing, ...u.update } as WAMessage
          return this.saveMessage(merged)
        }).catch(() => undefined)
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
        void this.getChat(c.id).then((existing) => {
          const merged = { ...(existing ?? {}), ...c } as Chat
          return this.saveChat(merged)
        }).catch(() => undefined)
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

  async clear(): Promise<void> {
    const pool = await this.ensureReady()
    let client: PoolClient | undefined
    try {
      client = await pool.connect()
      await client.query('BEGIN')
      await client.query('DELETE FROM zaileys_messages')
      await client.query('DELETE FROM zaileys_chats')
      await client.query('DELETE FROM zaileys_contacts')
      await client.query('DELETE FROM zaileys_presence')
      await client.query('COMMIT')
    } catch (err) {
      if (client) {
        try {
          await client.query('ROLLBACK')
        } catch {
          void 0
        }
      }
      throw new ZaileysStoreError('STORE_WRITE_FAILED', 'failed to clear message tables', {
        cause: err,
      })
    } finally {
      client?.release()
    }
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
    const owned = this.ownedPool
    this.ownedPool = undefined
    this.resolvedPool = undefined
    this.readyPromise = undefined
    if (owned) {
      try {
        await owned.end()
      } catch {
        void 0
      }
    }
  }
}
