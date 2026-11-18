import { describe, expect, it } from 'vitest'
import { MemoryMessageStore } from '../../src/store/adapters/memory.js'
import { ZaileysStoreError } from '../../src/types/store-error.js'
import { runMessageStoreContract } from '../contracts/index.js'
import { sampleMessages } from '../contracts/fixtures.js'

runMessageStoreContract('MemoryMessageStore', () => new MemoryMessageStore())

describe('MemoryMessageStore — adapter specifics', () => {
  it('constructs with no arguments', () => {
    const store = new MemoryMessageStore()
    expect(store).toBeInstanceOf(MemoryMessageStore)
  })

  it('returned messages are deep-cloned (caller mutation does not affect stored copy)', async () => {
    const store = new MemoryMessageStore()
    const [m] = sampleMessages('iso@s.whatsapp.net', 1)
    await store.saveMessage(m!)
    const read1 = await store.getMessage(m!.key)
    ;(read1 as { message?: { conversation?: string } }).message = { conversation: 'MUTATED' }
    const read2 = await store.getMessage(m!.key)
    expect(read2!.message?.conversation).not.toBe('MUTATED')
  })

  it('close() blocks further operations with STORE_CLOSED', async () => {
    const store = new MemoryMessageStore()
    await store.close()
    await expect(
      store.getMessage({ remoteJid: 'a@s.whatsapp.net', fromMe: false, id: 'x' }),
    ).rejects.toBeInstanceOf(ZaileysStoreError)
  })
})

describe('MemoryMessageStore — maxMessages', () => {
  const message = (id: string, jid = 'a@s.whatsapp.net', ts = 1) =>
    ({ key: { remoteJid: jid, id, fromMe: false }, message: { conversation: id }, messageTimestamp: ts }) as never

  it('keeps 10 000 messages by default and drops the oldest after that', async () => {
    const store = new MemoryMessageStore()
    for (let i = 0; i <= 10_000; i += 1) await store.saveMessage(message(`m${i}`))
    expect(await store.getMessage({ remoteJid: 'a@s.whatsapp.net', id: 'm0', fromMe: false })).toBeUndefined()
    expect(await store.getMessage({ remoteJid: 'a@s.whatsapp.net', id: 'm1', fromMe: false })).toBeDefined()
    expect(await store.getMessage({ remoteJid: 'a@s.whatsapp.net', id: 'm10000', fromMe: false })).toBeDefined()
  })

  it('removes an evicted message from its chat listing too', async () => {
    const store = new MemoryMessageStore({ maxMessages: 2 })
    await store.saveMessage(message('old', 'x@s.whatsapp.net'))
    await store.saveMessage(message('b', 'y@s.whatsapp.net'))
    await store.saveMessage(message('c', 'y@s.whatsapp.net'))
    expect(await store.listMessages('x@s.whatsapp.net')).toEqual([])
    expect((await store.listMessages('y@s.whatsapp.net')).map((m) => m.key.id).sort()).toEqual(['b', 'c'])
  })

  it('does not evict when an existing message is updated in place', async () => {
    const store = new MemoryMessageStore({ maxMessages: 2 })
    await store.saveMessage(message('a'))
    await store.saveMessage(message('b'))
    await store.saveMessage(message('a', 'a@s.whatsapp.net', 2))
    expect(await store.getMessage({ remoteJid: 'a@s.whatsapp.net', id: 'b', fromMe: false })).toBeDefined()
  })

  it('keeps evicting oldest-first across deletes, updates and clear()', async () => {
    const store = new MemoryMessageStore({ maxMessages: 3 })
    const has = async (id: string) =>
      (await store.getMessage({ remoteJid: 'a@s.whatsapp.net', id, fromMe: false })) !== undefined
    for (const id of ['a', 'b', 'c', 'd']) await store.saveMessage(message(id))
    expect(await has('a')).toBe(false)
    await store.deleteMessage({ remoteJid: 'a@s.whatsapp.net', id: 'c', fromMe: false })
    await store.saveMessage(message('b', 'a@s.whatsapp.net', 9))
    await store.saveMessage(message('e'))
    await store.saveMessage(message('f'))
    expect([await has('b'), await has('d'), await has('e'), await has('f')]).toEqual([false, true, true, true])
    await store.clear()
    for (const id of ['g', 'h', 'i', 'j']) await store.saveMessage(message(id))
    expect([await has('g'), await has('h'), await has('i'), await has('j')]).toEqual([false, true, true, true])
  })

  it('accepts Infinity to turn the cap off and rejects a cap below 1', () => {
    expect(() => new MemoryMessageStore({ maxMessages: Number.POSITIVE_INFINITY })).not.toThrow()
    expect(() => new MemoryMessageStore({ maxMessages: 0 })).toThrow(ZaileysStoreError)
  })
})
