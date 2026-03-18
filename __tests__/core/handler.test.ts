import { describe, it, expect, vi } from 'vitest'
import { handleIncomingMessage } from '../../src/core/handler'
import { MessageContextBuilder } from '../../src/context/builder'

vi.mock('../../src/context/builder', () => ({
  MessageContextBuilder: {
    build: vi.fn()
  }
}))

describe('Message Handler', () => {
  it('should ignore messages without prefix', async () => {
    const bot: any = { signal: {}, commands: { match: vi.fn() } }
    const m = { messages: [{ message: { conversation: 'hello' } }] }
    
    vi.mocked(MessageContextBuilder.build).mockResolvedValue({ text: 'hello' } as any)
    
    await handleIncomingMessage(bot, m)
    expect(bot.commands.match).not.toHaveBeenCalled()
  })

  it('should route and execute commands', async () => {
    const execute = vi.fn()
    const command: any = { name: 'ping', execute }
    const bot: any = { 
      signal: {}, 
      commands: { 
        match: vi.fn().mockReturnValue({ command, remaining: [], router: {} }) 
      } 
    }
    const m = { messages: [{ message: { conversation: '!ping' } }] }
    
    vi.mocked(MessageContextBuilder.build).mockResolvedValue({ text: '!ping' } as any)
    
    await handleIncomingMessage(bot, m)
    expect(bot.commands.match).toHaveBeenCalledWith(['ping'])
    expect(execute).toHaveBeenCalled()
  })
})
