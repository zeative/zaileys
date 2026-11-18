import { jidDecode, jidNormalizedUser } from 'baileys'
import { ZaileysStoreError } from '../types/store-error.js'
import { phoneToJid } from '../utils/jid.js'
import type { MessageStore, SessionHandle, SessionSetOptions } from './types.js'

/** Largest session value, measured as UTF-8 bytes of its JSON. */
export const SESSION_VALUE_MAX_BYTES = 64 * 1024

/** Longest session scope or key, in characters. */
export const SESSION_KEY_MAX_LENGTH = 256

const DEFAULT_MAX_VALUES = 10_000
const DEFAULT_MAX_BYTES = 32 * 1024 * 1024

const describe = (value: unknown): string =>
  typeof value === 'string' ? `a ${value.length}-character string` : typeof value

/** Rejects what a SQL text column or a URL-encoded key cannot hold faithfully: NUL and lone surrogates. */
export const assertSessionPart = (label: 'scope' | 'key', value: string): string => {
  const ok =
    typeof value === 'string' &&
    value.length > 0 &&
    value.length <= SESSION_KEY_MAX_LENGTH &&
    !value.includes('\u0000')
  if (ok) {
    try {
      encodeURIComponent(value)
      return value
    } catch {
      void 0
    }
  }
  throw new ZaileysStoreError(
    'STORE_INVALID_INPUT',
    `session ${label} must be 1-${SESSION_KEY_MAX_LENGTH} characters of well-formed text without NUL, got ${describe(value)}`,
  )
}

/** The TTL in whole milliseconds, or `undefined` for a value that never expires. */
export const assertSessionTtl = (ttlMs: number | undefined): number | undefined => {
  if (ttlMs === undefined) return undefined
  if (typeof ttlMs !== 'number' || !Number.isFinite(ttlMs) || ttlMs <= 0) {
    throw new ZaileysStoreError(
      'STORE_INVALID_INPUT',
      `session ttl must be a positive, finite number of milliseconds (leave it out to keep the value), got ${String(ttlMs)}`,
    )
  }
  return Math.ceil(ttlMs)
}

export const encodeSessionValue = (value: unknown): string => {
  let raw: string | undefined
  try {
    raw = JSON.stringify(value)
  } catch (err) {
    throw new ZaileysStoreError('STORE_INVALID_INPUT', 'session value must be JSON-serialisable', { cause: err })
  }
  if (raw === undefined) {
    throw new ZaileysStoreError(
      'STORE_INVALID_INPUT',
      `session value must be JSON-serialisable, got ${typeof value}; use delete() to remove a key`,
    )
  }
  /** A UTF-16 code unit is never less than one UTF-8 byte, so the length is a cheap lower bound. */
  if (raw.length > SESSION_VALUE_MAX_BYTES || Buffer.byteLength(raw, 'utf8') > SESSION_VALUE_MAX_BYTES) {
    throw new ZaileysStoreError(
      'STORE_VALUE_TOO_LARGE',
      `session value is ${Buffer.byteLength(raw, 'utf8')} bytes as JSON; the limit is ${SESSION_VALUE_MAX_BYTES} (64 KB)`,
    )
  }
  return raw
}

/** Size is checked before parsing, so a row written around the store cannot make a read parse megabytes. */
export const decodeSessionValue = (raw: string, maxBytes: number = SESSION_VALUE_MAX_BYTES): unknown => {
  if (raw.length > maxBytes) {
    throw new ZaileysStoreError('STORE_CORRUPTED', `stored session value is larger than ${maxBytes} bytes`)
  }
  try {
    return JSON.parse(raw) as unknown
  } catch (err) {
    throw new ZaileysStoreError('STORE_CORRUPTED', 'failed to parse stored session value', { cause: err })
  }
}

/** Key-safe form of a scope or key: no `:` to split on and no glob metacharacter for a Redis `MATCH`. */
export const encodeSessionKeyPart = (part: string): string => encodeURIComponent(part).replace(/\*/g, '%2A')

/**
 * Scope for a user: device suffix dropped, `c.us` folded into `s.whatsapp.net`. A phone number and a LID
 * stay different scopes, because nothing here can prove they are the same person.
 */
export const sessionScopeOf = (jid: string): string => {
  if (typeof jid === 'string' && jid.length > 0 && jid.length <= SESSION_KEY_MAX_LENGTH) {
    const normalized = jidNormalizedUser(jid.includes('@') ? jid : phoneToJid(jid))
    if (jidDecode(normalized)?.user) return normalized
  }
  throw new ZaileysStoreError(
    'STORE_INVALID_INPUT',
    `client.session() needs a user JID or a phone number, got ${describe(jid)}`,
  )
}

export interface MemorySessionValuesOptions {
  /** Most values kept across every scope; the least recently written goes first. Default 10 000. */
  maxValues?: number
  /** Most JSON characters, keys included, kept across every value; the least recently written goes first. Default 32 MiB. */
  maxBytes?: number
}

type Entry = { scope: string; raw: string; size: number; expiresAt: number | undefined }

const entryId = (scope: string, key: string): string => `${scope.length}:${scope}${key}`

/** Bounded in-memory session values, used by `MemoryMessageStore` and as the fallback for stores without them. */
export class MemorySessionValues {
  private readonly entries: Map<string, Entry> = new Map()
  private readonly byScope: Map<string, Set<string>> = new Map()
  private size = 0
  private readonly maxValues: number
  private readonly maxBytes: number

