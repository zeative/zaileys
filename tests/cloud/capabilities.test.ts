import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Client } from '../../src/client/client.js'
import { MemoryAuthStore } from '../../src/auth/adapters/memory.js'

const fetchMock = vi.fn()

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock)
  fetchMock.mockReset()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

function cloudClient() {
  return new Client({
    provider: 'cloud',
    cloud: { accessToken: 'tok', phoneNumberId: '555' },
    autoConnect: false,
    statusLog: false,
  })
}

const WEB_ONLY_MODULES = [
  'group',
  'privacy',
  'newsletter',
  'community',
  'presence',
  'chat',
  'contact',
  'business',
  'profile',
] as const

describe('cloud capability guards', () => {
  it.each(WEB_ONLY_MODULES)('%s module throws UNSUPPORTED_ON_CLOUD on cloud', (name) => {
    const c = cloudClient()
    expect(() => (c as unknown as Record<string, unknown>)[name]).toThrowError(/cloud/i)
    try {
      void (c as unknown as Record<string, unknown>)[name]
    } catch (err) {
      expect((err as { code?: string }).code).toBe('UNSUPPORTED_ON_CLOUD')
      expect((err as Error).message).toContain(name)
    }
  })

  it.each(WEB_ONLY_MODULES)('%s module still accessible on baileys', (name) => {
    const c = new Client({ auth: new MemoryAuthStore(), autoConnect: false, qrTerminal: false, statusLog: false })
    expect(() => (c as unknown as Record<string, unknown>)[name]).not.toThrow()
  })

  it('edit/delete/pin/setDisappearing throw UNSUPPORTED_ON_CLOUD on cloud', async () => {
    const c = cloudClient()
    const key = { id: 'wamid.X', remoteJid: '628111@s.whatsapp.net', fromMe: true }
    expect(() => c.edit(key)).toThrowError(/cloud/i)
    await expect(c.delete(key)).rejects.toThrowError(/cloud/i)
    await expect(c.pin(key)).rejects.toThrowError(/cloud/i)
    await expect(c.unpin(key)).rejects.toThrowError(/cloud/i)
    await expect(c.setDisappearing('628111', 86400)).rejects.toThrowError(/cloud/i)
  })
})
