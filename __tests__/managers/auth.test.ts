import { describe, it, expect, vi } from 'vitest'
import { AuthHandler } from '../../src/managers/auth'

vi.mock('@whiskeysockets/baileys', () => ({
  useMultiFileAuthState: vi.fn()
}))

describe('AuthHandler', () => {
  it('should emit qr event', () => {
    const auth = new AuthHandler('s1', '/tmp/s1')
    const spy = vi.fn()
    auth.on('qr', spy)
    
    auth.handleUpdate({ qr: 'mock-qr' })
    expect(spy).toHaveBeenCalledWith('mock-qr')
  })

  it('should emit ready event', () => {
    const auth = new AuthHandler('s1', '/tmp/s1')
    const spy = vi.fn()
    auth.on('ready', spy)
    
    auth.handleUpdate({ connection: 'open' })
    expect(spy).toHaveBeenCalled()
  })
})
