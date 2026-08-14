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
    client.emit('text', msg(604800))
    await new Promise((r) => setTimeout(r, 20))
    expect(optionsOf(sendMessage).ephemeralExpiration).toBe(604800)
  })

  it('sends no expiration when the chat keeps its messages', async () => {
    const { client, sendMessage } = connected()
    client.command('ping', async (ctx) => {
      await ctx.reply('pong')
    })
    client.emit('text', msg())
    await new Promise((r) => setTimeout(r, 20))
    expect(optionsOf(sendMessage).ephemeralExpiration).toBeUndefined()
  })
})
