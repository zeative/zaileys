import { ZaileysStoreError } from './store-error.js'

/**
 * Structural surface of a Convex client (`ConvexHttpClient` from `convex/browser`
 * is assignable). Function references are passed as `"file:export"` name strings.
 */
export interface ConvexClientLike {
  query(name: string, args: Record<string, unknown>): Promise<unknown>
  mutation(name: string, args: Record<string, unknown>): Promise<unknown>
}

/** Constructor input shared by the Convex auth and message-store adapters. */
export interface ConvexKvOptions {
  /** Pre-built Convex client (caller owns lifecycle). */
  client?: ConvexClientLike
  /** Convex deployment URL; the adapter builds a `ConvexHttpClient`. */
  url?: string
  /** Namespace isolating keys within the shared `zaileys_kv` table. Defaults to `'zaileys'`. */
  namespace?: string
}

/** One key/value row in the `zaileys_kv` table; `sortKey` orders list results (newest-first). */
export type ConvexKvRow = { key: string; value: string; sortKey?: number }

const DEFAULT_NAMESPACE = 'zaileys'
const FN = {
  get: 'zaileys:get',
  set: 'zaileys:set',
  del: 'zaileys:del',
  clear: 'zaileys:clear',
  list: 'zaileys:list',
} as const

const isPeerMissingError = (err: unknown): boolean => {
  if (typeof err !== 'object' || err === null) return false
  const code = (err as { code?: string }).code
  return code === 'ERR_MODULE_NOT_FOUND' || code === 'MODULE_NOT_FOUND'
}

/**
 * Thin namespaced key/value client over the user-deployed Convex `zaileys_kv`
 * functions (`get`/`set`/`del`/`clear`/`list`). Backs both the Convex auth and
 * message-store adapters. Accepts EITHER a pre-built `client` OR a `url` (XOR).
 */
export class ConvexKv {
  readonly namespace: string
  private readonly externalClient: ConvexClientLike | undefined
  private readonly url: string | undefined
  private client: ConvexClientLike | undefined
  private closed = false

  constructor(options: ConvexKvOptions) {
    if (options.client && options.url) {
      throw new ZaileysStoreError('STORE_CONNECTION_FAILED', 'pass either client OR url, not both')
    }
    if (!options.client && !options.url) {
      throw new ZaileysStoreError('STORE_CONNECTION_FAILED', 'ConvexKv requires either client or url')
    }
    this.namespace = options.namespace ?? DEFAULT_NAMESPACE
    this.externalClient = options.client
    this.url = options.url
  }

  /** Fetch values for `keys`; missing keys are absent from the returned map. */
  async get(keys: readonly string[]): Promise<Map<string, string>> {
    this.assertOpen()
    if (keys.length === 0) return new Map()
    const client = await this.ensureClient()
    const rows = await this.runRead(() => client.query(FN.get, { namespace: this.namespace, keys: [...keys] }))
    const out = new Map<string, string>()
    for (const row of (rows as ConvexKvRow[] | null) ?? []) out.set(row.key, row.value)
    return out
  }

  /** Upsert rows by `(namespace, key)`. */
  async set(items: readonly ConvexKvRow[]): Promise<void> {
    this.assertOpen()
    if (items.length === 0) return
    const client = await this.ensureClient()
    await this.runWrite(() => client.mutation(FN.set, { namespace: this.namespace, items: [...items] }))
  }

  /** Delete rows by key. */
  async del(keys: readonly string[]): Promise<void> {
    this.assertOpen()
    if (keys.length === 0) return
    const client = await this.ensureClient()
    await this.runWrite(() => client.mutation(FN.del, { namespace: this.namespace, keys: [...keys] }))
  }

  /** Delete every row in the namespace, or only those whose key starts with `prefix`. */
  async clear(prefix?: string): Promise<void> {
    this.assertOpen()
    const client = await this.ensureClient()
    await this.runWrite(() =>
      client.mutation(FN.clear, prefix === undefined ? { namespace: this.namespace } : { namespace: this.namespace, prefix }),
    )
  }

  /** List rows whose key starts with `prefix`, newest-first by `sortKey`. */
  async list(prefix: string, options?: { before?: number; limit?: number }): Promise<ConvexKvRow[]> {
    this.assertOpen()
    const client = await this.ensureClient()
    const args: Record<string, unknown> = { namespace: this.namespace, prefix }
    if (typeof options?.before === 'number') args['before'] = options.before
    if (typeof options?.limit === 'number') args['limit'] = options.limit
    const rows = await this.runRead(() => client.query(FN.list, args))
    return (rows as ConvexKvRow[] | null) ?? []
  }

  /** Freeze the client; subsequent operations throw `STORE_CLOSED`. Idempotent. */
  close(): void {
    this.closed = true
    this.client = undefined
  }

  private async ensureClient(): Promise<ConvexClientLike> {
    if (this.externalClient) return this.externalClient
    if (this.client) return this.client
    const specifier: string = 'convex/browser'
    let mod: { ConvexHttpClient: new (url: string) => ConvexClientLike }
    try {
      mod = (await import(specifier)) as { ConvexHttpClient: new (url: string) => ConvexClientLike }
    } catch (err) {
      if (isPeerMissingError(err)) {
        throw new ZaileysStoreError('STORE_NOT_AVAILABLE', 'convex peer dependency missing. Run: pnpm add convex', { cause: err })
      }
      throw new ZaileysStoreError('STORE_CONNECTION_FAILED', 'failed to load convex module', { cause: err })
    }
    this.client = new mod.ConvexHttpClient(this.url!)
    return this.client
  }

  private async runRead<T>(fn: () => Promise<T>): Promise<T> {
    try {
      return await fn()
    } catch (err) {
      throw new ZaileysStoreError('STORE_READ_FAILED', 'convex read failed', { cause: err })
    }
  }

  private async runWrite<T>(fn: () => Promise<T>): Promise<T> {
    try {
      return await fn()
    } catch (err) {
      throw new ZaileysStoreError('STORE_WRITE_FAILED', 'convex write failed', { cause: err })
    }
  }

  private assertOpen(): void {
    if (this.closed) {
      throw new ZaileysStoreError('STORE_CLOSED', 'Convex store is closed')
    }
  }
}
