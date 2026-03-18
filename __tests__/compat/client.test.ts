import { describe, it, expect, vi, beforeEach } from 'vitest'
import { CompatWrapper } from '../../src/compat/client'
import { resetWarnings } from '../../src/compat/warning'

describe('CompatWrapper', () => {
  const mockSocket: any = {
    sendMessage: vi.fn()
  }
  const mockClient: any = {
    socket: mockSocket
  }

  beforeEach(() => {
    resetWarnings()
    vi.restoreAllMocks()
  })

  it('should proxy sendText', async () => {
    const compat = new CompatWrapper(mockClient)
    await compat.sendText('jid', 'hi')
    expect(mockSocket.sendMessage).toHaveBeenCalledWith('jid', { text: 'hi' }, {})
  })

  it('should proxy reply', async () => {
    const compat = new CompatWrapper(mockClient)
    await compat.reply('jid', 'hi', { id: 'msg1' })
    expect(mockSocket.sendMessage).toHaveBeenCalledWith('jid', { text: 'hi' }, { quoted: { id: 'msg1' } })
  })

  it('should proxy sendReaction', async () => {
    const compat = new CompatWrapper(mockClient)
    await compat.sendReaction('jid', '👍', { id: 'msg1' })
    expect(mockSocket.sendMessage).toHaveBeenCalledWith('jid', { reaction: { text: '👍', key: { id: 'msg1' } } })
  })
})
