import { execSync } from 'node:child_process'
import { describe, expect, expectTypeOf, it, vi } from 'vitest'
import { proto } from 'baileys'
import { TypedEventEmitter } from '../../src/client/event-emitter.js'
import type { ClientEventMap } from '../../src/client/types.js'
import { attachInboundPipeline } from '../../src/events/pipeline.js'
import type {
  CallPayload,
  LimitedPayload,
  NewsletterPayload,
  PresencePayload,
} from '../../src/events/types.js'
import type { MentionAllContext, MentionContext, MessageContext } from '../../src/events/context.js'
import { makeInboundSocket, type InboundMockSocket } from '../_helpers/mock-socket-events.js'

const { downloadMediaMessage } = vi.hoisted(() => ({ downloadMediaMessage: vi.fn() }))

vi.mock('baileys', async (importOriginal) => {
  const actual = await importOriginal<typeof import('baileys')>()
  return { ...actual, downloadMediaMessage }
})

const SELF = '123@s.whatsapp.net'
const GROUP = '99-1@g.us'

function setup(selfJid = SELF): {
  client: TypedEventEmitter<ClientEventMap>
  socket: InboundMockSocket
} {
  const client = new TypedEventEmitter<ClientEventMap>()
  const socket = makeInboundSocket({ user: { id: selfJid } })
  attachInboundPipeline(
    client,
    socket as unknown as Parameters<typeof attachInboundPipeline>[1],
    { selfJid },
  )
  return { client, socket }
}

function msg(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    key: { remoteJid: '999@s.whatsapp.net', id: 'M1', fromMe: false },
    message: { conversation: 'hello' },
    messageTimestamp: 1700,
    pushName: 'Alice',
    ...overrides,
  }
}

describe('Phase 9 SC#1: text payload typed as MessageContext (flat+lazy)', () => {
  it('handler receives MessageContext with every core field populated', () => {
    const { client, socket } = setup()
    const seen = vi.fn()
    client.on('text', seen)
    socket.triggerMessagesUpsert({
      messages: [
        msg({
          key: { remoteJid: GROUP, id: 'G1', fromMe: false, participant: 'p@s.whatsapp.net' },
          message: {
            extendedTextMessage: {
              text: 'hello',
              contextInfo: { stanzaId: 'Q1', participant: 'q@s.whatsapp.net', remoteJid: GROUP },
            },
          },
        }),
      ],
      type: 'notify',
    })
    expect(seen).toHaveBeenCalledTimes(1)
    const payload = seen.mock.calls[0]?.[0] as MessageContext
    expect(payload.senderId).toBe('p@s.whatsapp.net')
    expect(payload.text).toBe('hello')
    expect(typeof payload.isFromMe).toBe('boolean')
    expect(payload.isGroup).toBe(true)
    expect(payload.chatType).toBe('text')
    expect(typeof payload.uniqueId).toBe('string')
    expect(typeof payload.timestamp).toBe('number')
    expect(typeof payload.roomName).toBe('function')
    expect(typeof payload.replied).toBe('function')
    expect(typeof payload.message).toBe('function')
  })

  it('isFromMe true when key.fromMe set; isGroup false for direct chat', () => {
    const { client, socket } = setup()
    const seen = vi.fn()
    client.on('text', seen)
    socket.triggerMessagesUpsert({
      messages: [msg({ key: { remoteJid: '999@s.whatsapp.net', id: 'M2', fromMe: true } })],
      type: 'notify',
    })
    const payload = seen.mock.calls[0]?.[0] as MessageContext
    expect(payload.isFromMe).toBe(true)
    expect(payload.isGroup).toBe(false)
  })

  it('replied() resolves null when no contextInfo quote present', async () => {
    const { client, socket } = setup()
    const seen = vi.fn()
    client.on('text', seen)
    socket.triggerMessagesUpsert({ messages: [msg()], type: 'notify' })
    const payload = seen.mock.calls[0]?.[0] as MessageContext
    await expect(payload.replied()).resolves.toBeNull()
  })

  it('type-only: text listener arg equals MessageContext (no any)', () => {
    expectTypeOf<ClientEventMap['text']>().toEqualTypeOf<MessageContext>()
    expectTypeOf<ClientEventMap['text']>().not.toBeAny()
    expectTypeOf<ClientEventMap['text']['chatType']>().not.toBeAny()
  })
})

