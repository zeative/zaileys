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
