import { ZaileysStoreError } from './store-error.js'
import type { PgPoolClientLike, PgPoolLike, PgQueryResultLike } from './optional-clients.js'

/** Interpolated into SQL identifiers, so nothing but a plain identifier is accepted. */
const PREFIX_PATTERN = /^[A-Za-z][A-Za-z0-9_]{0,40}$/

export const assertTablePrefix = (prefix: string | undefined): string => {
  if (prefix === undefined || prefix === '') return ''
  if (!PREFIX_PATTERN.test(prefix)) {
    throw new ZaileysStoreError(
      'STORE_CONNECTION_FAILED',
      `invalid tablePrefix ${JSON.stringify(prefix)}: start with a letter, then letters, digits or _ (max 41)`,
    )
  }
  return prefix
}

/**
 * Rewrites the adapter's own table and index names at the driver boundary. With no prefix the SQL
 * is returned untouched, so existing databases keep reading their original tables.
 */
export const tableRewriter = (prefix: string, names: readonly string[]): ((sql: string) => string) => {
  if (prefix === '') return (sql) => sql
  const ordered = [...names].sort((a, b) => b.length - a.length)
  const pattern = new RegExp(`\\b(${ordered.join('|')})\\b`, 'g')
  return (sql) => sql.replace(pattern, (name) => `${prefix}${name}`)
}

export const prefixPgPool = (pool: PgPoolLike, rewrite: (sql: string) => string): PgPoolLike => {
  const wrapClient = (client: PgPoolClientLike): PgPoolClientLike => ({
    query: <R extends Record<string, unknown> = Record<string, unknown>>(
      sql: string,
      params?: readonly unknown[],
    ): Promise<PgQueryResultLike<R>> => client.query<R>(rewrite(sql), params),
    release: () => client.release(),
  })
  return {
    query: <R extends Record<string, unknown> = Record<string, unknown>>(
      sql: string,
      params?: readonly unknown[],
    ): Promise<PgQueryResultLike<R>> => pool.query<R>(rewrite(sql), params),
    connect: async () => wrapClient(await pool.connect()),
    end: () => pool.end(),
  }
}

interface SqliteDbLike {
  prepare: (sql: string) => unknown
  exec: (sql: string) => unknown
}

/** better-sqlite3 methods need the native handle as `this`, so everything else is bound through. */
export const prefixSqliteDb = <D extends SqliteDbLike>(db: D, rewrite: (sql: string) => string): D =>
  new Proxy(db, {
    get(target, prop) {
      if (prop === 'prepare') return (sql: string) => target.prepare(rewrite(sql))
      if (prop === 'exec') return (sql: string) => target.exec(rewrite(sql))
      const value: unknown = Reflect.get(target, prop, target)
      return typeof value === 'function' ? (value as (...args: unknown[]) => unknown).bind(target) : value
    },
  })