describe('Phase 9 SC#2: media messages return MessageContext with lazy media accessor', () => {
  it('image payload has chatType:image and lazy media.buffer/stream accessors', () => {
    const { client, socket } = setup()
    const seen = vi.fn()
    client.on('image', seen)
    socket.triggerMessagesUpsert({
      messages: [msg({ message: { imageMessage: { mimetype: 'image/jpeg', caption: 'pic', fileLength: 2048 } } })],
      type: 'notify',
    })
    const payload = seen.mock.calls[0]?.[0] as MessageContext
    expect(payload.chatType).toBe('image')
    expect(payload.text).toBe('pic')
    expect(typeof payload.media?.buffer).toBe('function')
    expect(typeof payload.media?.stream).toBe('function')
  })

  it('media.buffer() resolves a Buffer from mocked baileys', async () => {
    downloadMediaMessage.mockReset()
    const buffer = Buffer.from('binary-bytes')
    downloadMediaMessage.mockResolvedValueOnce(buffer)
    const { client, socket } = setup()
    const seen = vi.fn()
    client.on('video', seen)
    socket.triggerMessagesUpsert({
      messages: [msg({ message: { videoMessage: { mimetype: 'video/mp4' } } })],
      type: 'notify',
    })
    const payload = seen.mock.calls[0]?.[0] as MessageContext
    expect(payload.chatType).toBe('video')
    expect(payload.media).toBeDefined()
    const result = await payload.media!.buffer()
    expect(Buffer.isBuffer(result)).toBe(true)
    expect(result.byteLength).toBe(buffer.byteLength)
  })

  it('audio message has chatType:audio', () => {
    const { client, socket } = setup()
    const seen = vi.fn()
    client.on('audio', seen)
    socket.triggerMessagesUpsert({
      messages: [msg({ message: { audioMessage: { mimetype: 'audio/ogg', ptt: true } } })],
      type: 'notify',
    })
    const payload = seen.mock.calls[0]?.[0] as MessageContext
    expect(payload.chatType).toBe('audio')
    expect(payload.media).toBeDefined()
  })

  it('document and sticker have correct chatType and lazy media', () => {
    const { client, socket } = setup()
    const doc = vi.fn()
    const sticker = vi.fn()
    client.on('document', doc)
    client.on('sticker', sticker)
    socket.triggerMessagesUpsert({
      messages: [msg({ message: { documentMessage: { mimetype: 'application/pdf', fileName: 'spec.pdf' } } })],
      type: 'notify',
    })
    socket.triggerMessagesUpsert({
      messages: [msg({ message: { stickerMessage: { mimetype: 'image/webp' } } })],
      type: 'notify',
    })
    expect((doc.mock.calls[0]?.[0] as MessageContext).chatType).toBe('document')
    expect((sticker.mock.calls[0]?.[0] as MessageContext).chatType).toBe('sticker')
    expect((doc.mock.calls[0]?.[0] as MessageContext).media).toBeDefined()
    expect((sticker.mock.calls[0]?.[0] as MessageContext).media).toBeDefined()
  })

  it('type-only: image event is MessageContext with optional media', () => {
    expectTypeOf<ClientEventMap['image']>().toEqualTypeOf<MessageContext>()
    expectTypeOf<ClientEventMap['audio']>().toEqualTypeOf<MessageContext>()
    expectTypeOf<MessageContext['media']>().toEqualTypeOf<import('../../src/events/context.js').ContextMedia | undefined>()
  })
})

