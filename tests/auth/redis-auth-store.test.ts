import { randomBytes } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { RedisAuthStore } from '../../src/auth/adapters/redis.js'
import { ZaileysStoreError } from '../../src/types/store-error.js'
import { runAuthStoreContract } from '../contracts/index.js'

const REDIS_URL = process.env.REDIS_URL

const freshNs = (): string => `test-redis-auth-${randomBytes(4).toString('hex')}`

describe('RedisAuthStore — smoke (always runs)', () => {
  it('constructor rejects when neither client nor url provided', () => {
    expect(() => new RedisAuthStore({} as never)).toThrow(ZaileysStoreError)
  })

  it('constructor rejects when both client and url provided', () => {
    const stub = { isOpen: true } as never
    expect(() => new RedisAuthStore({ client: stub, url: 'redis://x' })).toThrow(ZaileysStoreError)
  })

  it('not-open injected client throws STORE_CONNECTION_FAILED on first op', async () => {
    const stub = { isOpen: false } as never
    const store = new RedisAuthStore({ client: stub })
    await expect(store.creds.readCreds()).rejects.toMatchObject({
      code: 'STORE_CONNECTION_FAILED',
    })
  })

  it('post-close throws STORE_CLOSED (no url connect attempted)', async () => {
    const store = new RedisAuthStore({ url: 'redis://127.0.0.1:0' })
    await store.signal.close()
    await expect(store.creds.readCreds()).rejects.toMatchObject({ code: 'STORE_CLOSED' })
    await expect(store.signal.read('session', ['1'])).rejects.toMatchObject({ code: 'STORE_CLOSED' })
  })

  it('close is idempotent', async () => {
    const store = new RedisAuthStore({ url: 'redis://127.0.0.1:0' })
    await store.signal.close()
    await expect(store.signal.close()).resolves.toBeUndefined()
  })
})

describe.skipIf(!REDIS_URL)('RedisAuthStore — contract suite', () => {
  runAuthStoreContract(
    'RedisAuthStore',
    async () => {
      const store = new RedisAuthStore({ url: REDIS_URL!, namespace: freshNs() })
      await store.creds.readCreds().catch(() => undefined)
      return store
    },
    async (bundle) => {
      await bundle.signal.clear().catch(() => undefined)
    },
  )
})

describe.skipIf(!REDIS_URL)('RedisAuthStore — adapter specifics', () => {
  it('R3: caller-provided client is NOT closed by adapter', async () => {
    const { createClient } = await import('redis')
    const client = createClient({ url: REDIS_URL! })
    await client.connect()
    const store = new RedisAuthStore({ client: client as never, namespace: freshNs() })
    await store.creds.writeCreds({ registrationId: 1 } as never)
    await store.signal.close()
    expect(client.isOpen).toBe(true)
    await client.quit()
  })

  it('R4: url-injected client IS closed by adapter', async () => {
    const ns = freshNs()
    const store = new RedisAuthStore({ url: REDIS_URL!, namespace: ns })
    await store.creds.writeCreds({ registrationId: 7 } as never)
    await store.signal.close()
    const { createClient } = await import('redis')
    const verify = createClient({ url: REDIS_URL! })
    await verify.connect()
    const remaining = await verify.get(`${ns}:auth:creds`)
    expect(remaining).not.toBeNull()
    await verify.del(`${ns}:auth:creds`)
    await verify.quit()
  })

  it('R5: namespace isolation between two adapters on same DB', async () => {
    const a = new RedisAuthStore({ url: REDIS_URL!, namespace: freshNs() })
    const b = new RedisAuthStore({ url: REDIS_URL!, namespace: freshNs() })
    await a.signal.write({ session: { '1': Uint8Array.from([0xaa]) } })
    const readB = await b.signal.read('session', ['1'])
    expect(readB['1']).toBeUndefined()
    await a.signal.clear()
    await b.signal.clear()
    await a.signal.close()
    await b.signal.close()
  })
})
