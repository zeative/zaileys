import { createHash } from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'
import { TypedEventEmitter } from '../../src/client/event-emitter.js'
import type { ClientEventMap } from '../../src/client/types.js'
import { attachInboundPipeline } from '../../src/events/pipeline.js'
import type { MessageContext } from '../../src/events/context.js'
import type { PollVotePayload } from '../../src/events/types.js'
import { makeInboundSocket } from '../_helpers/mock-socket-events.js'

const SELF_JID = '628SELF@s.whatsapp.net'
const SENDER_PN = '628111@s.whatsapp.net'
const GROUP = '99-1@g.us'

const setup = (opts: Record<string, unknown> = {}) => {
  const client = new TypedEventEmitter<ClientEventMap>()
  const socket = makeInboundSocket({ user: { id: SELF_JID } })
  attachInboundPipeline(client, socket as unknown as Parameters<typeof attachInboundPipeline>[1], {
    selfJid: SELF_JID,
    channelId: 's',
    ...opts,
  })
  return { client, socket }
}

const msg = (over: Record<string, unknown> = {}): Record<string, unknown> => ({
  key: { remoteJid: SENDER_PN, id: 'M1', fromMe: false },
  message: { conversation: 'hello' },
  messageTimestamp: 1700,
  pushName: 'Alice',
  ...over,
})

const emit = (messages: Record<string, unknown>[], type = 'notify'): MessageContext => {
  const { client, socket } = setup()
  const seen = vi.fn()
  client.on('message', seen)
  socket.triggerMessagesUpsert({ messages, type })
  return seen.mock.calls[0]?.[0] as MessageContext
}

describe('isOffline', () => {
  it('is false for live traffic', () => {
    expect(emit([msg()]).isOffline).toBe(false)
  })

  it('is true for the backlog WhatsApp replays after a reconnect', () => {
    expect(emit([msg()], 'append').isOffline).toBe(true)
  })
})

describe('contextInfo is read off every message type, not just text and media', () => {
  const ctxInfo = {
    isForwarded: true,
    forwardingScore: 7,
    expiration: 86400,
    mentionedJid: ['628999@s.whatsapp.net'],
  }

  it('reads it off a poll message', () => {
    const ctx = emit([
      msg({
        key: { remoteJid: GROUP, id: 'M1', fromMe: false, participant: SENDER_PN },
        message: { pollCreationMessageV3: { name: 'Pilih', options: [], contextInfo: ctxInfo } },
      }),
    ])
    expect(ctx.isForwarded).toBe(true)
    expect(ctx.forwardCount).toBe(7)
    expect(ctx.mentions).toContain('628999@s.whatsapp.net')
  })

  it('reads it off a location message', () => {
    const ctx = emit([
      msg({ message: { locationMessage: { degreesLatitude: 1, degreesLongitude: 2, contextInfo: ctxInfo } } }),
    ])
    expect(ctx.isForwarded).toBe(true)
    expect(ctx.isEphemeral).toBe(true)
  })

  it('still prefers the text message contextInfo when present', () => {
    const ctx = emit([
      msg({ message: { extendedTextMessage: { text: 'hi', contextInfo: { forwardingScore: 2 } } } }),
    ])
    expect(ctx.forwardCount).toBe(2)
  })
})

describe('new scalar fields', () => {
  it('reports the forward count, not just a boolean', () => {
    const ctx = emit([msg({ message: { extendedTextMessage: { text: 'x', contextInfo: { forwardingScore: 9 } } } })])
    expect(ctx.forwardCount).toBe(9)
    expect(ctx.isForwarded).toBe(true)
  })

  it('defaults the forward count to zero', () => {
    expect(emit([msg()]).forwardCount).toBe(0)
  })

  it('reports the disappearing timer in seconds', () => {
    const ctx = emit([msg({ message: { extendedTextMessage: { text: 'x', contextInfo: { expiration: 604800 } } } })])
    expect(ctx.ephemeralDuration).toBe(604800)
  })

  it('leaves the timer null when the chat keeps messages', () => {
    expect(emit([msg()]).ephemeralDuration).toBeNull()
  })

  it('reports how WhatsApp addressed the message', () => {
    expect(emit([msg()]).addressingMode).toBe('pn')
    expect(
      emit([msg({ key: { remoteJid: '111@lid', id: 'M1', fromMe: false, addressingMode: 'lid' } })]).addressingMode,
    ).toBe('lid')
  })

  it('lists the groups tagged in a community mention', () => {
    const ctx = emit([
      msg({
        message: {
          extendedTextMessage: {
            text: 'x',
            contextInfo: { groupMentions: [{ groupJid: '120@g.us', groupSubject: 'A' }, { groupJid: '' }] },
          },
        },
      }),
    ])
    expect(ctx.mentionedGroups).toEqual(['120@g.us'])
  })

  it('leaves mentionedGroups empty when nothing was tagged', () => {
    expect(emit([msg()]).mentionedGroups).toEqual([])
  })
})

