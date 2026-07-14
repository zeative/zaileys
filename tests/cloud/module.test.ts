import { describe, expect, it } from 'vitest'
import { Client } from '../../src/client/client.js'
import { MemoryAuthStore } from '../../src/auth/adapters/memory.js'

describe('wa.cloud namespace', () => {
  it('throws a clear error on the baileys provider', () => {
    const c = new Client({ auth: new MemoryAuthStore(), autoConnect: false, qrTerminal: false, statusLog: false })
    expect(() => c.cloud).toThrowError(/provider/)
  })

  it('is reachable on cloud before connect', () => {
    const c = new Client({
      provider: 'cloud',
      cloud: { accessToken: 'tok', phoneNumberId: '555' },
      autoConnect: false,
      statusLog: false,
    })
    expect(c.cloud.templates).toBeDefined()
    expect(c.cloud.profile).toBeDefined()
    expect(c.cloud.flows).toBeDefined()
    expect(c.cloud.blocklist).toBeDefined()
    expect(c.cloud.qr).toBeDefined()
    expect(c.cloud.analytics).toBeDefined()
    expect(c.cloud.phone).toBeDefined()
  })

  it('waba-scoped ops throw CONFIG without wabaId', async () => {
    const c = new Client({
      provider: 'cloud',
      cloud: { accessToken: 'tok', phoneNumberId: '555' },
      autoConnect: false,
      statusLog: false,
    })
    await expect(c.cloud.templates.list()).rejects.toMatchObject({ code: 'CONFIG' })
  })
})
