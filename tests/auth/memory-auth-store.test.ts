import { describe, expect, it } from 'vitest'
import { MemoryAuthStore } from '../../src/auth/adapters/memory.js'
import { ZaileysStoreError } from '../../src/types/store-error.js'
import { runAuthStoreContract } from '../contracts/index.js'
import { sampleCreds } from '../contracts/fixtures.js'

runAuthStoreContract('MemoryAuthStore', () => new MemoryAuthStore())

describe('MemoryAuthStore — adapter specifics', () => {
  it('constructs with no arguments', () => {
    const store = new MemoryAuthStore()
    expect(store.signal).toBeDefined()
    expect(store.creds).toBeDefined()
  })

  it('isolates writeCreds input via structuredClone (caller mutations do not bleed in)', async () => {
    const store = new MemoryAuthStore()
    const creds = sampleCreds()
    const originalId = creds.registrationId
    await store.creds.writeCreds(creds)
    creds.registrationId = 999_999
    const read = await store.creds.readCreds()
    expect(read!.registrationId).toBe(originalId)
  })

  it('close() blocks all further operations with STORE_CLOSED', async () => {
    const store = new MemoryAuthStore()
    await store.signal.close()
    await expect(store.signal.read('session', ['1'])).rejects.toBeInstanceOf(ZaileysStoreError)
    await expect(store.creds.deleteCreds()).rejects.toMatchObject({ code: 'STORE_CLOSED' })
  })
})
