import { describe, expect, it, vi } from 'vitest'
import type { WAMessage } from 'baileys'
import { attachInboundPipeline } from '../../src/events/pipeline.js'
import { createMockSocket } from '../_helpers/mock-socket.js'
import { TypedEventEmitter } from '../../src/client/event-emitter.js'
import type { ClientEventMap } from '../../src/client/types.js'

const msgWithMentions = (count: number): WAMessage =>
  ({
    key: { id: 'M', remoteJid: '1@g.us', fromMe: false, participant: '628999@s.whatsapp.net' },
    messageTimestamp: 1,
    message: {
      extendedTextMessage: {
        text: 'hi',
        contextInfo: {
          mentionedJid: Array.from({ length: count }, (_, i) => `${1000000 + i}@lid`),
        },
      },
    },
  }) as unknown as WAMessage

const boot = (resolveLidToPn: (lid: string) => Promise<string | null>) => {
  const sock = createMockSocket({ user: { id: '628000@s.whatsapp.net' } })
  const emitter = new TypedEventEmitter<ClientEventMap>()
  const handle = attachInboundPipeline(emitter as never, sock as never, {
    selfJid: '628000@s.whatsapp.net',
    channelId: 'c',
    receiverId: '628000@s.whatsapp.net',
    prefixes: [],
    resolveLidToPn,
  } as never)
  return { sock, emitter, handle }
}

describe('mention fan-out is bounded', () => {
  it('caps how many LIDs one message can make it resolve', async () => {
    const resolve = vi.fn(async (lid: string) => lid.replace('@lid', '@s.whatsapp.net'))
    const { sock, handle } = boot(resolve)
    sock.ev.emit('messages.upsert', { type: 'notify', messages: [msgWithMentions(20_000)] })
    await vi.waitFor(() => expect(resolve.mock.calls.length).toBeGreaterThan(0))
    await new Promise((r) => setTimeout(r, 300))
    expect(resolve.mock.calls.length).toBeLessThanOrEqual(128)
    handle.detach()
  })

  it('never holds more than a small batch of lookups in flight at once', async () => {
    let inFlight = 0
    let peak = 0
    const resolve = vi.fn(async (lid: string) => {
      inFlight += 1
      peak = Math.max(peak, inFlight)
      await new Promise((r) => setTimeout(r, 5))
      inFlight -= 1
      return lid.replace('@lid', '@s.whatsapp.net')
    })
    const { sock, handle } = boot(resolve)
    sock.ev.emit('messages.upsert', { type: 'notify', messages: [msgWithMentions(100)] })
    await vi.waitFor(() => expect(resolve.mock.calls.length).toBeGreaterThanOrEqual(50), { timeout: 5000 })
    await new Promise((r) => setTimeout(r, 200))
    expect(peak).toBeLessThanOrEqual(8)
    handle.detach()
  })

  it('reuses the cache so a repeated mention costs nothing', async () => {
    const resolve = vi.fn(async (lid: string) => lid.replace('@lid', '@s.whatsapp.net'))
    const { sock, handle } = boot(resolve)
    sock.ev.emit('messages.upsert', { type: 'notify', messages: [msgWithMentions(10)] })
    await new Promise((r) => setTimeout(r, 200))
    const first = resolve.mock.calls.length
    sock.ev.emit('messages.upsert', { type: 'notify', messages: [msgWithMentions(10)] })
    await new Promise((r) => setTimeout(r, 200))
    expect(resolve.mock.calls.length).toBe(first)
    handle.detach()
  })
})