  constructor(options: MemorySessionValuesOptions = {}) {
    const maxValues = options.maxValues ?? DEFAULT_MAX_VALUES
    const maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES
    if (!(maxValues >= 1) || !(maxBytes >= SESSION_VALUE_MAX_BYTES)) {
      throw new ZaileysStoreError(
        'STORE_CONNECTION_FAILED',
        `session limits: maxSessionValues must be 1 or more and maxSessionBytes at least ${SESSION_VALUE_MAX_BYTES}, got ${String(maxValues)} and ${String(maxBytes)}`,
      )
    }
    this.maxValues = maxValues
    this.maxBytes = maxBytes
  }

  async get(scope: string, key: string): Promise<unknown> {
    const id = entryId(assertSessionPart('scope', scope), assertSessionPart('key', key))
    const entry = this.entries.get(id)
    if (!entry) return undefined
    if (entry.expiresAt !== undefined && entry.expiresAt <= Date.now()) {
      this.remove(id)
      return undefined
    }
    return decodeSessionValue(entry.raw)
  }

  async set(scope: string, key: string, value: unknown, ttlMs?: number): Promise<void> {
    const id = entryId(assertSessionPart('scope', scope), assertSessionPart('key', key))
    const raw = encodeSessionValue(value)
    const ttl = assertSessionTtl(ttlMs)
    this.remove(id)
    const size = raw.length + id.length
    this.entries.set(id, { scope, raw, size, expiresAt: ttl === undefined ? undefined : Date.now() + ttl })
    this.size += size
    let ids = this.byScope.get(scope)
    if (!ids) {
      ids = new Set()
      this.byScope.set(scope, ids)
    }
    ids.add(id)
    while (this.entries.size > this.maxValues || this.size > this.maxBytes) {
      const oldest = this.entries.keys().next()
      if (oldest.done) break
      this.remove(oldest.value)
    }
  }

  async delete(scope: string, key: string): Promise<void> {
    this.remove(entryId(assertSessionPart('scope', scope), assertSessionPart('key', key)))
  }

  async clearScope(scope: string): Promise<void> {
    const ids = this.byScope.get(assertSessionPart('scope', scope))
    if (!ids) return
    for (const id of [...ids]) this.remove(id)
  }

  clearAll(): void {
    this.entries.clear()
    this.byScope.clear()
    this.size = 0
  }

  private remove(id: string): void {
    const entry = this.entries.get(id)
    if (!entry) return
    this.entries.delete(id)
    this.size -= entry.size
    const ids = this.byScope.get(entry.scope)
    if (!ids) return
    ids.delete(id)
    if (ids.size === 0) this.byScope.delete(entry.scope)
  }
}

type SessionBackend = {
  get(scope: string, key: string): Promise<unknown>
  set(scope: string, key: string, value: unknown, ttlMs?: number): Promise<void>
  delete(scope: string, key: string): Promise<void>
  clear(scope: string): Promise<void>
}

const storeBackend = (store: MessageStore): SessionBackend | undefined => {
  const { getSessionValue, setSessionValue, deleteSessionValue, clearSession } = store
  if (!getSessionValue || !setSessionValue || !deleteSessionValue || !clearSession) return undefined
  return {
    get: (scope, key) => getSessionValue.call(store, scope, key),
    set: (scope, key, value, ttlMs) => setSessionValue.call(store, scope, key, value, ttlMs),
    delete: (scope, key) => deleteSessionValue.call(store, scope, key),
    clear: (scope) => clearSession.call(store, scope),
  }
}

/** Hands out per-JID session handles for one client, backed by its message store. */
export class SessionScopes {
  private backend: SessionBackend | undefined

  constructor(
    private readonly store: MessageStore,
    private readonly logger: { warn(...args: unknown[]): void },
  ) {}

  /** Never throws: a JID that cannot be a scope rejects on the first call instead, so building a command context stays safe. */
  handle(jid: string): SessionHandle {
    let scope: string | undefined
    const scoped = async <R>(run: (backend: SessionBackend, scope: string) => Promise<R>): Promise<R> => {
      scope ??= sessionScopeOf(jid)
      return run(this.resolve(), scope)
    }
    return {
      get: <T = unknown>(key: string) => scoped((b, s) => b.get(s, key) as Promise<T | undefined>),
      set: (key: string, value: unknown, options?: SessionSetOptions) =>
        scoped((b, s) => b.set(s, key, value, options?.ttl)),
      delete: (key: string) => scoped((b, s) => b.delete(s, key)),
      clear: () => scoped((b, s) => b.clear(s)),
    }
  }

  private resolve(): SessionBackend {
    if (this.backend) return this.backend
    const fromStore = storeBackend(this.store)
    if (fromStore) {
      this.backend = fromStore
      return fromStore
    }
    const ctorName = (this.store as { constructor?: { name?: string } }).constructor?.name
    const name = ctorName && ctorName !== 'Object' ? ctorName : 'the message store'
    this.logger.warn(
      { store: name },
      `${name} has no session methods; ctx.session and client.session() keep values in a bounded in-memory map that is emptied on restart`,
    )
    const memory = new MemorySessionValues()
    this.backend = {
      get: (s, k) => memory.get(s, k),
      set: (s, k, v, t) => memory.set(s, k, v, t),
      delete: (s, k) => memory.delete(s, k),
      clear: (s) => memory.clearScope(s),
    }
    return this.backend
  }
}
