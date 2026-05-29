import { describe, expect, it, vi } from 'vitest'
import type { SignalDataSet } from 'baileys'
import type { AuthStore, AuthStoreKey } from '../../src/auth/types.js'
import { signalKeyStoreFromAuthStore } from '../../src/connection/auth-adapter.js'

function createFakeAuthStore(): AuthStore & {
  reads: Array<{ type: AuthStoreKey; ids: readonly string[] }>
  writes: SignalDataSet[]
  cleared: number
  closed: number
  deletes: Array<{ type: AuthStoreKey; ids: readonly string[] }>
} {
  const reads: Array<{ type: AuthStoreKey; ids: readonly string[] }> = []
  const writes: SignalDataSet[] = []
  const deletes: Array<{ type: AuthStoreKey; ids: readonly string[] }> = []
  let cleared = 0
  let closed = 0
  return {
    reads,
    writes,
    deletes,
    get cleared() { return cleared },
    get closed() { return closed },
    read: async (type, ids) => {
      reads.push({ type, ids })
      const out: Record<string, unknown> = {}
      for (const id of ids) out[id] = { fake: type, id }
      return out as never
    },
    write: async (data) => { writes.push(data) },
    delete: async (type, ids) => { deletes.push({ type, ids }) },
    clear: async () => { cleared += 1 },
    close: async () => { closed += 1 },
  }
}

describe('signalKeyStoreFromAuthStore — shape adapter', () => {
  it('exposes get/set/clear matching baileys SignalKeyStore shape', () => {
    const store = createFakeAuthStore()
    const adapter = signalKeyStoreFromAuthStore(store)
    expect(typeof adapter.get).toBe('function')
    expect(typeof adapter.set).toBe('function')
    expect(typeof adapter.clear).toBe('function')
  })

  it('get() proxies to authStore.read with same type + ids', async () => {
    const store = createFakeAuthStore()
    const adapter = signalKeyStoreFromAuthStore(store)
    const result = await adapter.get('pre-key', ['a', 'b'])
    expect(store.reads).toEqual([{ type: 'pre-key', ids: ['a', 'b'] }])
    expect(result).toEqual({ a: { fake: 'pre-key', id: 'a' }, b: { fake: 'pre-key', id: 'b' } })
  })

  it('set() proxies to authStore.write with same SignalDataSet payload', async () => {
    const store = createFakeAuthStore()
    const adapter = signalKeyStoreFromAuthStore(store)
    const data: SignalDataSet = { 'pre-key': { id1: { public: new Uint8Array([1]), private: new Uint8Array([2]) } } }
    await adapter.set(data)
    expect(store.writes).toEqual([data])
  })

  it('clear() proxies to authStore.clear', async () => {
    const store = createFakeAuthStore()
    const adapter = signalKeyStoreFromAuthStore(store)
    await adapter.clear?.()
    expect(store.cleared).toBe(1)
  })

  it('multiple gets are routed independently per type', async () => {
    const store = createFakeAuthStore()
    const adapter = signalKeyStoreFromAuthStore(store)
    await adapter.get('session', ['x'])
    await adapter.get('sender-key', ['y', 'z'])
    expect(store.reads).toEqual([
      { type: 'session', ids: ['x'] },
      { type: 'sender-key', ids: ['y', 'z'] },
    ])
  })

  it('does NOT mutate the original AuthStore reference', () => {
    const store = createFakeAuthStore()
    const adapter = signalKeyStoreFromAuthStore(store)
    expect(adapter).not.toBe(store)
    expect((adapter as unknown as { read?: unknown }).read).toBeUndefined()
    expect((adapter as unknown as { write?: unknown }).write).toBeUndefined()
  })

  it('logger parameter is accepted optionally without runtime impact', async () => {
    const store = createFakeAuthStore()
    const logger = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(), fatal: vi.fn() }
    const adapter = signalKeyStoreFromAuthStore(store, logger)
    await adapter.get('pre-key', ['k'])
    expect(store.reads.length).toBe(1)
  })
})