describe('ad attribution', () => {
  it('surfaces the click id and source of a Click-to-WhatsApp chat', () => {
    const ctx = emit([
      msg({
        message: {
          extendedTextMessage: {
            text: 'halo',
            contextInfo: {
              externalAdReply: {
                ctwaClid: 'CLID123',
                sourceUrl: 'https://fb.me/ad',
                sourceApp: 'facebook',
                sourceId: 'AD9',
                title: 'Diskon',
                body: 'Promo',
              },
            },
          },
        },
      }),
    ])
    expect(ctx.ad).toEqual({
      clickId: 'CLID123',
      sourceUrl: 'https://fb.me/ad',
      sourceApp: 'facebook',
      sourceId: 'AD9',
      title: 'Diskon',
      body: 'Promo',
    })
  })

  it('is absent on an ordinary message', () => {
    expect(emit([msg()]).ad).toBeUndefined()
  })

  it('is absent when the ad node carries nothing usable', () => {
    const ctx = emit([
      msg({ message: { extendedTextMessage: { text: 'x', contextInfo: { externalAdReply: { showAdAttribution: true } } } } }),
    ])
    expect(ctx.ad).toBeUndefined()
  })
})

describe('verified business sender', () => {
  it('surfaces the verified name', () => {
    expect(emit([msg({ verifiedBizName: 'Toko Resmi' })]).business).toEqual({ verifiedName: 'Toko Resmi' })
  })

  it('is absent for a normal sender', () => {
    expect(emit([msg()]).business).toBeUndefined()
  })
})

describe('media metadata', () => {
  it('carries duration, dimensions and thumbnail', () => {
    const { client, socket } = setup()
    const seen = vi.fn()
    client.on('video', seen)
    socket.triggerMessagesUpsert({
      messages: [
        msg({
          message: {
            videoMessage: {
              mimetype: 'video/mp4',
              seconds: 42,
              width: 1920,
              height: 1080,
              gifPlayback: true,
              jpegThumbnail: new Uint8Array([1, 2, 3]),
            },
          },
        }),
      ],
      type: 'notify',
    })
    const media = (seen.mock.calls[0]?.[0] as MessageContext).media as {
      duration: number
      width: number
      height: number
      isAnimated: boolean
      thumbnail: Buffer
    }
    expect(media.duration).toBe(42)
    expect(media.width).toBe(1920)
    expect(media.height).toBe(1080)
    expect(media.isAnimated).toBe(true)
    expect(media.thumbnail).toEqual(Buffer.from([1, 2, 3]))
  })

  it('carries the page count of a document', () => {
    const { client, socket } = setup()
    const seen = vi.fn()
    client.on('document', seen)
    socket.triggerMessagesUpsert({
      messages: [msg({ message: { documentMessage: { mimetype: 'application/pdf', pageCount: 12 } } })],
      type: 'notify',
    })
    const media = (seen.mock.calls[0]?.[0] as MessageContext).media as { pages: number; duration: number | null }
    expect(media.pages).toBe(12)
    expect(media.duration).toBeNull()
  })
})

describe('poll vote option names', () => {
  const hashOf = (name: string) => createHash('sha256').update(Buffer.from(name)).digest('hex').toUpperCase()

  const votePayload = (resolveQuoted?: unknown): Promise<PollVotePayload> => {
    const { client, socket } = setup(resolveQuoted != null ? { resolveQuoted } : {})
    const seen = vi.fn()
    client.on('poll-vote', seen)
    socket.triggerMessagesUpdate([
      {
        key: { remoteJid: SENDER_PN, id: 'VOTE', fromMe: false },
        update: {
          pollUpdates: [
            {
              pollUpdateMessageKey: { remoteJid: SENDER_PN, id: 'POLL1', fromMe: false },
              vote: { selectedOptions: [Buffer.from(hashOf('Nasi Goreng'), 'hex')] },
              senderTimestampMs: 1700,
            },
          ],
        },
      },
    ])
    return Promise.resolve(seen.mock.calls[0]?.[0] as PollVotePayload)
  }

  it('turns the vote hashes back into the option text', async () => {
    const poll = {
      key: { remoteJid: SENDER_PN, id: 'POLL1', fromMe: false },
      message: { pollCreationMessageV3: { name: 'Menu', options: [{ optionName: 'Nasi Goreng' }, { optionName: 'Mie' }] } },
    }
    const payload = await votePayload(async () => poll)
    await expect(payload.options()).resolves.toEqual(['Nasi Goreng'])
  })

  it('still exposes the raw hashes', async () => {
    const payload = await votePayload()
    expect(payload.selectedOptions[0]?.toUpperCase()).toBe(hashOf('Nasi Goreng'))
  })

  it('returns nothing readable when the poll is not in the store', async () => {
    const payload = await votePayload(async () => null)
    await expect(payload.options()).resolves.toEqual([])
  })

  it('returns nothing readable without a resolver at all', async () => {
    const payload = await votePayload()
    await expect(payload.options()).resolves.toEqual([])
  })
})
