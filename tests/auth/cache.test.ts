import { describe, expect, it } from 'vitest'
import type { SignalDataSet } from 'baileys'
import { MemoryAuthStore } from '../../src/auth/adapters/memory.js'
import { makeCacheableAuthStore } from '../../src/auth/cache.js'
import type { AuthStoreBundle, AuthStoreKey } from '../../src/auth/types.js'
import { sampleCreds, sampleSignalEntries } from '../contracts/fixtures.js'

interface Counters {
  read: number
  write: number
  delete: number
  clear: number
  close: number
  readCreds: number
  writeCreds: number
}

const instrument = (bundle: AuthStoreBundle): { wrapped: AuthStoreBundle; counters: Counters } => {
  const counters: Counters = {
    read: 0,
    write: 0,
    delete: 0,
    clear: 0,
    close: 0,
    readCreds: 0,
    writeCreds: 0,
  }
  const sig = bundle.signal
  const cre = bundle.creds
  const wrapped: AuthStoreBundle = {
    signal: {
      read: async (type, ids) => {
        counters.read += 1
        return sig.read(type, ids)
      },
      write: async (data) => {
        counters.write += 1
        await sig.write(data)
      },
      delete: async (type, ids) => {
        counters.delete += 1
        await sig.delete(type, ids)
      },
      clear: async () => {
        counters.clear += 1
        await sig.clear()
      },
      close: async () => {
        counters.close += 1
        await sig.close()
      },
    },
    creds: {
      readCreds: async () => {
        counters.readCreds += 1
        return cre.readCreds()
      },
      writeCreds: async (c) => {
        counters.writeCreds += 1
        await cre.writeCreds(c)
      },
      deleteCreds: async () => cre.deleteCreds(),
    },
  }
  return { wrapped, counters }
}

describe('makeCacheableAuthStore', () => {
  const PRE_KEY: AuthStoreKey = 'pre-key'

  it('C1: 1000 sequential reads hit underlying at most once per id', async () => {
    const { wrapped, counters } = instrument(new MemoryAuthStore())
    const cached = makeCacheableAuthStore(wrapped)
    const entries = sampleSignalEntries('1')
    await cached.signal.write({ 'pre-key': entries['pre-key'] } as SignalDataSet)
    counters.read = 0
    for (let i = 0; i < 1000; i += 1) {
      const out = await cached.signal.read(PRE_KEY, ['1'])
      expect(out['1']).toBeDefined()
    }
    expect(counters.read).toBeLessThanOrEqual(1)
  })

  it('C2: write invalidates cached value', async () => {
    const cached = makeCacheableAuthStore(new MemoryAuthStore())
    const first = sampleSignalEntries('1')
    await cached.signal.write({ 'pre-key': first['pre-key'] } as SignalDataSet)
    const a = await cached.signal.read(PRE_KEY, ['1'])
    expect(a['1']).toBeDefined()
    const updated = {
      public: Buffer.alloc(32, 0xff),
      private: Buffer.alloc(32, 0x11),
    }
    await cached.signal.write({ 'pre-key': { '1': updated } } as SignalDataSet)
    const b = await cached.signal.read(PRE_KEY, ['1'])
    expect(Buffer.compare(Buffer.from(b['1']!.public), Buffer.from(updated.public))).toBe(0)
  })

  it('C3: delete invalidates cache', async () => {
    const cached = makeCacheableAuthStore(new MemoryAuthStore())
    const entries = sampleSignalEntries('1')
    await cached.signal.write({ 'pre-key': entries['pre-key'] } as SignalDataSet)
    await cached.signal.read(PRE_KEY, ['1'])
    await cached.signal.delete(PRE_KEY, ['1'])
    const out = await cached.signal.read(PRE_KEY, ['1'])
    expect(out['1'] == null).toBe(true)
  })

  it('C4: creds writes/reads bypass the cache layer entirely', async () => {
    const { wrapped, counters } = instrument(new MemoryAuthStore())
    const cached = makeCacheableAuthStore(wrapped)
    const creds = sampleCreds()
    await cached.creds.writeCreds(creds)
    await cached.creds.readCreds()
    expect(counters.writeCreds).toBe(1)
    expect(counters.readCreds).toBe(1)
  })

  it('C5: clear wipes underlying AND cache', async () => {
    const { wrapped, counters } = instrument(new MemoryAuthStore())
    const cached = makeCacheableAuthStore(wrapped)
    const entries = sampleSignalEntries('1')
    await cached.signal.write({ 'pre-key': entries['pre-key'] } as SignalDataSet)
    await cached.signal.read(PRE_KEY, ['1'])
    counters.read = 0
    await cached.signal.clear()
    const after = await cached.signal.read(PRE_KEY, ['1'])
    expect(after['1']).toBeUndefined()
    expect(counters.read).toBeGreaterThanOrEqual(1)
  })

  it('C6: close proxies to underlying.close', async () => {
    const { wrapped, counters } = instrument(new MemoryAuthStore())
    const cached = makeCacheableAuthStore(wrapped)
    await cached.signal.close()
    expect(counters.close).toBe(1)
  })
})
