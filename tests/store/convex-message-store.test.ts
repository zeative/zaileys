import { randomBytes } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { ConvexMessageStore } from '../../src/store/adapters/convex.js'
import { ZaileysStoreError } from '../../src/types/store-error.js'
import { runMessageStoreContract } from '../contracts/index.js'
import { fakeConvex } from '../contracts/fake-convex.js'

const freshNs = (): string => `test-convex-msg-${randomBytes(4).toString('hex')}`

describe('ConvexMessageStore — construction', () => {
  it('rejects when neither client nor url is given', () => {
    expect(() => new ConvexMessageStore({} as never)).toThrow(ZaileysStoreError)
  })

  it('rejects when both client and url are given', () => {
    expect(() => new ConvexMessageStore({ client: fakeConvex(), url: 'https://x.convex.cloud' })).toThrow(ZaileysStoreError)
  })

  it('throws STORE_CLOSED after close()', async () => {
    const store = new ConvexMessageStore({ client: fakeConvex(), namespace: freshNs() })
    await store.close()
    await expect(store.getMessage({ remoteJid: 'a@s.whatsapp.net', fromMe: false, id: 'x' })).rejects.toBeInstanceOf(ZaileysStoreError)
  })

  it('persists and lists scheduled jobs', async () => {
    const store = new ConvexMessageStore({ client: fakeConvex(), namespace: freshNs() })
    await store.saveScheduledJob({ id: 'j1', fireAt: 100, recipient: 'a@s.whatsapp.net', payload: { text: 'hi' } })
    await store.saveScheduledJob({ id: 'j2', fireAt: 200, recipient: 'b@s.whatsapp.net', payload: { text: 'yo' } })
    const jobs = await store.listScheduledJobs!()
    expect(jobs.map((j) => j.id).sort()).toEqual(['j1', 'j2'])
    await store.deleteScheduledJob!('j1')
    const after = await store.listScheduledJobs!()
    expect(after.map((j) => j.id)).toEqual(['j2'])
    await store.close()
  })
})

describe('ConvexMessageStore — contract suite', () => {
  runMessageStoreContract('ConvexMessageStore', async () => new ConvexMessageStore({ client: fakeConvex(), namespace: freshNs() }))
})
