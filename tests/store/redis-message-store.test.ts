import { randomBytes } from 'node:crypto'
import { EventEmitter } from 'node:events'
import { describe, expect, it } from 'vitest'
import { RedisMessageStore } from '../../src/store/adapters/redis.js'
import { ZaileysStoreError } from '../../src/types/store-error.js'
import { runMessageStoreContract } from '../contracts/index.js'
import { sampleChat, sampleMessages } from '../contracts/fixtures.js'

const REDIS_URL = process.env.REDIS_URL

const freshNs = (): string => `test-redis-msg-${randomBytes(4).toString('hex')}`

describe('RedisMessageStore — smoke (always runs)', () => {
  it('constructor rejects when neither client nor url provided', () => {
    expect(() => new RedisMessageStore({} as never)).toThrow(ZaileysStoreError)
  })

  it('constructor rejects when both client and url provided', () => {
    const stub = { isOpen: true } as never
    expect(() => new RedisMessageStore({ client: stub, url: 'redis://x' })).toThrow(
      ZaileysStoreError,
    )
  })

  it('not-open injected client throws STORE_CONNECTION_FAILED on first op', async () => {
    const stub = { isOpen: false } as never
    const store = new RedisMessageStore({ client: stub })
    await expect(store.getChat('a@s.whatsapp.net')).rejects.toMatchObject({
      code: 'STORE_CONNECTION_FAILED',
    })
  })

  it('post-close throws STORE_CLOSED', async () => {
    const store = new RedisMessageStore({ url: 'redis://127.0.0.1:0' })
    await store.close()
    await expect(store.getChat('x@s.whatsapp.net')).rejects.toMatchObject({ code: 'STORE_CLOSED' })
  })

  it('close is idempotent', async () => {
    const store = new RedisMessageStore({ url: 'redis://127.0.0.1:0' })
    await store.close()
    await expect(store.close()).resolves.toBeUndefined()
  })
})

describe.skipIf(!REDIS_URL)('RedisMessageStore — contract suite', () => {
  runMessageStoreContract(
    'RedisMessageStore',
    async () => new RedisMessageStore({ url: REDIS_URL!, namespace: freshNs() }),
    async (store) => {
      await store.clear().catch(() => undefined)
    },
  )
})

describe.skipIf(!REDIS_URL)('RedisMessageStore — adapter specifics', () => {
  it('MR1: presence TTL is ~300s after savePresence', async () => {
    const ns = freshNs()
    const store = new RedisMessageStore({ url: REDIS_URL!, namespace: ns })
    await store.savePresence('u@s.whatsapp.net', {
      lastKnownPresence: 'available',
      lastSeen: 1,
    } as never)
    const { createClient } = await import('redis')
    const client = createClient({ url: REDIS_URL! })
    await client.connect()
    const ttl = await client.ttl(`${ns}:presence:u@s.whatsapp.net`)
    expect(ttl).toBeGreaterThan(290)
    expect(ttl).toBeLessThanOrEqual(300)
    await client.quit()
    await store.clear()
    await store.close()
  })

  it('MR2: listMessages returns desc by timestamp regardless of insert order', async () => {
    const ns = freshNs()
    const store = new RedisMessageStore({ url: REDIS_URL!, namespace: ns })
    const jid = 'order@s.whatsapp.net'
    const msgs = sampleMessages(jid, 5)
    const shuffled = [msgs[3]!, msgs[0]!, msgs[4]!, msgs[1]!, msgs[2]!]
    for (const m of shuffled) await store.saveMessage(m)
    const list = await store.listMessages(jid)
    for (let i = 1; i < list.length; i += 1) {
      expect(Number(list[i - 1]!.messageTimestamp)).toBeGreaterThanOrEqual(
        Number(list[i]!.messageTimestamp),
      )
    }
    await store.clear()
    await store.close()
  })

  it('MR3: namespace isolation between two stores', async () => {
    const a = new RedisMessageStore({ url: REDIS_URL!, namespace: freshNs() })
    const b = new RedisMessageStore({ url: REDIS_URL!, namespace: freshNs() })
    await a.saveChat(sampleChat('iso@s.whatsapp.net'))
    const readB = await b.getChat('iso@s.whatsapp.net')
    expect(readB).toBeUndefined()
    await a.clear()
    await b.clear()
    await a.close()
    await b.close()
  })

  it('MR4: clear() via SCAN+DEL wipes large key sets', async () => {
    const ns = freshNs()
    const store = new RedisMessageStore({ url: REDIS_URL!, namespace: ns })
    const writes: Promise<void>[] = []
    for (let i = 0; i < 1200; i += 1) {
      writes.push(store.saveContact({ id: `u${i}@s.whatsapp.net`, name: `n${i}` } as never))
    }
    await Promise.all(writes)
    await store.clear()
    const { createClient } = await import('redis')
    const client = createClient({ url: REDIS_URL! })
    await client.connect()
    let cursor = 0
    let remaining = 0
    do {
      const res = await client.scan(cursor, { MATCH: `${ns}:*`, COUNT: 1000 })
      cursor = Number(res.cursor)
      remaining += res.keys.length
    } while (cursor !== 0)
    expect(remaining).toBe(0)
    await client.quit()
    await store.close()
  })

  it('MR5: bind twice does not double-fire saves', async () => {
    const ns = freshNs()
    const store = new RedisMessageStore({ url: REDIS_URL!, namespace: ns })
    const ev = new EventEmitter()
    store.bind({ ev } as never)
    store.bind({ ev } as never)
    const msgs = sampleMessages('bind@s.whatsapp.net', 1)
    ev.emit('messages.upsert', { messages: msgs, type: 'notify' })
    await new Promise((resolve) => setImmediate(resolve))
    await new Promise((resolve) => setImmediate(resolve))
    const list = await store.listMessages('bind@s.whatsapp.net')
    expect(list.length).toBe(1)
    await store.clear()
    await store.close()
  })
})
