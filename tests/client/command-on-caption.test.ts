import { describe, expect, it, vi } from 'vitest'
import { Client } from '../../src/client/client.js'
import { MemoryAuthStore } from '../../src/auth/adapters/memory.js'
import { attachInboundPipeline } from '../../src/events/pipeline.js'
import { makeInboundSocket } from '../_helpers/mock-socket-events.js'

const SELF = '628SELF@s.whatsapp.net'
const SENDER = '628111@s.whatsapp.net'

/** Drives the real decode pipeline so the command sees exactly what a live message produces. */
const bot = () => {
  const client = new Client({
    auth: new MemoryAuthStore(),
    qrTerminal: false,
    autoConnect: false,
    commandPrefix: '!',
  })
  const socket = makeInboundSocket({ user: { id: SELF } })
  ;(client as unknown as { _socket: unknown })._socket = socket
  attachInboundPipeline(client, socket as unknown as Parameters<typeof attachInboundPipeline>[1], {
    selfJid: SELF,
  })
  return { client, socket }
}

const deliver = async (socket: ReturnType<typeof bot>['socket'], message: unknown) => {
  socket.triggerMessagesUpsert({
    messages: [{ key: { remoteJid: SENDER, id: 'M1', fromMe: false }, message, messageTimestamp: 1700 }],
    type: 'notify',
  })
  await new Promise((r) => setTimeout(r, 20))
}

describe('a command may arrive as a media caption', () => {
  it('runs when the prefix is the caption of an image', async () => {
    const { client, socket } = bot()
    const run = vi.fn()
    client.command('sticker', run)
    await deliver(socket, { imageMessage: { mimetype: 'image/jpeg', caption: '!sticker' } })
    expect(run).toHaveBeenCalledTimes(1)
  })

  it('runs for a video caption too, and passes its arguments', async () => {
    const { client, socket } = bot()
    const run = vi.fn()
    client.command('swgc', run)
    await deliver(socket, { videoMessage: { mimetype: 'video/mp4', caption: '!swgc promo hari ini' } })
    expect(run).toHaveBeenCalledTimes(1)
    expect((run.mock.calls[0]![0] as { args: string[] }).args).toEqual(['promo', 'hari', 'ini'])
  })

  it('still runs for a plain text message', async () => {
    const { client, socket } = bot()
    const run = vi.fn()
    client.command('ping', run)
    await deliver(socket, { conversation: '!ping' })
    expect(run).toHaveBeenCalledTimes(1)
  })

  it('runs a command exactly once, not once per event it appears on', async () => {
    const { client, socket } = bot()
    const run = vi.fn()
    client.command('ping', run)
    await deliver(socket, { conversation: '!ping' })
    expect(run).toHaveBeenCalledTimes(1)
  })

  it('leaves a captioned image alone when the caption is not a command', async () => {
    const { client, socket } = bot()
    const run = vi.fn()
    client.command('sticker', run)
    await deliver(socket, { imageMessage: { mimetype: 'image/jpeg', caption: 'foto liburan' } })
    expect(run).not.toHaveBeenCalled()
  })
})
