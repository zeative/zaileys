import { BufferJSON } from 'baileys'
import type { AuthenticationCreds, SignalDataSet } from 'baileys'
import { ZaileysStoreError } from '../../types/store-error.js'
import type {
  AuthCredsStore,
  AuthStore,
  AuthStoreBundle,
  AuthStoreKey,
  AuthStoreValue,
} from '../types.js'

type DatabaseStatement = {
  run: (...args: unknown[]) => unknown
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

/** Optional constructor input for {@link SqliteAuthStore}. */
export interface SqliteAuthStoreOptions {
  /** Path on disk, or `':memory:'` for an ephemeral connection. */
  database: string | Buffer
  /** Open the database read-only. */
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

const CREDS_ID = 'default'
const CHUNK = 500

type PreparedSet = {
  readonly readCreds: DatabaseStatement
  readonly writeCreds: DatabaseStatement
  readonly deleteCreds: DatabaseStatement
  readonly writeSignal: DatabaseStatement
  readonly deleteSignal: DatabaseStatement
  readonly clearSignal: DatabaseStatement
  readonly clearCreds: DatabaseStatement
}

const buildPlaceholders = (n: number): string => Array.from({ length: n }, () => '?').join(',')

const chunked = <T,>(items: readonly T[], size: number): T[][] => {
  const out: T[][] = []
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size) as T[])
  }
  return out
}

/**
 * SQLite-backed `AuthStoreBundle` using `better-sqlite3` with WAL pragmas.
 * Schema migrates idempotently on first use; supports `:memory:` mode.
 */
export class SqliteAuthStore implements AuthStoreBundle {
  private readonly options: SqliteAuthStoreOptions
  private db: DatabaseInstance | null = null
  private prepared: PreparedSet | null = null
  private readyPromise: Promise<void> | null = null
  private closed = false

  constructor(options: SqliteAuthStoreOptions) {
    this.options = options
  }

  /** Credential persistence view backed by the `auth_creds` table. */
  readonly creds: AuthCredsStore = {
    readCreds: async (): Promise<AuthenticationCreds | undefined> => {
      const prep = await this.ensureReady()
      const row = prep.readCreds.get(CREDS_ID) as { data: Buffer | Uint8Array } | undefined
      if (!row) return undefined
      return this.parseBlob<AuthenticationCreds>(row.data)
    },
    writeCreds: async (next: AuthenticationCreds): Promise<void> => {
      const prep = await this.ensureReady()
      const blob = this.encodeBlob(next)
      prep.writeCreds.run(CREDS_ID, blob)
    },
    deleteCreds: async (): Promise<void> => {
      const prep = await this.ensureReady()
      prep.deleteCreds.run(CREDS_ID)
    },
  }

