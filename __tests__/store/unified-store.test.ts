import { describe, it, expect, vi } from 'vitest'
import { ns, Store } from '../../src/store/unified-store'

describe('Unified Store', () => {
  it('should create a namespaced store', () => {
    const store = ns('test-ns')
    expect(store).toBeInstanceOf(Store)
    expect(store.namespace).toBe('test-ns')
  })

  it('should set and get values', () => {
    const store = ns('test-set')
    store.set('foo', { bar: 1 })
    expect(store.get('foo')).toEqual({ bar: 1 })
  })

  it('should emit events on set', () => {
    const store = ns('test-events')
    const spy = vi.fn()
    store.on('set', spy)
    
    store.set('key', { val: 123 })
    expect(spy).toHaveBeenCalledWith({
      key: 'key',
      value: { val: 123 },
      old: undefined
    })
  })

  it('should handle TTL and eviction', async () => {
    const store = ns('test-ttl', { ttl: 10, max: 2 })
    store.set('a', { id: 1 })
    store.set('b', { id: 2 })
    store.set('c', { id: 3 })
    
    // 'a' should be evicted because max is 2
    expect(store.has('a')).toBe(false)
    expect(store.has('b')).toBe(true)
    expect(store.has('c')).toBe(true)
  })
})
