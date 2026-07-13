import { describe, expect, it } from 'vitest'
import { Client } from '../../src/client/client.js'
import { ZaileysCloudError } from '../../src/cloud/errors.js'
import { MemoryAuthStore } from '../../src/auth/adapters/memory.js'

const validCloud = { accessToken: 'tok', phoneNumberId: '123456' }

describe('cloud provider config validation', () => {
  it('provider cloud without cloud options throws CONFIG', () => {
    expect(() => new Client({ provider: 'cloud', autoConnect: false })).toThrowError(ZaileysCloudError)
    try {
      new Client({ provider: 'cloud', autoConnect: false })
    } catch (err) {
      expect((err as ZaileysCloudError).code).toBe('CONFIG')
    }
  })

  it('provider cloud without accessToken throws CONFIG', () => {
    expect(
      () => new Client({ provider: 'cloud', cloud: { accessToken: '', phoneNumberId: '1' }, autoConnect: false }),
    ).toThrowError(ZaileysCloudError)
  })

  it('provider cloud without phoneNumberId throws CONFIG', () => {
    expect(
      () => new Client({ provider: 'cloud', cloud: { accessToken: 'tok', phoneNumberId: '' }, autoConnect: false }),
    ).toThrowError(ZaileysCloudError)
  })

  it('provider cloud with valid options constructs', () => {
    const c = new Client({ provider: 'cloud', cloud: validCloud, autoConnect: false })
    expect(c.provider).toBe('cloud')
  })

  it('default provider is baileys and constructs unaffected', () => {
    const c = new Client({ auth: new MemoryAuthStore(), autoConnect: false, qrTerminal: false })
    expect(c.provider).toBe('baileys')
  })

  it('explicit provider baileys works', () => {
    const c = new Client({ provider: 'baileys', auth: new MemoryAuthStore(), autoConnect: false, qrTerminal: false })
    expect(c.provider).toBe('baileys')
  })

  it('cloud options ignored on baileys provider (no throw)', () => {
    const c = new Client({ auth: new MemoryAuthStore(), autoConnect: false, qrTerminal: false, cloud: validCloud })
    expect(c.provider).toBe('baileys')
  })
})