describe('Phase 4 SC#3: mutation events fire with original key + mutation payload', () => {
  it('edit carries original key + newContent', () => {
    const { client, socket } = setup()
    const seen = vi.fn()
    client.on('edit', seen)
    socket.triggerMessagesUpdate([
      {
        key: { remoteJid: '999@s.whatsapp.net', id: 'M1', fromMe: false },
        update: {
          message: {
            protocolMessage: {
              type: proto.Message.ProtocolMessage.Type.MESSAGE_EDIT,
              key: { id: 'M1' },
              editedMessage: { conversation: 'corrected' },
            },
          },
          messageTimestamp: 1800,
        },
      },
    ])
    const payload = seen.mock.calls[0]?.[0]
    expect(payload).toMatchObject({ newContent: 'corrected' })
    expect(payload.key.id).toBe('M1')
  })

  it('delete carries original key + deletedFor everyone', () => {
    const { client, socket } = setup()
    const seen = vi.fn()
    client.on('delete', seen)
    socket.triggerMessagesUpdate([
      {
        key: { remoteJid: '999@s.whatsapp.net', id: 'M1', fromMe: false },
        update: { message: { protocolMessage: { type: proto.Message.ProtocolMessage.Type.REVOKE, key: { id: 'M1' } } } },
      },
    ])
    const payload = seen.mock.calls[0]?.[0]
    expect(payload.deletedFor).toBe('everyone')
    expect(payload.key.id).toBe('M1')
  })

  it('reaction carries target key + emoji', () => {
    const { client, socket } = setup()
    const seen = vi.fn()
    client.on('reaction', seen)
    socket.triggerMessagesReaction([
      { key: { remoteJid: '999@s.whatsapp.net', id: 'R1', fromMe: false }, reaction: { key: { id: 'M9' }, text: '🔥', senderTimestampMs: 5 } },
    ])
    const payload = seen.mock.calls[0]?.[0]
    expect(payload.emoji).toBe('🔥')
    expect(payload.key.id).toBe('M9')
  })

  it('poll-vote carries pollKey + selectedOptions array', () => {
    const { client, socket } = setup()
    const seen = vi.fn()
    client.on('poll-vote', seen)
    socket.triggerMessagesUpdate([
      {
        key: { remoteJid: '999@s.whatsapp.net', id: 'P1', fromMe: false },
        update: { pollUpdates: [{ pollUpdateMessageKey: { id: 'P1' }, vote: { selectedOptions: [] }, senderTimestampMs: 10 }] },
      },
    ])
    const payload = seen.mock.calls[0]?.[0]
    expect(payload.pollKey.id).toBe('P1')
    expect(Array.isArray(payload.selectedOptions)).toBe(true)
  })

  it('type-only: reaction emoji nullable, delete discriminated', () => {
    expectTypeOf<ClientEventMap['reaction']['emoji']>().toEqualTypeOf<string | null>()
    expectTypeOf<ClientEventMap['delete']['deletedFor']>().toEqualTypeOf<'everyone' | 'me'>()
    expectTypeOf<ClientEventMap['poll-vote']['selectedOptions']>().toEqualTypeOf<string[]>()
  })
})

describe('Phase 9 SC#4: group LID-aware + mention vs mention-all discriminated', () => {
  it('group-join propagates participantAlt + authorPn + authorUsername', () => {
    const { client, socket } = setup()
    const seen = vi.fn()
    client.on('group-join', seen)
    socket.triggerGroupParticipants({
      id: GROUP,
      author: 'admin@s.whatsapp.net',
      authorPn: '628123@s.whatsapp.net',
      authorUsername: 'adminuser',
      participants: [{ id: 'new@lid', lid: 'new-alt@lid', admin: 'admin' }],
      action: 'add',
    })
    const p = seen.mock.calls[0]?.[0].participants[0]
    expect(p.participantAlt).toBe('new-alt@lid')
    expect(p.authorPn).toBe('628123@s.whatsapp.net')
    expect(p.authorUsername).toBe('adminuser')
    expect(p.isAdmin).toBe(true)
  })

  it('member-tag emits LID-aware participantAlt + label', () => {
    const { client, socket } = setup()
    const seen = vi.fn()
    client.on('member-tag', seen)
    socket.triggerMemberTag({ groupId: GROUP, participant: 'p@lid', participantAlt: 'p-alt@lid', label: 'VIP', messageTimestamp: 99 })
    expect(seen.mock.calls[0]?.[0]).toMatchObject({ label: 'VIP', participantAlt: 'p-alt@lid' })
  })

  it('mention fires (not mention-all) when self mentioned explicitly', () => {
    const { client, socket } = setup()
    const mention = vi.fn()
    const mentionAll = vi.fn()
    client.on('mention', mention)
    client.on('mention-all', mentionAll)
    socket.triggerMessagesUpsert({
      messages: [
        msg({
          key: { remoteJid: GROUP, id: 'M3', fromMe: false, participant: 'p@s.whatsapp.net' },
          message: { extendedTextMessage: { text: 'hey @123', contextInfo: { mentionedJid: [SELF] } } },
        }),
      ],
      type: 'notify',
    })
    expect(mention).toHaveBeenCalledTimes(1)
    expect(mentionAll).not.toHaveBeenCalled()
    expect((mention.mock.calls[0]?.[0] as MentionContext).selfJid).toBe(SELF)
  })

  it('mention-all fires (not mention) on group @everyone, flagged isMentionAll', () => {
    const { client, socket } = setup()
    const mention = vi.fn()
    const mentionAll = vi.fn()
    client.on('mention', mention)
    client.on('mention-all', mentionAll)
    socket.triggerMessagesUpsert({
      messages: [
        msg({
          key: { remoteJid: GROUP, id: 'M4', fromMe: false, participant: 'p@s.whatsapp.net' },
          message: { extendedTextMessage: { text: '@all', contextInfo: { groupMentions: [{ groupJid: GROUP }] } } },
        }),
      ],
      type: 'notify',
    })
    expect(mentionAll).toHaveBeenCalledTimes(1)
    expect(mention).not.toHaveBeenCalled()
    expect((mentionAll.mock.calls[0]?.[0] as MentionAllContext).isMentionAll).toBe(true)
  })

  it('type-only: mention-all discriminated from mention via isMentionAll', () => {
    expectTypeOf<ClientEventMap['mention-all']>().toEqualTypeOf<MentionAllContext>()
    expectTypeOf<ClientEventMap['mention']>().toEqualTypeOf<MentionContext>()
    expectTypeOf<MentionAllContext['isMentionAll']>().toEqualTypeOf<true>()
    expectTypeOf<MentionAllContext>().not.toHaveProperty('mentionedJids')
  })
})

