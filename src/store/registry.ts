import EventEmitter from 'eventemitter3'

export interface StoreOptions {
  max?: number
  ttl?: number
}

/**
 * High-performance namespaced store using eventemitter3.
 */
export class NamespaceStore<T = any> extends EventEmitter {
  private data = new Map<string, { value: T; expiresAt?: number }>()

  constructor(public name: string, private options: StoreOptions = {}) {
    super()
  }

  /**
   * Set a value in the store.
   */
  set(key: string, value: T) {
    const expiresAt = this.options.ttl ? Date.now() + this.options.ttl : undefined
    
    // Check max size
    if (this.options.max && this.data.size >= this.options.max) {
      const firstKey = this.data.keys().next().value
      if (firstKey) this.data.delete(firstKey)
    }

    this.data.set(key, { value, expiresAt })
    this.emit('set', key, value)
  }

  /**
   * Get a value from the store.
   */
  get(key: string): T | undefined {
    const item = this.data.get(key)
    if (!item) return undefined

    if (item.expiresAt && Date.now() > item.expiresAt) {
      this.data.delete(key)
      this.emit('delete', key)
      return undefined
    }

    return item.value
  }

  /**
   * Delete a key.
   */
  delete(key: string) {
    this.data.delete(key)
    this.emit('delete', key)
  }

  /**
   * Clear the store.
   */
  clear() {
    this.data.clear()
    this.emit('clear')
  }

  /**
   * Return internal map (for persistence/debugging).
   */
  all(): Map<string, { value: T; expiresAt?: number }> {
    return this.data
  }
}
