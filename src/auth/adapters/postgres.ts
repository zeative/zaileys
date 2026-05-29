import { BufferJSON } from 'baileys'
import type { AuthenticationCreds, SignalDataSet } from 'baileys'
import type { Pool, PoolClient } from 'pg'
import { ZaileysStoreError } from '../../types/store-error.js'
import type {
  AuthCredsStore,
  AuthStore,
  AuthStoreBundle,
  AuthStoreKey,
  AuthStoreValue,
} from '../types.js'

/** Constructor input for {@link PostgresAuthStore}. XOR between `pool` and `connectionString`. */
export interface PostgresAuthStoreOptions {
  /** Caller-owned pg `Pool`. Adapter will NOT end it on close. */
  pool?: Pool
  /** Connection string for an adapter-owned pool. Adapter ends it on close. */
  connectionString?: string
  /** Optional `max` pool size when adapter creates the pool. */
  max?: number
}

type PgModule = typeof import('pg')

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

const CREATE_CREDS_SQL =
  'CREATE TABLE IF NOT EXISTS zaileys_auth_creds (id text PRIMARY KEY, data jsonb NOT NULL)'

const CREATE_SIGNAL_SQL =
  'CREATE TABLE IF NOT EXISTS zaileys_auth_signal (type text NOT NULL, id text NOT NULL, data bytea NOT NULL, PRIMARY KEY(type, id))'

/**
 * Postgres-backed `AuthStoreBundle` over node-postgres.
 * Schema auto-migrates idempotently on first method call.
 */
export class PostgresAuthStore implements AuthStoreBundle {
  private readonly externalPool: Pool | undefined
  private readonly connectionString: string | undefined
  private readonly poolMax: number | undefined
  private ownedPool: Pool | undefined
  private resolvedPool: Pool | undefined
  private readyPromise: Promise<Pool> | undefined
  private closed = false

  constructor(options: PostgresAuthStoreOptions) {
    const hasPool = options.pool !== undefined
    const hasConn = options.connectionString !== undefined
    if (hasPool && hasConn) {
      throw new ZaileysStoreError(
        'STORE_CONNECTION_FAILED',
        'PostgresAuthStore: provide either pool or connectionString, not both',
      )
    }
    if (!hasPool && !hasConn) {
      throw new ZaileysStoreError(
        'STORE_CONNECTION_FAILED',
        'PostgresAuthStore: pool or connectionString is required',
      )
    }
    this.externalPool = options.pool
    this.connectionString = options.connectionString
    this.poolMax = options.max
  }

