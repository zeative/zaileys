import { describe, expect, it, vi } from 'vitest'
import type { MiscMessageGenerationOptions, WAMessage } from 'baileys'
import { Client } from '../../src/client/client.js'
import { MemoryAuthStore } from '../../src/auth/adapters/memory.js'
import type { MessageContext } from '../../src/events/context.js'

const SENDER = '628111@s.whatsapp.net'

/** A quoted message from a chat whose disappearing timer is `expiration` seconds. */
const quoted = (expiration?: number): WAMessage =>
  ({
    key: { remoteJid: SENDER, id: 'M1', fromMe: false },
    message: {
      extendedTextMessage: {
        text: 'halo',
        ...(expiration === undefined ? {} : { contextInfo: { expiration } }),
      },
    },
  }) as unknown as WAMessage

const msg = (expiration?: number): MessageContext =>
  ({
    text: '!ping',
    senderId: SENDER,
    roomId: SENDER,
    isGroup: false,
    ephemeralDuration: expiration ?? null,
    message: () => quoted(expiration),
  }) as unknown as MessageContext

const connected = () => {
  const sendMessage = vi.fn(async () => ({ key: { remoteJid: SENDER, id: 'OUT', fromMe: true } }))
  const client = new Client({
    auth: new MemoryAuthStore(),
    qrTerminal: false,
    autoConnect: false,
    commandPrefix: '!',
  })
  ;(client as unknown as { _socket: unknown })._socket = {
    user: { id: 'me@s.whatsapp.net' },
    sendMessage,
  }
  return { client, sendMessage }
}

const optionsOf = (
  sendMessage: ReturnType<typeof connected>['sendMessage'],
): MiscMessageGenerationOptions =>
  (sendMessage.mock.calls[0] as unknown as [string, unknown, MiscMessageGenerationOptions])[2]

describe('replies inherit the disappearing timer', () => {
  it('copies the expiration of the message it answers', async () => {
    const { client, sendMessage } = connected()
    client.command('ping', async (ctx) => {
      await ctx.reply('pong')
    })
    client.emit('message', msg(604800))
    await new Promise((r) => setTimeout(r, 20))
    expect(optionsOf(sendMessage).ephemeralExpiration).toBe(604800)
  })

  it('sends no expiration when the chat keeps its messages', async () => {
    const { client, sendMessage } = connected()
    client.command('ping', async (ctx) => {
      await ctx.reply('pong')
    })
    client.emit('message', msg())
    await new Promise((r) => setTimeout(r, 20))
    expect(optionsOf(sendMessage).ephemeralExpiration).toBeUndefined()
  })
})

describe('every send into a disappearing chat inherits its timer', () => {
  /** Teaches the client the chat's timer the way a real inbound message would. */
  const learn = (client: Client, seconds: number): void => {
    client.emit('message', msg(seconds))
  }

  it('applies it to a plain text send, not just a reply', async () => {
    const { client, sendMessage } = connected()
    learn(client, 86400)
    await client.send(SENDER).text('halo')
    expect(optionsOf(sendMessage).ephemeralExpiration).toBe(86400)
  })

  it('applies it to media — the sticker case', async () => {
    const { client, sendMessage } = connected()
    learn(client, 604800)
    await client.send(SENDER).image(Buffer.from('jpeg'))
    expect(optionsOf(sendMessage).ephemeralExpiration).toBe(604800)
  })

  it('never overrides a timer the caller set explicitly', async () => {
    const { client, sendMessage } = connected()
    learn(client, 604800)
    await client.send(SENDER).text('halo').disappearing(60)
    expect(optionsOf(sendMessage).ephemeralExpiration).toBe(60)
  })

  it('adds nothing for a chat it has never seen', async () => {
    const { client, sendMessage } = connected()
    await client.send('628999@s.whatsapp.net').text('halo')
    expect(optionsOf(sendMessage).ephemeralExpiration).toBeUndefined()
  })

  it('forgets the timer once the chat stops disappearing', async () => {
    const { client, sendMessage } = connected()
    learn(client, 604800)
    client.emit('message', msg())
    await client.send(SENDER).text('halo')
    expect(optionsOf(sendMessage).ephemeralExpiration).toBeUndefined()
  })
})

