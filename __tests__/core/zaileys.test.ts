import { describe, it, expect, vi } from 'vitest'
import { Zaileys } from '../../src/core/zaileys'

describe('Zaileys Bot', () => {
  const mockSocket = {
    ev: { on: vi.fn() }
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should initialize internal engines', () => {
    const bot = new Zaileys(mockSocket)
    expect(bot.signal).toBeDefined()
    expect(bot.commands).toBeDefined()
    expect(mockSocket.ev.on).toHaveBeenCalledWith('messages.upsert', expect.any(Function))
  })

  it('should emit ready on start', async () => {
    const bot = new Zaileys(mockSocket)
    const onReady = vi.fn()
    bot.on('ready', onReady)
    
    await bot.start()
    expect(onReady).toHaveBeenCalled()
  })

  it('should proxy message events', async () => {
    const bot = new Zaileys(mockSocket)
    const onMessage = vi.fn()
    bot.on('message', onMessage)

    // Trigger raw socket event
    const handler = vi.mocked(mockSocket.ev.on).mock.calls[0][1]
    const m = { messages: [{ key: { remoteJid: '123@s.whatsapp.net' }, message: { conversation: 'hello' } }], type: 'notify' }
    
    await handler(m)
    
    expect(onMessage).toHaveBeenCalledWith(m)
  })
})
