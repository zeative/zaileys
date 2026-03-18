import { describe, it, expect, vi } from 'vitest'
import { PrivacyManager } from '../../src/managers/privacy'

describe('PrivacyManager', () => {
  const mockSocket: any = {
    fetchPrivacySettings: vi.fn(),
    updateLastSeenPrivacy: vi.fn(),
    updateBlockStatus: vi.fn(),
    fetchBlocklist: vi.fn()
  }

  it('should fetch privacy settings', async () => {
    const pm = new PrivacyManager(mockSocket)
    mockSocket.fetchPrivacySettings.mockResolvedValue({ lastSeen: 'everyone' })
    
    const settings = await pm.get()
    expect(settings.lastSeen).toBe('everyone')
  })

  it('should update specific setting', async () => {
    const pm = new PrivacyManager(mockSocket)
    await pm.update('lastSeen', 'none')
    expect(mockSocket.updateLastSeenPrivacy).toHaveBeenCalledWith('none')
  })

  it('should manage blocklist', async () => {
    const pm = new PrivacyManager(mockSocket)
    await pm.block('123@s.whatsapp.net')
    expect(mockSocket.updateBlockStatus).toHaveBeenCalledWith('123@s.whatsapp.net', 'block')
  })
})
