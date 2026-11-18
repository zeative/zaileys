import { LRUCache } from 'lru-cache'
import type { CacheStore } from 'baileys'

export interface SocketCachesClock {
  now(): number
}

export interface SocketCaches {
  msgRetryCounterCache: CacheStore
  userDevicesCache: CacheStore
}

/** Mirrors baileys' own TTLs; the bound is ours, since the NodeCache baileys falls back to has none. */
const RETRY_TTL_MS = 60 * 60_000
const DEVICES_TTL_MS = 5 * 60_000
const MAX_ENTRIES = 10_000

const boundedStore = (ttl: number, perf: SocketCachesClock): CacheStore => {
  const cache = new LRUCache<string, NonNullable<unknown>>({ max: MAX_ENTRIES, ttl, ttlResolution: 0, perf })
  return {
    get: <T>(key: string) => cache.get(key) as T | undefined,
    set: <T>(key: string, value: T) => {
      if (value === undefined || value === null) cache.delete(key)
      else cache.set(key, value)
    },
    del: (key: string) => cache.delete(key),
    flushAll: () => cache.clear(),
  }
}

/**
 * Caches that must outlive a single socket. Baileys builds fresh ones per socket, so every reconnect
 * forgot retry counts (letting a decrypt-retry loop restart) and re-queried every recipient's devices.
 */
export const createSocketCaches = (clock: SocketCachesClock = performance): SocketCaches => ({
  msgRetryCounterCache: boundedStore(RETRY_TTL_MS, clock),
  userDevicesCache: boundedStore(DEVICES_TTL_MS, clock),
})