  private async ensureReady(): Promise<Pool> {
    if (this.closed) {
      throw new ZaileysStoreError('STORE_CLOSED', 'PostgresAuthStore is closed')
    }
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
          await pool.query(CREATE_CREDS_SQL)
          await pool.query(CREATE_SIGNAL_SQL)
        } catch (err) {
          throw new ZaileysStoreError('STORE_CONNECTION_FAILED', 'failed to migrate auth schema', {
            cause: err,
          })
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

  /** Signal-key store view over `zaileys_auth_signal`. */
  readonly signal: AuthStore = {
    read: async <K extends AuthStoreKey>(
      type: K,
      ids: readonly string[],
    ): Promise<{ [id: string]: AuthStoreValue<K> | undefined }> => {
      const pool = await this.ensureReady()
      const out: { [id: string]: AuthStoreValue<K> | undefined } = {}
      if (ids.length === 0) return out
      try {
        const placeholders = ids.map((_, i) => `$${i + 2}`).join(', ')
        const res = await pool.query<{ id: string; data: Buffer }>(
          `SELECT id, data FROM zaileys_auth_signal WHERE type = $1 AND id IN (${placeholders})`,
          [String(type), ...Array.from(ids)],
        )
        for (const row of res.rows) {
          const buf = Buffer.isBuffer(row.data) ? row.data : Buffer.from(row.data as unknown as ArrayBuffer)
          out[row.id] = JSON.parse(buf.toString('utf8'), BufferJSON.reviver) as AuthStoreValue<K>
        }
        return out
      } catch (err) {
        if (err instanceof ZaileysStoreError) throw err
        throw new ZaileysStoreError('STORE_READ_FAILED', 'failed to read signal rows', { cause: err })
      }
    },
    write: async (data: SignalDataSet): Promise<void> => {
      const pool = await this.ensureReady()
      const ops: Array<{ kind: 'upsert' | 'delete'; type: string; id: string; value?: Buffer }> = []
      for (const rawType of Object.keys(data) as AuthStoreKey[]) {
        const entries = (data as Record<string, Record<string, unknown> | undefined>)[rawType]
        if (!entries) continue
        for (const id of Object.keys(entries)) {
          const value = entries[id]
          if (value === null) {
            ops.push({ kind: 'delete', type: String(rawType), id })
          } else if (value !== undefined) {
            const serialised = Buffer.from(JSON.stringify(value, BufferJSON.replacer), 'utf8')
            ops.push({ kind: 'upsert', type: String(rawType), id, value: serialised })
          }
        }
      }
      if (ops.length === 0) return
      let client: PoolClient | undefined
      try {
        client = await pool.connect()
        await client.query('BEGIN')
        for (const op of ops) {
          if (op.kind === 'delete') {
            await client.query('DELETE FROM zaileys_auth_signal WHERE type = $1 AND id = $2', [
              op.type,
              op.id,
            ])
          } else {
            await client.query(
              'INSERT INTO zaileys_auth_signal(type, id, data) VALUES ($1, $2, $3) ON CONFLICT (type, id) DO UPDATE SET data = EXCLUDED.data',
              [op.type, op.id, op.value],
            )
          }
        }
        await client.query('COMMIT')
      } catch (err) {
        if (client) {
          try {
            await client.query('ROLLBACK')
          } catch {
            void 0
          }
        }
        throw new ZaileysStoreError('STORE_WRITE_FAILED', 'failed to write signal rows', { cause: err })
      } finally {
        client?.release()
      }
    },
    delete: async <K extends AuthStoreKey>(type: K, ids: readonly string[]): Promise<void> => {
      const pool = await this.ensureReady()
      if (ids.length === 0) return
      try {
        const placeholders = ids.map((_, i) => `$${i + 2}`).join(', ')
        await pool.query(
          `DELETE FROM zaileys_auth_signal WHERE type = $1 AND id IN (${placeholders})`,
          [String(type), ...Array.from(ids)],
        )
      } catch (err) {
        throw new ZaileysStoreError('STORE_WRITE_FAILED', 'failed to delete signal rows', {
          cause: err,
        })
      }
    },
    clear: async (): Promise<void> => {
      const pool = await this.ensureReady()
      let client: PoolClient | undefined
      try {
        client = await pool.connect()
        await client.query('BEGIN')
        await client.query('DELETE FROM zaileys_auth_signal')
        await client.query('DELETE FROM zaileys_auth_creds')
        await client.query('COMMIT')
      } catch (err) {
        if (client) {
          try {
            await client.query('ROLLBACK')
          } catch {
            void 0
          }
        }
        throw new ZaileysStoreError('STORE_WRITE_FAILED', 'failed to clear auth tables', {
          cause: err,
        })
      } finally {
        client?.release()
      }
    },
    close: async (): Promise<void> => {
      if (this.closed) return
      this.closed = true
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
    },
  }

  /** Credential store view over `zaileys_auth_creds`. */
  readonly creds: AuthCredsStore = {
    readCreds: async (): Promise<AuthenticationCreds | undefined> => {
      const pool = await this.ensureReady()
      try {
        const res = await pool.query<{ data: unknown }>(
          "SELECT data FROM zaileys_auth_creds WHERE id = 'default'",
        )
        const row = res.rows[0]
        if (!row) return undefined
        const raw = typeof row.data === 'string' ? row.data : JSON.stringify(row.data)
        return JSON.parse(raw, BufferJSON.reviver) as AuthenticationCreds
      } catch (err) {
        if (err instanceof ZaileysStoreError) throw err
        throw new ZaileysStoreError('STORE_READ_FAILED', 'failed to read creds', { cause: err })
      }
    },
    writeCreds: async (next: AuthenticationCreds): Promise<void> => {
      const pool = await this.ensureReady()
      try {
        const payload = JSON.stringify(next, BufferJSON.replacer)
        await pool.query(
          "INSERT INTO zaileys_auth_creds(id, data) VALUES ('default', $1::jsonb) ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data",
          [payload],
        )
      } catch (err) {
        throw new ZaileysStoreError('STORE_WRITE_FAILED', 'failed to write creds', { cause: err })
      }
    },
    deleteCreds: async (): Promise<void> => {
      const pool = await this.ensureReady()
      try {
        await pool.query("DELETE FROM zaileys_auth_creds WHERE id = 'default'")
      } catch (err) {
        throw new ZaileysStoreError('STORE_WRITE_FAILED', 'failed to delete creds', { cause: err })
      }
    },
  }
}
