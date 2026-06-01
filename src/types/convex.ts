import { ZaileysStoreError } from './store-error.js'

export interface ConvexClientLike {
  query(name: string, args: Record<string, unknown>): Promise<unknown>
  mutation(name: string, args: Record<string, unknown>): Promise<unknown>
}

export interface ConvexKvOptions {
  client?: ConvexClientLike
  url?: string
  namespace?: string
}

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

  async get(keys: readonly string[]): Promise<Map<string, string>> {
    this.assertOpen()
    if (keys.length === 0) return new Map()
    const client = await this.ensureClient()
    const rows = await this.runRead(() => client.query(FN.get, { namespace: this.namespace, keys: [...keys] }))
    const out = new Map<string, string>()
    for (const row of (rows as ConvexKvRow[] | null) ?? []) out.set(row.key, row.value)
    return out
  }

  async set(items: readonly ConvexKvRow[]): Promise<void> {
    this.assertOpen()
    if (items.length === 0) return
    const client = await this.ensureClient()
    await this.runWrite(() => client.mutation(FN.set, { namespace: this.namespace, items: [...items] }))
  }

  async del(keys: readonly string[]): Promise<void> {
    this.assertOpen()
    if (keys.length === 0) return
    const client = await this.ensureClient()
    await this.runWrite(() => client.mutation(FN.del, { namespace: this.namespace, keys: [...keys] }))
  }

  async clear(prefix?: string): Promise<void> {
    this.assertOpen()
    const client = await this.ensureClient()
    await this.runWrite(() =>
      client.mutation(FN.clear, prefix === undefined ? { namespace: this.namespace } : { namespace: this.namespace, prefix }),
    )
  }

  async list(prefix: string, options?: { before?: number; limit?: number }): Promise<ConvexKvRow[]> {
    this.assertOpen()
    const client = await this.ensureClient()
    const args: Record<string, unknown> = { namespace: this.namespace, prefix }
    if (typeof options?.before === 'number') args['before'] = options.before
    if (typeof options?.limit === 'number') args['limit'] = options.limit
    const rows = await this.runRead(() => client.query(FN.list, args))
    return (rows as ConvexKvRow[] | null) ?? []
  }

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
