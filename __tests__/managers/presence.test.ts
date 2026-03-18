import { describe, it, expect, vi } from 'vitest'
import { PresenceManager } from '../../src/managers/presence'

describe('PresenceManager', () => {
  const mockSocket: any = {
    sendPresenceUpdate: vi.fn(),
    readMessages: vi.fn()
  }

  it('should simulate presence', async () => {
    const pm = new PresenceManager(mockSocket)
    const promise = pm.simulate('123@s.whatsapp.net', 'composing', 10)
    expect(mockSocket.sendPresenceUpdate).toHaveBeenCalledWith('composing', '123@s.whatsapp.net')
    await promise
    expect(mockSocket.sendPresenceUpdate).toHaveBeenCalledWith('paused', '123@s.whatsapp.net')
  })

  it('should mark as read', async () => {
    const pm = new PresenceManager(mockSocket)
    await pm.read('123@s.whatsapp.net', 'user@s.whatsapp.net', 'ID1')
    expect(mockSocket.readMessages).toHaveBeenCalledWith([{
      remoteJid: '123@s.whatsapp.net',
      id: 'ID1',
      participant: 'user@s.whatsapp.net'
    }])
  })
})