describe('Phase 4 SC#5: lifecycle discriminated unions; every event typed, no `any`', () => {
  it('history-sync emits discriminated status payload', () => {
    const { client, socket } = setup()
    const seen = vi.fn()
    client.on('history-sync', seen)
    socket.triggerHistoryStatus({ syncType: 2, status: 'complete', explicit: true })
    expect(seen.mock.calls[0]?.[0]).toMatchObject({ status: 'complete', explicit: true })
  })

  it('limited narrows on reachout-timelock vs chat-limit-reached', () => {
    const { client, socket } = setup()
    const seen = vi.fn()
    client.on('limited', seen)
    socket.ev.emit('connection.update', { reachoutTimeLock: { isActive: true, timeEnforcementEnds: new Date(5000) } })
    socket.triggerMessageCapping({ capping_status: 'CAPPED', used_quota: 5, total_quota: 10 })
    expect(seen.mock.calls[0]?.[0]).toMatchObject({ reason: 'reachout-timelock', retryAt: 5000 })
    expect(seen.mock.calls[1]?.[0]).toMatchObject({ reason: 'chat-limit-reached', usedQuota: 5 })
  })

  it('presence emits per-participant discriminated status', () => {
    const { client, socket } = setup()
    const seen = vi.fn()
    client.on('presence', seen)
    socket.triggerPresence({
      id: '999@s.whatsapp.net',
      presences: { 'a@s.whatsapp.net': { lastKnownPresence: 'composing' } },
    })
    expect((seen.mock.calls[0]?.[0] as PresencePayload).status).toBe('composing')
  })

  it('newsletter consolidates 4 sources into discriminated action', () => {
    const { client, socket } = setup()
    const seen = vi.fn()
    client.on('newsletter', seen)
    socket.triggerNewsletterReaction({ id: 'nl1', server_id: 's1', reaction: { code: '❤️' } })
    socket.triggerNewsletterSettings({ id: 'nl1', update: { mute: true } })
    expect(seen.mock.calls[0]?.[0]).toMatchObject({ action: 'reaction' })
    expect(seen.mock.calls[1]?.[0]).toMatchObject({ action: 'settings' })
  })

  it('call-incoming and call-ended discriminated on kind', () => {
    const { client, socket } = setup()
    const incoming = vi.fn()
    const ended = vi.fn()
    client.on('call-incoming', incoming)
    client.on('call-ended', ended)
    socket.triggerCall([{ id: 'C1', from: 'caller@s.whatsapp.net', status: 'offer', date: new Date(1000) }])
    socket.triggerCall([{ id: 'C2', from: 'caller@s.whatsapp.net', status: 'terminate', date: new Date(2000) }])
    expect(incoming.mock.calls[0]?.[0]).toMatchObject({ kind: 'incoming', callId: 'C1' })
    expect(ended.mock.calls[0]?.[0]).toMatchObject({ kind: 'ended', callId: 'C2' })
  })

  it('type-only: lifecycle unions narrow with no any', () => {
    expectTypeOf<ClientEventMap['limited']>().toEqualTypeOf<LimitedPayload>()
    expectTypeOf<Extract<LimitedPayload, { reason: 'reachout-timelock' }>['retryAt']>().toEqualTypeOf<number>()
    expectTypeOf<ClientEventMap['call-incoming']['kind']>().toEqualTypeOf<'incoming'>()
    expectTypeOf<ClientEventMap['call-ended']['kind']>().toEqualTypeOf<'ended'>()
    expectTypeOf<ClientEventMap['presence']['status']>().toEqualTypeOf<
      'available' | 'unavailable' | 'composing' | 'recording' | 'paused'
    >()
    expectTypeOf<NewsletterPayload>().not.toBeAny()
    expectTypeOf<CallPayload>().not.toBeAny()
  })

  it('audit:any gate is green across src/events/**', () => {
    const out = execSync('pnpm -s audit:any', { encoding: 'utf8' })
    expect(out).toMatch(/clean|pass|0 violation|no .*any/i)
  }, 30000)
})
