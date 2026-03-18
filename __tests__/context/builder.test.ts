import { describe, it, expect, vi } from 'vitest'
import { MessageContextBuilder } from '../../src/context/builder'

describe('Message Context Builder', () => {
  const mockSocket = {}

  it('should validate core messages', () => {
    expect(MessageContextBuilder.isValidMessage({ message: { conversation: 'hi' } })).toBe(true)
    expect(MessageContextBuilder.isValidMessage({ message: { protocolMessage: {} } })).toBe(false)
    expect(MessageContextBuilder.isValidMessage({})).toBe(false)
  })

  it('should build a rich context object', async () => {
    const raw = {
      key: {
        remoteJid: '123@s.whatsapp.net',
        fromMe: false,
        id: 'ABC'
      },
      pushName: 'Zaa',
      message: { conversation: 'test context' }
    }

    const ctx = await MessageContextBuilder.build(raw, mockSocket)
    
    expect(ctx.jid).toBe('123@s.whatsapp.net')
    expect(ctx.text).toBe('test context')
    expect(ctx.type).toBe('text')
    expect(ctx.sender.pushName).toBe('Zaa')
    expect(ctx.flags.isGroup).toBe(false)
    expect(ctx.flags.isFromMe).toBe(false)
  })

  it('should compute group flags correctly', async () => {
    const raw = {
      key: {
        remoteJid: '123456@g.us',
        participant: '987@s.whatsapp.net'
      },
      message: { imageMessage: {} }
    }

    const ctx = await MessageContextBuilder.build(raw, mockSocket)
    expect(ctx.flags.isGroup).toBe(true)
    expect(ctx.room.type).toBe('group')
    expect(ctx.sender.id).toBe('987@s.whatsapp.net')
  })
})
