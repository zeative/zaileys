import { BufferJSON } from 'baileys'
import type { AuthenticationCreds, SignalDataSet } from 'baileys'
import type { RedisClientLike } from '../../types/optional-clients.js'
import { ZaileysStoreError } from '../../types/store-error.js'
import type {
  AuthCredsStore,
  AuthStore,
  AuthStoreBundle,
  AuthStoreKey,
  AuthStoreValue,
} from '../types.js'

export interface RedisAuthStoreOptions {
  client?: RedisClientLike
  url?: string
  namespace?: string
}

const DEFAULT_NAMESPACE = 'zaileys'

const SIGNAL_TYPES: readonly AuthStoreKey[] = [
  'pre-key',
  'session',
  'sender-key',
  'sender-key-memory',
  'app-state-sync-key',
  'app-state-sync-version',
  'lid-mapping',
  'device-list',
  'tctoken',
  'identity-key',
]

const isPeerMissingError = (err: unknown): boolean => {
  if (typeof err !== 'object' || err === null) return false
  const code = (err as { code?: string }).code
  return code === 'ERR_MODULE_NOT_FOUND' || code === 'MODULE_NOT_FOUND'
}

export class RedisAuthStore implements AuthStoreBundle {
  private readonly namespace: string
  private readonly externalClient: RedisClientLike | undefined
  private readonly url: string | undefined
  private ownedClient: RedisClientLike | undefined
  private ready: Promise<RedisClientLike> | undefined
  private closed = false

  constructor(options: RedisAuthStoreOptions) {
    if (options.client && options.url) {
      throw new ZaileysStoreError(
        'STORE_CONNECTION_FAILED',
        'pass either client OR url, not both',
      )
    }
    if (!options.client && !options.url) {
      throw new ZaileysStoreError(
        'STORE_CONNECTION_FAILED',
        'RedisAuthStore requires either client or url',
      )
    }
    this.namespace = options.namespace ?? DEFAULT_NAMESPACE
    this.externalClient = options.client
    this.url = options.url
  }

  readonly signal: AuthStore = {
    read: async <K extends AuthStoreKey>(
      type: K,
      ids: readonly string[],
    ): Promise<{ [id: string]: AuthStoreValue<K> | undefined }> => {
      this.assertOpen()
      if (ids.length === 0) return {}
      const client = await this.ensureReady()
      const keys = ids.map((id) => this.signalKey(type, id))
      const values = await this.runRead(() => client.mGet(keys))
      const out: { [id: string]: AuthStoreValue<K> | undefined } = {}
      for (let i = 0; i < ids.length; i += 1) {
        const raw = values[i]
        if (raw == null) continue
        out[ids[i]!] = JSON.parse(raw, BufferJSON.reviver) as AuthStoreValue<K>
      }
      return out
    },
    write: async (data: SignalDataSet): Promise<void> => {
      this.assertOpen()
      const client = await this.ensureReady()
      const multi = client.multi()
      let queued = 0
      for (const rawType of Object.keys(data) as AuthStoreKey[]) {
        const entries = (data as Record<string, Record<string, unknown> | undefined>)[rawType]
        if (!entries) continue
        for (const id of Object.keys(entries)) {
          const value = entries[id]
          const key = this.signalKey(rawType, id)
          const idx = this.indexKey(rawType)
          if (value === null) {
            multi.del(key)
            multi.sRem(idx, id)
          } else if (value !== undefined) {
            multi.set(key, JSON.stringify(value, BufferJSON.replacer))
            multi.sAdd(idx, id)
          }
          queued += 1
        }
      }
      if (queued === 0) return
      await this.runWrite(() => multi.exec())
    },
    delete: async <K extends AuthStoreKey>(type: K, ids: readonly string[]): Promise<void> => {
      this.assertOpen()
      if (ids.length === 0) return
      const client = await this.ensureReady()
      const multi = client.multi()
      for (const id of ids) {
        multi.del(this.signalKey(type, id))
        multi.sRem(this.indexKey(type), id)
      }
      await this.runWrite(() => multi.exec())
    },
    clear: async (): Promise<void> => {
      this.assertOpen()
      const client = await this.ensureReady()
      const multi = client.multi()
      for (const type of SIGNAL_TYPES) {
        const idx = this.indexKey(type)
        const members = await this.runRead(() => client.sMembers(idx))
        for (const id of members) {
          multi.del(this.signalKey(type, id))
        }
        multi.del(idx)
      }
      multi.del(this.credsKey())
      await this.runWrite(() => multi.exec())
    },
    close: async (): Promise<void> => {
      await this.shutdown()
    },
  }