  /** Signal-key store view backed by the `auth_signal` table. */
  readonly signal: AuthStore = {
    read: async <K extends AuthStoreKey>(
      type: K,
      ids: readonly string[],
    ): Promise<{ [id: string]: AuthStoreValue<K> | undefined }> => {
      await this.ensureReady()
      const out: { [id: string]: AuthStoreValue<K> | undefined } = {}
      if (ids.length === 0) return out
      const db = this.db!
      for (const batch of chunked(ids, CHUNK)) {
        const placeholders = buildPlaceholders(batch.length)
        const stmt = db.prepare(
          `SELECT id, data FROM auth_signal WHERE type = ? AND id IN (${placeholders})`,
        )
        const rows = stmt.all(type, ...batch) as Array<{ id: string; data: Buffer | Uint8Array }>
        for (const row of rows) {
          out[row.id] = this.parseBlob<AuthStoreValue<K>>(row.data)
        }
      }
      return out
    },
    write: async (data: SignalDataSet): Promise<void> => {
      const prep = await this.ensureReady()
      const db = this.db!
      const writes: Array<{ type: string; id: string; blob: Buffer }> = []
      const deletes: Array<{ type: string; id: string }> = []
      for (const rawType of Object.keys(data) as AuthStoreKey[]) {
        const entries = (data as Record<string, Record<string, unknown> | undefined>)[rawType]
        if (!entries) continue
        for (const id of Object.keys(entries)) {
          const value = entries[id]
          if (value === null) {
            deletes.push({ type: rawType, id })
          } else if (value !== undefined) {
            writes.push({ type: rawType, id, blob: this.encodeBlob(value) })
          }
        }
      }
      const tx = db.transaction(() => {
        for (const w of writes) prep.writeSignal.run(w.type, w.id, w.blob)
        for (const d of deletes) prep.deleteSignal.run(d.type, d.id)
      })
      tx()
    },
    delete: async <K extends AuthStoreKey>(type: K, ids: readonly string[]): Promise<void> => {
      await this.ensureReady()
      if (ids.length === 0) return
      const db = this.db!
      const tx = db.transaction((batch: string[]) => {
        const placeholders = buildPlaceholders(batch.length)
        db.prepare(`DELETE FROM auth_signal WHERE type = ? AND id IN (${placeholders})`).run(
          type,
          ...batch,
        )
      })
      for (const batch of chunked(ids, CHUNK)) tx(batch as string[])
    },
    clear: async (): Promise<void> => {
      const prep = await this.ensureReady()
      const db = this.db!
      const tx = db.transaction(() => {
        prep.clearSignal.run()
        prep.clearCreds.run()
      })
      tx()
    },
    close: async (): Promise<void> => {
      if (this.closed) return
      this.closed = true
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
    },
  }

  private async ensureReady(): Promise<PreparedSet> {
    if (this.closed) {
      throw new ZaileysStoreError('STORE_CLOSED', 'SqliteAuthStore is closed')
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
        `CREATE TABLE IF NOT EXISTS auth_creds (id TEXT PRIMARY KEY, data BLOB NOT NULL) WITHOUT ROWID;
         CREATE TABLE IF NOT EXISTS auth_signal (type TEXT NOT NULL, id TEXT NOT NULL, data BLOB NOT NULL, PRIMARY KEY(type, id)) WITHOUT ROWID;`,
      )
    } catch (err) {
      db.close()
      throw new ZaileysStoreError('STORE_CONNECTION_FAILED', 'failed to migrate sqlite schema', {
        cause: err,
      })
    }
    this.db = db
    this.prepared = {
      readCreds: db.prepare('SELECT data FROM auth_creds WHERE id = ?'),
      writeCreds: db.prepare(
        'INSERT INTO auth_creds(id, data) VALUES(?, ?) ON CONFLICT(id) DO UPDATE SET data = excluded.data',
      ),
      deleteCreds: db.prepare('DELETE FROM auth_creds WHERE id = ?'),
      writeSignal: db.prepare(
        'INSERT INTO auth_signal(type, id, data) VALUES(?, ?, ?) ON CONFLICT(type, id) DO UPDATE SET data = excluded.data',
      ),
      deleteSignal: db.prepare('DELETE FROM auth_signal WHERE type = ? AND id = ?'),
      clearSignal: db.prepare('DELETE FROM auth_signal'),
      clearCreds: db.prepare('DELETE FROM auth_creds'),
    }
  }

  private encodeBlob(value: unknown): Buffer {
    try {
      return Buffer.from(JSON.stringify(value, BufferJSON.replacer), 'utf8')
    } catch (err) {
      throw new ZaileysStoreError('STORE_WRITE_FAILED', 'failed to serialize sqlite blob', {
        cause: err,
      })
    }
  }

  private parseBlob<T>(blob: Buffer | Uint8Array): T {
    try {
      const text = Buffer.isBuffer(blob) ? blob.toString('utf8') : Buffer.from(blob).toString('utf8')
      return JSON.parse(text, BufferJSON.reviver) as T
    } catch (err) {
      throw new ZaileysStoreError('STORE_CORRUPTED', 'failed to parse sqlite blob', { cause: err })
    }
  }
}
