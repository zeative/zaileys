import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NamespaceStore } from '../../src/store/registry'

describe('NamespaceStore', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  it('should set and get values', () => {
    const store = new NamespaceStore('test')
    store.set('k1', 'v1')
    expect(store.get('k1')).toBe('v1')
  })

  it('should enforce max size', () => {
    const store = new NamespaceStore('test', { max: 1 })
    store.set('k1', 'v1')
    store.set('k2', 'v2')
    expect(store.get('k1')).toBeUndefined()
    expect(store.get('k2')).toBe('v2')
  })

  it('should enforce TTL', () => {
    const store = new NamespaceStore('test', { ttl: 100 })
    store.set('k1', 'v1')
    
    vi.advanceTimersByTime(101)
    expect(store.get('k1')).toBeUndefined()
  })
})
