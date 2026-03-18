import { NamespaceStore } from './registry'

/**
 * Central registry for all shops.
 */
export class StoreRegistry {
  private namespaces = new Map<string, NamespaceStore>()

  /**
   * Create or get a namespace.
   */
  ns(name: string, options: any = {}): NamespaceStore {
    if (!this.namespaces.has(name)) {
      this.namespaces.set(name, new NamespaceStore(name, options))
    }
    return this.namespaces.get(name)!
  }
}

export const store = new StoreRegistry()

// V4 namespaces
export const contextStore = store.ns('ctx', { max: 500, ttl: 600000 })     // 10m
export const cacheStore = store.ns('cache', { max: 2000, ttl: 300000 })   // 5m
export const rateStore = store.ns('rate', { max: 5000, ttl: 10000 })     // 10s
export const groupStore = store.ns('group', { max: 500, ttl: 300000 })   // 5m
export const msgStore = store.ns('msg', { max: 1000 })
