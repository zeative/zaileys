import { LRUCache } from 'lru-cache'
import { EventEmitter } from 'eventemitter3'

/**
 * Unified Store for Zaileys V4.
 * Uses high-performance lru-cache and eventemitter3 for optimal speed.
 */

export interface StoreOptions<T extends object = any> {
  max?: number
  ttl?: number // in milliseconds
  updateAgeOnGet?: boolean
}

export class Store<T extends object = any> extends EventEmitter {
  private cache: LRUCache<string, T>

  constructor(readonly namespace: string, options: StoreOptions<T> = {}) {
    super()
    this.cache = new LRUCache<string, T>({
      max: options.max || 500,
      ttl: options.ttl,
      updateAgeOnGet: options.updateAgeOnGet ?? true,
    })
  }

  /**
   * Data access methods
   */

  set(key: string, value: T): void {
    const old = this.cache.get(key)
    this.cache.set(key, value)
    this.emit('set', { key, value, old })
  }

  get(key: string): T | undefined {
    return this.cache.get(key)
  }

  has(key: string): boolean {
    return this.cache.has(key)
  }

  del(key: string): void {
    const value = this.cache.get(key)
    if (value) {
      this.cache.delete(key)
      this.emit('del', { key, value })
    }
  }

  clear(): void {
    this.cache.clear()
    this.emit('clear')
  }

  size(): number {
    return this.cache.size
  }

  keys(): IterableIterator<string> {
    return this.cache.keys()
  }
}

/**
 * Global Store Instances (Namespacing)
 */

export const storeRegistry = new Map<string, Store>()

export function ns<T extends object = any>(name: string, options?: StoreOptions<T>): Store<T> {
  if (storeRegistry.has(name)) {
    return storeRegistry.get(name) as Store<T>
  }
  const store = new Store<T>(name, options)
  storeRegistry.set(name, store)
  return store
}

// Built-in namespaces as per tech-docs
export const contextStore = ns('ctx', { max: 500, ttl: 10 * 60 * 1000 })
export const cacheStore = ns('cache', { max: 2000, ttl: 5 * 60 * 1000 })
export const rateStore = ns('rate', { max: 5000, ttl: 10 * 1000 })
export const groupStore = ns('group', { max: 500, ttl: 5 * 60 * 1000 })
export const msgStore = ns('msg', { max: 1000 })