describe('raw socket sends inherit the timer too', () => {
  type Internals = {
    applyChatTimerByDefault(socket: unknown): void
    wireSocket(socket: unknown): void
  }

  const rawSocket = () => {
    const sendMessage = vi.fn(async () => ({}))
    const relayMessage = vi.fn(async () => 'ID')
    const handlers = new Map<string, (arg: unknown) => void>()
    const socket = {
      user: { id: 'me@s.whatsapp.net' },
      sendMessage,
      relayMessage,
      ev: { on: (e: string, fn: (arg: unknown) => void) => handlers.set(e, fn), off: vi.fn() },
    }
    const client = new Client({ auth: new MemoryAuthStore(), qrTerminal: false, autoConnect: false })
    ;(client as unknown as Internals).applyChatTimerByDefault(socket)
    return { client, socket, sendMessage, relayMessage, handlers }
  }

  it('fills ephemeralExpiration on socket.sendMessage', async () => {
    const { client, socket, sendMessage } = rawSocket()
    client.emit('message', msg(604800))
    await socket.sendMessage(SENDER, { text: 'halo' })
    expect((sendMessage.mock.calls[0] as unknown[])[2]).toEqual({ ephemeralExpiration: 604800 })
  })

  it('respects an explicit 0 and skips reactions', async () => {
    const { client, socket, sendMessage } = rawSocket()
    client.emit('message', msg(604800))
    await socket.sendMessage(SENDER, { text: 'halo' }, { ephemeralExpiration: 0 })
    await socket.sendMessage(SENDER, { react: { text: '👍', key: {} } })
    expect((sendMessage.mock.calls[0] as unknown[])[2]).toEqual({ ephemeralExpiration: 0 })
    expect((sendMessage.mock.calls[1] as unknown[])[2]).toBeUndefined()
  })

  it('stamps contextInfo.expiration on socket.relayMessage, turning bare text into extended text', async () => {
    const { client, socket, relayMessage } = rawSocket()
    client.emit('message', msg(86400))
    const sticker = { stickerMessage: { url: 'x' } }
    const text = { conversation: 'halo' }
    await socket.relayMessage(SENDER, sticker, {})
    await socket.relayMessage(SENDER, text, {})
    expect(sticker).toEqual({ stickerMessage: { url: 'x', contextInfo: { expiration: 86400 } } })
    expect(text).toEqual({ extendedTextMessage: { text: 'halo', contextInfo: { expiration: 86400 } } })
    expect(relayMessage).toHaveBeenCalledTimes(2)
  })

  it('leaves relayed protocol messages and unknown chats alone', async () => {
    const { client, socket } = rawSocket()
    client.emit('message', msg(86400))
    const revoke = { protocolMessage: { type: 0 } }
    const elsewhere = { stickerMessage: { url: 'x' } }
    await socket.relayMessage(SENDER, revoke, {})
    await socket.relayMessage('628999@s.whatsapp.net', elsewhere, {})
    expect(revoke).toEqual({ protocolMessage: { type: 0 } })
    expect(elsewhere).toEqual({ stickerMessage: { url: 'x' } })
  })

  it('learns and clears the timer from chats.update, and our own echoes never clear it', async () => {
    const { client, socket, sendMessage, handlers } = rawSocket()
    ;(client as unknown as Internals).wireSocket(socket)
    handlers.get('chats.update')?.([{ id: SENDER, ephemeralExpiration: 7776000 }])
    client.emit('message', { ...msg(), isFromMe: true } as MessageContext)
    await socket.sendMessage(SENDER, { text: 'a' })
    handlers.get('chats.update')?.([{ id: SENDER, ephemeralExpiration: null }])
    await socket.sendMessage(SENDER, { text: 'b' })
    expect((sendMessage.mock.calls[0] as unknown[])[2]).toEqual({ ephemeralExpiration: 7776000 })
    expect((sendMessage.mock.calls[1] as unknown[])[2]).toBeUndefined()
  })
})
