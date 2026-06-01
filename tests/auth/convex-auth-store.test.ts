import { randomBytes } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { ConvexAuthStore } from '../../src/auth/adapters/convex.js'
import { ZaileysStoreError } from '../../src/types/store-error.js'
import { runAuthStoreContract } from '../contracts/index.js'
import { fakeConvex } from '../contracts/fake-convex.js'

const freshNs = (): string => `test-convex-auth-${randomBytes(4).toString('hex')}`

describe('ConvexAuthStore — construction', () => {
  it('rejects when neither client nor url is given', () => {
    expect(() => new ConvexAuthStore({} as never)).toThrow(ZaileysStoreError)
  })

  it('rejects when both client and url are given', () => {
    expect(() => new ConvexAuthStore({ client: fakeConvex(), url: 'https://x.convex.cloud' })).toThrow(ZaileysStoreError)
  })

  it('throws STORE_CLOSED after signal.close()', async () => {
    const store = new ConvexAuthStore({ client: fakeConvex(), namespace: freshNs() })
    await store.signal.close()
    await expect(store.creds.readCreds()).rejects.toBeInstanceOf(ZaileysStoreError)
  })
})

describe('ConvexAuthStore — contract suite', () => {
  runAuthStoreContract('ConvexAuthStore', async () => new ConvexAuthStore({ client: fakeConvex(), namespace: freshNs() }))
})