  readonly creds: AuthCredsStore = {
    readCreds: async (): Promise<AuthenticationCreds | undefined> => {
      this.assertOpen()
      const client = await this.ensureReady()
      const raw = await this.runRead(() => client.get(this.credsKey()))
      if (raw == null) return undefined
      return JSON.parse(raw, BufferJSON.reviver) as AuthenticationCreds
    },
    writeCreds: async (next: AuthenticationCreds): Promise<void> => {
      this.assertOpen()
      const client = await this.ensureReady()
      await this.runWrite(() =>
        client.set(this.credsKey(), JSON.stringify(next, BufferJSON.replacer)),
      )
    },
    deleteCreds: async (): Promise<void> => {
      this.assertOpen()
      const client = await this.ensureReady()
      await this.runWrite(() => client.del(this.credsKey()))
    },
  }

  private credsKey(): string {
    return `${this.namespace}:auth:creds`
  }

  private signalKey(type: AuthStoreKey, id: string): string {
    return `${this.namespace}:auth:signal:${String(type)}:${id}`
  }

  private indexKey(type: AuthStoreKey): string {
    return `${this.namespace}:auth:signal-index:${String(type)}`
  }

  private async ensureReady(): Promise<RedisClientLike> {
    if (!this.ready) {
      this.ready = this.connect()
    }
    return this.ready
  }

  private async connect(): Promise<RedisClientLike> {
    if (this.externalClient) {
      if (!this.externalClient.isOpen) {
        throw new ZaileysStoreError(
          'STORE_CONNECTION_FAILED',
          'provided redis client is not open (call await client.connect() first)',
        )
      }
      return this.externalClient
    }
    let mod: { createClient: (options: { url?: string }) => unknown }
    try {
      mod = (await import('redis')) as typeof mod
    } catch (err) {
      if (isPeerMissingError(err)) {
        throw new ZaileysStoreError(
          'STORE_NOT_AVAILABLE',
          'redis peer dependency missing. Run: pnpm add redis',
          { cause: err },
        )
      }
      throw new ZaileysStoreError(
        'STORE_CONNECTION_FAILED',
        'failed to load redis module',
        { cause: err },
      )
    }
    const created = mod.createClient({ url: this.url! }) as RedisClientLike
    try {
      await created.connect()
    } catch (err) {
      throw new ZaileysStoreError(
        'STORE_CONNECTION_FAILED',
        `failed to connect to redis at ${this.url}`,
        { cause: err },
      )
    }
    this.ownedClient = created
    return created
  }

  private async runRead<T>(fn: () => Promise<T>): Promise<T> {
    try {
      return await fn()
    } catch (err) {
      throw new ZaileysStoreError('STORE_READ_FAILED', 'redis read failed', { cause: err })
    }
  }

  private async runWrite<T>(fn: () => Promise<T>): Promise<T> {
    try {
      return await fn()
    } catch (err) {
      throw new ZaileysStoreError('STORE_WRITE_FAILED', 'redis write failed', { cause: err })
    }
  }

  private async shutdown(): Promise<void> {
    if (this.closed) return
    this.closed = true
    if (this.ownedClient) {
      try {
        await this.ownedClient.quit()
      } catch {
        void 0
      }
      this.ownedClient = undefined
    }
    this.ready = undefined
  }

  private assertOpen(): void {
    if (this.closed) {
      throw new ZaileysStoreError('STORE_CLOSED', 'RedisAuthStore is closed')
    }
  }
}
