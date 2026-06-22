import { describe, expect, it, vi } from 'vitest'
import { proto } from 'baileys'
import { TypedEventEmitter } from '../../src/client/event-emitter.js'
import type { ClientEventMap } from '../../src/client/types.js'
import { attachInboundPipeline } from '../../src/events/pipeline.js'
import type { MessageContext } from '../../src/events/context.js'
import { makeInboundSocket, type InboundMockSocket } from '../_helpers/mock-socket-events.js'

const SELF = '123@s.whatsapp.net'
const GROUP = '99-1@g.us'

function setup(selfJid = SELF): {
  client: TypedEventEmitter<ClientEventMap>
  socket: InboundMockSocket
  handle: ReturnType<typeof attachInboundPipeline>
} {
  const client = new TypedEventEmitter<ClientEventMap>()
  const socket = makeInboundSocket({ user: { id: selfJid } })
  const handle = attachInboundPipeline(
    client,
    socket as unknown as Parameters<typeof attachInboundPipeline>[1],
    { selfJid },
  )
  return { client, socket, handle }
}

function textMsg(text: string, overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    key: { remoteJid: '999@s.whatsapp.net', id: 'M1', fromMe: false },
    message: { conversation: text },
    messageTimestamp: 1700,
    pushName: 'Alice',
    ...overrides,
  }
}

describe('attachInboundPipeline — messages.upsert', () => {
  it('emits text on plain conversation message', () => {
    const { client, socket } = setup()
    const seen = vi.fn()
    client.on('text', seen)
    socket.triggerMessagesUpsert({ messages: [textMsg('hello')], type: 'notify' })
    expect(seen).toHaveBeenCalledTimes(1)
    expect(seen.mock.calls[0]?.[0]).toMatchObject({ text: 'hello', senderId: '999@s.whatsapp.net', chatType: 'text' })
  })

  it('emits image with download function', () => {
    const { client, socket } = setup()
    const seen = vi.fn()
    client.on('image', seen)
    socket.triggerMessagesUpsert({
      messages: [textMsg('', { message: { imageMessage: { mimetype: 'image/jpeg', caption: 'pic' } } })],
      type: 'notify',
    })
    expect(seen).toHaveBeenCalledTimes(1)
    expect(typeof seen.mock.calls[0]?.[0].media?.buffer).toBe('function')
  })

  it('emits video, audio, document, sticker for respective nodes', () => {
    const { client, socket } = setup()
    const got: string[] = []
    for (const ev of ['video', 'audio', 'document', 'sticker'] as const) client.on(ev, () => got.push(ev))
    socket.triggerMessagesUpsert({ messages: [textMsg('', { message: { videoMessage: { mimetype: 'video/mp4' } } })], type: 'notify' })
    socket.triggerMessagesUpsert({ messages: [textMsg('', { message: { audioMessage: { mimetype: 'audio/ogg', ptt: true } } })], type: 'notify' })
    socket.triggerMessagesUpsert({ messages: [textMsg('', { message: { documentMessage: { mimetype: 'application/pdf', fileName: 'x.pdf' } } })], type: 'notify' })
    socket.triggerMessagesUpsert({ messages: [textMsg('', { message: { stickerMessage: { mimetype: 'image/webp' } } })], type: 'notify' })
    expect(got).toEqual(['video', 'audio', 'document', 'sticker'])
  })

  it('decodes an album message as chatType album with expected counts', () => {
    const { client, socket } = setup()
    const seen = vi.fn()
    client.on('message', seen)
    socket.triggerMessagesUpsert({
      messages: [textMsg('', { message: { albumMessage: { expectedImageCount: 3, expectedVideoCount: 1 } } })],
      type: 'notify',
    })
    expect(seen).toHaveBeenCalledTimes(1)
    const ctx = seen.mock.calls[0]?.[0]
    expect(ctx.chatType).toBe('album')
    expect(ctx.media).toMatchObject({ type: 'album', expectedImageCount: 3, expectedVideoCount: 1 })
  })

  it('album with stripped counts yields null (not a fabricated 0)', () => {
    const { client, socket } = setup()
    const seen = vi.fn()
    client.on('message', seen)
    socket.triggerMessagesUpsert({
      messages: [textMsg('', { message: { albumMessage: {} } })],
      type: 'notify',
    })
    expect(seen.mock.calls[0]?.[0].media).toMatchObject({ type: 'album', expectedImageCount: null, expectedVideoCount: null })
  })

  it('decodes group-invite, product, order, payment, and link preview as media', () => {
    const { client, socket } = setup()
    const got: Array<{ chatType: string; media: unknown }> = []
    client.on('message', (m) => got.push({ chatType: m.chatType, media: m.media }))
    socket.triggerMessagesUpsert({ messages: [textMsg('', { message: { groupInviteMessage: { groupJid: 'g@g.us', inviteCode: 'ABC', groupName: 'ScrapeOps', caption: 'join', inviteExpiration: 99 } } })], type: 'notify' })
    socket.triggerMessagesUpsert({ messages: [textMsg('', { message: { productMessage: { businessOwnerJid: 'biz@s.whatsapp.net', product: { productId: 'p1', title: 'Item', priceAmount1000: 50000, currencyCode: 'IDR' } } } })], type: 'notify' })
    socket.triggerMessagesUpsert({ messages: [textMsg('', { message: { orderMessage: { orderId: 'o1', orderTitle: 'My Order', itemCount: 3, totalAmount1000: 99000, totalCurrencyCode: 'IDR', status: 2 } } })], type: 'notify' })
    socket.triggerMessagesUpsert({ messages: [textMsg('', { message: { requestPaymentMessage: { amount1000: 25000, currencyCodeIso4217: 'IDR', noteMessage: { conversation: 'bayar' } } } })], type: 'notify' })
    socket.triggerMessagesUpsert({ messages: [textMsg('check', { message: { extendedTextMessage: { text: 'check', canonicalUrl: 'https://novaqore.ai', title: 'Novaqore', description: 'quantum' } } })], type: 'notify' })

    expect(got[0]).toMatchObject({ chatType: 'group-invite', media: { type: 'group-invite', groupId: 'g@g.us', inviteCode: 'ABC', groupName: 'ScrapeOps' } })
    expect(got[1]).toMatchObject({ chatType: 'product', media: { type: 'product', title: 'Item', price: 50, currency: 'IDR' } })
    expect(got[2]).toMatchObject({ chatType: 'order', media: { type: 'order', total: 99, status: 'accepted', itemCount: 3 } })
    expect(got[3]).toMatchObject({ chatType: 'payment', media: { type: 'payment', kind: 'request', amount: 25, currency: 'IDR', note: 'bayar' } })
    expect(got[4]).toMatchObject({ chatType: 'text', media: { type: 'link', url: 'https://novaqore.ai', title: 'Novaqore' } })
  })

  it('emits umbrella message for text and every media type', () => {
    const { client, socket } = setup()
    const got: string[] = []
    client.on('message', (m) => got.push(m.chatType))
    socket.triggerMessagesUpsert({ messages: [textMsg('hello')], type: 'notify' })
    socket.triggerMessagesUpsert({ messages: [textMsg('', { message: { imageMessage: { mimetype: 'image/jpeg', caption: 'pic' } } })], type: 'notify' })
    socket.triggerMessagesUpsert({ messages: [textMsg('', { message: { audioMessage: { mimetype: 'audio/ogg', ptt: true } } })], type: 'notify' })
    socket.triggerMessagesUpsert({ messages: [textMsg('', { message: { locationMessage: { degreesLatitude: 1, degreesLongitude: 2 } } })], type: 'notify' })
    expect(got).toEqual(['text', 'image', 'audio', 'location'])
  })

  it('umbrella message carries media buffer for media types', () => {
    const { client, socket } = setup()
    const seen = vi.fn()
    client.on('message', seen)
    socket.triggerMessagesUpsert({ messages: [textMsg('', { message: { imageMessage: { mimetype: 'image/jpeg', caption: 'pic' } } })], type: 'notify' })
    expect(seen).toHaveBeenCalledTimes(1)
    expect(typeof seen.mock.calls[0]?.[0].media?.buffer).toBe('function')
  })

  it('does not emit umbrella message for empty/contentless message', () => {
    const { client, socket } = setup()
    const seen = vi.fn()
    client.on('message', seen)
    socket.triggerMessagesUpsert({ messages: [textMsg('', { message: {} })], type: 'notify' })
    expect(seen).not.toHaveBeenCalled()
  })

  it('resolves LID mentions to PN via resolveLidToPn', async () => {
    const client = new TypedEventEmitter<ClientEventMap>()
    const socket = makeInboundSocket({ user: { id: SELF } })
    attachInboundPipeline(
      client,
      socket as unknown as Parameters<typeof attachInboundPipeline>[1],
      {
        selfJid: SELF,
        resolveLidToPn: async (lid) =>
          lid === '66554863583429@lid' ? '628999:0@s.whatsapp.net' : null,
      },
    )
    const seen = vi.fn()
    client.on('text', seen)
    socket.triggerMessagesUpsert({
      messages: [
        textMsg('hey @66554863583429', {
          message: { extendedTextMessage: { text: 'hey @66554863583429', contextInfo: { mentionedJid: ['66554863583429@lid'] } } },
        }),
      ],
      type: 'notify',
    })
    await new Promise((r) => setTimeout(r, 0))
    expect(seen).toHaveBeenCalledTimes(1)
    const ctx = seen.mock.calls[0]?.[0]
    expect(ctx.mentions).toEqual(['628999@s.whatsapp.net'])
    expect(ctx.text).toBe('hey @628999')
  })

  it('still emits the message when the LID resolver hangs (timeout fallback)', async () => {
    vi.useFakeTimers()
    try {
      const client = new TypedEventEmitter<ClientEventMap>()
      const socket = makeInboundSocket({ user: { id: SELF } })
      attachInboundPipeline(
        client,
        socket as unknown as Parameters<typeof attachInboundPipeline>[1],
        { selfJid: SELF, resolveLidToPn: () => new Promise<string | null>(() => {}) },
      )
      const seen = vi.fn()
      client.on('text', seen)
      socket.triggerMessagesUpsert({
        messages: [
          textMsg('hi @66554863583429', {
            message: { extendedTextMessage: { text: 'hi @66554863583429', contextInfo: { mentionedJid: ['66554863583429@lid'] } } },
          }),
        ],
        type: 'notify',
      })
      expect(seen).not.toHaveBeenCalled()
      await vi.advanceTimersByTimeAsync(3001)
      expect(seen).toHaveBeenCalledTimes(1)
      expect(seen.mock.calls[0]?.[0].mentions).toEqual(['66554863583429@lid'])
    } finally {
      vi.useRealTimers()
    }
  })

  it('keeps unmapped LID mentions (best-effort) and stays sync without a resolver', () => {
    const { client, socket } = setup()
    const seen = vi.fn()
    client.on('text', seen)
    socket.triggerMessagesUpsert({
      messages: [
        textMsg('@x', {
          message: { extendedTextMessage: { text: '@x', contextInfo: { mentionedJid: ['66554863583429@lid'] } } },
        }),
      ],
      type: 'notify',
    })
    expect(seen).toHaveBeenCalledTimes(1)
    expect(seen.mock.calls[0]?.[0].mentions).toEqual(['66554863583429@lid'])
  })

  it('derives senderDevice from the participant device suffix', () => {
    const { client, socket } = setup()
    const seen = vi.fn()
    client.on('text', seen)
    socket.triggerMessagesUpsert({
      messages: [
        textMsg('hi', { key: { remoteJid: '99-1@g.us', id: 'D1', fromMe: false, participant: '628000:3@s.whatsapp.net' } }),
      ],
      type: 'notify',
    })
    expect(seen.mock.calls[0]?.[0].senderDevice).toBe('web')
    expect(seen.mock.calls[0]?.[0].senderId).toBe('628000@s.whatsapp.net')
  })

  it('emits both text and mention when self mentioned (multi-decoder)', () => {
    const { client, socket } = setup()
    const text = vi.fn()
    const mention = vi.fn()
    client.on('text', text)
    client.on('mention', mention)
    socket.triggerMessagesUpsert({
      messages: [
        textMsg('hey @123', {
          message: { extendedTextMessage: { text: 'hey @123', contextInfo: { mentionedJid: [SELF] } } },
        }),
      ],
      type: 'notify',
    })
    expect(text).toHaveBeenCalledTimes(1)
    expect(mention).toHaveBeenCalledTimes(1)
  })

  it('emits mention-all in group with groupMentions', () => {
    const { client, socket } = setup()
    const seen = vi.fn()
    client.on('mention-all', seen)
    socket.triggerMessagesUpsert({
      messages: [
        textMsg('@everyone', {
          key: { remoteJid: '99-1@g.us', id: 'G1', fromMe: false, participant: 'p@s.whatsapp.net' },
          message: { extendedTextMessage: { text: '@all', contextInfo: { groupMentions: [{ groupJid: '99-1@g.us' }] } } },
        }),
      ],
      type: 'notify',
    })
    expect(seen).toHaveBeenCalledTimes(1)
  })

  it('emits button-click from buttonsResponseMessage', () => {
    const { client, socket } = setup()
    const seen = vi.fn()
    client.on('button-click', seen)
    socket.triggerMessagesUpsert({
      messages: [textMsg('', { message: { buttonsResponseMessage: { selectedButtonId: 'btn-1', selectedDisplayText: 'Yes' } } })],
      type: 'notify',
    })
    expect(seen.mock.calls[0]?.[0]).toMatchObject({ buttonId: 'btn-1', buttonText: 'Yes' })
  })

  it('emits list-select from listResponseMessage', () => {
    const { client, socket } = setup()
    const seen = vi.fn()
    client.on('list-select', seen)
    socket.triggerMessagesUpsert({
      messages: [textMsg('', { message: { listResponseMessage: { title: 'Menu', singleSelectReply: { selectedRowId: 'row-9' } } } })],
      type: 'notify',
    })
    expect(seen.mock.calls[0]?.[0]).toMatchObject({ rowId: 'row-9' })
  })

  it('dropSpoofedSelfOnly: upsert with requestId emits nothing', () => {
    const { client, socket } = setup()
    const seen = vi.fn()
    client.on('text', seen)
    socket.triggerMessagesUpsert({ messages: [textMsg('spoofed')], type: 'notify', requestId: 'spoof' })
    expect(seen).not.toHaveBeenCalled()
  })

  it('processes multiple messages in one upsert batch', () => {
    const { client, socket } = setup()
    const seen = vi.fn()
    client.on('text', seen)
    socket.triggerMessagesUpsert({ messages: [textMsg('a'), textMsg('b'), textMsg('c')], type: 'notify' })
    expect(seen).toHaveBeenCalledTimes(3)
  })
})

describe('attachInboundPipeline — ignoreMe', () => {
  function setupIgnore(ignoreMe: boolean): { client: TypedEventEmitter<ClientEventMap>; socket: InboundMockSocket } {
    const client = new TypedEventEmitter<ClientEventMap>()
    const socket = makeInboundSocket({ user: { id: SELF } })
    attachInboundPipeline(
      client,
      socket as unknown as Parameters<typeof attachInboundPipeline>[1],
      { selfJid: SELF, ignoreMe },
    )
    return { client, socket }
  }

  it('skips fromMe message events when ignoreMe is true', () => {
    const { client, socket } = setupIgnore(true)
    const seen = vi.fn()
    client.on('text', seen)
    socket.triggerMessagesUpsert({ messages: [textMsg('own', { key: { remoteJid: '999@s.whatsapp.net', id: 'X', fromMe: true } })], type: 'notify' })
    expect(seen).not.toHaveBeenCalled()
  })

  it('still emits non-fromMe events when ignoreMe is true', () => {
    const { client, socket } = setupIgnore(true)
    const seen = vi.fn()
    client.on('text', seen)
    socket.triggerMessagesUpsert({ messages: [textMsg('incoming')], type: 'notify' })
    expect(seen).toHaveBeenCalledTimes(1)
  })

  it('emits fromMe events by default (ignoreMe absent)', () => {
    const { client, socket } = setup()
    const seen = vi.fn()
    client.on('text', seen)
    socket.triggerMessagesUpsert({ messages: [textMsg('own', { key: { remoteJid: '999@s.whatsapp.net', id: 'X', fromMe: true } })], type: 'notify' })
    expect(seen).toHaveBeenCalledTimes(1)
  })
})

describe('attachInboundPipeline — messages.update mutations', () => {
  it('emits edit on MESSAGE_EDIT protocol', () => {
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
              editedMessage: { conversation: 'fixed' },
            },
          },
          messageTimestamp: 1800,
        },
      },
    ])
    expect(seen.mock.calls[0]?.[0]).toMatchObject({ newContent: 'fixed' })
  })

  it('emits delete on REVOKE protocol', () => {
    const { client, socket } = setup()
    const seen = vi.fn()
    client.on('delete', seen)
    socket.triggerMessagesUpdate([
      {
        key: { remoteJid: '999@s.whatsapp.net', id: 'M1', fromMe: false },
        update: { message: { protocolMessage: { type: proto.Message.ProtocolMessage.Type.REVOKE, key: { id: 'M1' } } } },
      },
    ])
    expect(seen.mock.calls[0]?.[0]).toMatchObject({ deletedFor: 'everyone' })
  })

  it('emits poll-vote on pollUpdates', () => {
    const { client, socket } = setup()
    const seen = vi.fn()
    client.on('poll-vote', seen)
    socket.triggerMessagesUpdate([
      {
        key: { remoteJid: '999@s.whatsapp.net', id: 'P1', fromMe: false },
        update: { pollUpdates: [{ pollUpdateMessageKey: { id: 'P1' }, vote: { selectedOptions: [] }, senderTimestampMs: 10 }] },
      },
    ])
    expect(seen).toHaveBeenCalledTimes(1)
  })
})

describe('attachInboundPipeline — reaction', () => {
  it('emits reaction', () => {
    const { client, socket } = setup()
    const seen = vi.fn()
    client.on('reaction', seen)
    socket.triggerMessagesReaction([
      { key: { remoteJid: '999@s.whatsapp.net', id: 'R1', fromMe: false }, reaction: { key: { id: 'M1' }, text: '👍', senderTimestampMs: 5 } },
    ])
    expect(seen.mock.calls[0]?.[0]).toMatchObject({ emoji: '👍' })
  })
})

describe('attachInboundPipeline — groups', () => {
  it('emits group-update', () => {
    const { client, socket } = setup()
    const seen = vi.fn()
    client.on('group-update', seen)
    socket.triggerGroupsUpdate([{ id: '99-1@g.us', subject: 'New Name' }])
    expect(seen.mock.calls[0]?.[0]).toMatchObject({ groupId: '99-1@g.us', update: { subject: 'New Name' } })
  })

  it('emits group-join on add action', () => {
    const { client, socket } = setup()
    const seen = vi.fn()
    client.on('group-join', seen)
    socket.triggerGroupParticipants({ id: '99-1@g.us', author: 'admin@s.whatsapp.net', participants: [{ id: 'new@s.whatsapp.net' }], action: 'add' })
    expect(seen).toHaveBeenCalledTimes(1)
  })

  it('emits group-leave on remove action', () => {
    const { client, socket } = setup()
    const seen = vi.fn()
    client.on('group-leave', seen)
    socket.triggerGroupParticipants({ id: '99-1@g.us', author: 'admin@s.whatsapp.net', participants: [{ id: 'gone@s.whatsapp.net' }], action: 'remove' })
    expect(seen).toHaveBeenCalledTimes(1)
  })

  it('emits member-tag', () => {
    const { client, socket } = setup()
    const seen = vi.fn()
    client.on('member-tag', seen)
    socket.triggerMemberTag({ groupId: '99-1@g.us', participant: 'p@s.whatsapp.net', label: 'VIP', messageTimestamp: 99 })
    expect(seen.mock.calls[0]?.[0]).toMatchObject({ label: 'VIP' })
  })
})

describe('attachInboundPipeline — call', () => {
  it('emits call-incoming on offer', () => {
    const { client, socket } = setup()
    const seen = vi.fn()
    client.on('call-incoming', seen)
    socket.triggerCall([{ id: 'C1', from: 'caller@s.whatsapp.net', status: 'offer', date: new Date(1000) }])
    expect(seen.mock.calls[0]?.[0]).toMatchObject({ kind: 'incoming', callId: 'C1' })
  })

  it('emits call-ended on terminate', () => {
    const { client, socket } = setup()
    const seen = vi.fn()
    client.on('call-ended', seen)
    socket.triggerCall([{ id: 'C2', from: 'caller@s.whatsapp.net', status: 'terminate', date: new Date(2000) }])
    expect(seen.mock.calls[0]?.[0]).toMatchObject({ kind: 'ended', callId: 'C2' })
  })
})

describe('attachInboundPipeline — lifecycle', () => {
  it('emits history-sync on complete status', () => {
    const { client, socket } = setup()
    const seen = vi.fn()
    client.on('history-sync', seen)
    socket.triggerHistoryStatus({ syncType: 2, status: 'complete', explicit: true })
    expect(seen.mock.calls[0]?.[0]).toMatchObject({ status: 'complete' })
  })

  it('emits presence per participant', () => {
    const { client, socket } = setup()
    const seen = vi.fn()
    client.on('presence', seen)
    socket.triggerPresence({
      id: '999@s.whatsapp.net',
      presences: { 'a@s.whatsapp.net': { lastKnownPresence: 'composing' }, 'b@s.whatsapp.net': { lastKnownPresence: 'available' } },
    })
    expect(seen).toHaveBeenCalledTimes(2)
  })

  it('emits limited from connection.update reachout timelock', () => {
    const { client, socket } = setup()
    const seen = vi.fn()
    client.on('limited', seen)
    socket.ev.emit('connection.update', { reachoutTimeLock: { isActive: true, timeEnforcementEnds: new Date(5000) } })
    expect(seen.mock.calls[0]?.[0]).toMatchObject({ reason: 'reachout-timelock', retryAt: 5000 })
  })

  it('emits limited from message-capping CAPPED', () => {
    const { client, socket } = setup()
    const seen = vi.fn()
    client.on('limited', seen)
    socket.triggerMessageCapping({ capping_status: 'CAPPED', used_quota: 5, total_quota: 10 })
    expect(seen.mock.calls[0]?.[0]).toMatchObject({ reason: 'chat-limit-reached', usedQuota: 5 })
  })

  it('does NOT emit limited on inactive reachout', () => {
    const { client, socket } = setup()
    const seen = vi.fn()
    client.on('limited', seen)
    socket.ev.emit('connection.update', { reachoutTimeLock: { isActive: false } })
    expect(seen).not.toHaveBeenCalled()
  })
})

describe('attachInboundPipeline — newsletter', () => {
  it('emits newsletter reaction', () => {
    const { client, socket } = setup()
    const seen = vi.fn()
    client.on('newsletter', seen)
    socket.triggerNewsletterReaction({ id: 'nl1', server_id: 's1', reaction: { code: '❤️' } })
    expect(seen.mock.calls[0]?.[0]).toMatchObject({ action: 'reaction', emoji: '❤️' })
  })

  it('emits newsletter view', () => {
    const { client, socket } = setup()
    const seen = vi.fn()
    client.on('newsletter', seen)
    socket.triggerNewsletterView({ id: 'nl1', server_id: 's1', count: 42 })
    expect(seen.mock.calls[0]?.[0]).toMatchObject({ action: 'view', count: 42 })
  })

  it('emits newsletter participants', () => {
    const { client, socket } = setup()
    const seen = vi.fn()
    client.on('newsletter', seen)
    socket.triggerNewsletterParticipants({ id: 'nl1', author: 'a', user: 'u', new_role: 'admin', action: 'promote' })
    expect(seen.mock.calls[0]?.[0]).toMatchObject({ action: 'participants' })
  })

  it('emits newsletter settings', () => {
    const { client, socket } = setup()
    const seen = vi.fn()
    client.on('newsletter', seen)
    socket.triggerNewsletterSettings({ id: 'nl1', update: { mute: true } })
    expect(seen.mock.calls[0]?.[0]).toMatchObject({ action: 'settings', update: { mute: true } })
  })
})

describe('attachInboundPipeline — detach + resilience', () => {
  it('detach removes all listeners', () => {
    const { socket, handle } = setup()
    const keys = [
      'messages.upsert', 'messages.update', 'messages.reaction', 'groups.update',
      'group-participants.update', 'group.member-tag.update', 'call', 'messaging-history.status',
      'presence.update', 'connection.update', 'message-capping.update', 'newsletter.reaction',
      'newsletter.view', 'newsletter-participants.update', 'newsletter-settings.update',
    ]
    for (const k of keys) expect(socket.ev.listenerCount(k)).toBeGreaterThan(0)
    handle.detach()
    for (const k of keys) expect(socket.ev.listenerCount(k)).toBe(0)
  })

  it('detach is idempotent', () => {
    const { handle } = setup()
    handle.detach()
    expect(() => handle.detach()).not.toThrow()
  })

  it('no events fire after detach', () => {
    const { client, socket, handle } = setup()
    const seen = vi.fn()
    client.on('text', seen)
    handle.detach()
    socket.triggerMessagesUpsert({ messages: [textMsg('post-detach')], type: 'notify' })
    expect(seen).not.toHaveBeenCalled()
  })

  it('decoder throw is caught and does not stop the batch', () => {
    const { client, socket } = setup()
    const seen = vi.fn()
    client.on('text', seen)
    socket.triggerMessagesUpsert({ messages: [{ key: null }, textMsg('after-bad')], type: 'notify' })
    expect(seen).toHaveBeenCalledTimes(1)
    expect(seen.mock.calls[0]?.[0]).toMatchObject({ text: 'after-bad', chatType: 'text' })
  })
})

describe('attachInboundPipeline — multi-listener regression (W2)', () => {
  it('Phase 3 connection.update handler still fires alongside pipeline', () => {
    const client = new TypedEventEmitter<ClientEventMap>()
    const socket = makeInboundSocket({ user: { id: SELF } })
    const phase3 = vi.fn()
    socket.ev.on('connection.update', phase3)
    const limited = vi.fn()
    client.on('limited', limited)
    attachInboundPipeline(
      client,
      socket as unknown as Parameters<typeof attachInboundPipeline>[1],
      { selfJid: SELF },
    )
    socket.ev.emit('connection.update', { reachoutTimeLock: { isActive: true, timeEnforcementEnds: new Date(7000) } })
    expect(phase3).toHaveBeenCalledTimes(1)
    expect(limited).toHaveBeenCalledTimes(1)
  })
})

function groupMsg(text: string): Record<string, unknown> {
  return {
    key: { remoteJid: GROUP, id: 'G1', fromMe: false, participant: '628333@s.whatsapp.net' },
    message: { conversation: text },
    messageTimestamp: 1700,
    pushName: 'Bob',
  }
}

describe('attachInboundPipeline — Task 2 wiring (roomNameCache + citation + receiverName)', () => {
  it('text payload is a MessageContext with channelId populated', () => {
    const client = new TypedEventEmitter<ClientEventMap>()
    const socket = makeInboundSocket({ user: { id: SELF } })
    attachInboundPipeline(
      client,
      socket as unknown as Parameters<typeof attachInboundPipeline>[1],
      { selfJid: SELF, channelId: 'session-a' },
    )
    const seen = vi.fn()
    client.on('text', seen)
    socket.triggerMessagesUpsert({
      messages: [{ key: { remoteJid: '999@s.whatsapp.net', id: 'M1', fromMe: false }, message: { conversation: 'hi' }, messageTimestamp: 1700 }],
      type: 'notify',
    })
    const payload = seen.mock.calls[0]?.[0] as MessageContext
    expect(payload.channelId).toBe('session-a')
    expect(payload.chatType).toBe('text')
  })

  it('WARNING 5: roomName() cached — two group messages share one groupMetadata fetch', async () => {
    const client = new TypedEventEmitter<ClientEventMap>()
    const socket = makeInboundSocket({ user: { id: SELF } })
    const groupMetaSpy = vi.fn().mockResolvedValue({ subject: 'Test Group' })
    attachInboundPipeline(
      client,
      socket as unknown as Parameters<typeof attachInboundPipeline>[1],
      { selfJid: SELF, groupMetadata: groupMetaSpy },
    )
    const seen = vi.fn()
    client.on('text', seen)
    socket.triggerMessagesUpsert({ messages: [groupMsg('first')], type: 'notify' })
    socket.triggerMessagesUpsert({ messages: [groupMsg('second')], type: 'notify' })
    expect(seen).toHaveBeenCalledTimes(2)
    const name1 = await (seen.mock.calls[0]?.[0] as MessageContext).roomName()
    const name2 = await (seen.mock.calls[1]?.[0] as MessageContext).roomName()
    expect(name1).toBe('Test Group')
    expect(name2).toBe('Test Group')
    expect(groupMetaSpy).toHaveBeenCalledTimes(1)
  })

  it('citation config reaches emitted context predicates', async () => {
    const client = new TypedEventEmitter<ClientEventMap>()
    const socket = makeInboundSocket({ user: { id: SELF } })
    const authorJid = '628999@s.whatsapp.net'
    attachInboundPipeline(
      client,
      socket as unknown as Parameters<typeof attachInboundPipeline>[1],
      { selfJid: SELF, citationConfig: { authors: [authorJid] } },
    )
    const seen = vi.fn()
    client.on('text', seen)
    socket.triggerMessagesUpsert({
      messages: [{ key: { remoteJid: authorJid, id: 'M2', fromMe: false }, message: { conversation: 'by author' }, messageTimestamp: 1700 }],
      type: 'notify',
    })
    const payload = seen.mock.calls[0]?.[0] as MessageContext
    await expect(payload.citation.authors()).resolves.toBe(true)
    await expect(payload.citation.banned()).resolves.toBe(false)
  })

  it('receiverName() resolves null when no display name (me.name undefined)', async () => {
    const client = new TypedEventEmitter<ClientEventMap>()
    const socket = makeInboundSocket({ user: { id: SELF } })
    attachInboundPipeline(
      client,
      socket as unknown as Parameters<typeof attachInboundPipeline>[1],
      { selfJid: SELF, receiverName: () => Promise.resolve(null) },
    )
    const seen = vi.fn()
    client.on('text', seen)
    socket.triggerMessagesUpsert({
      messages: [{ key: { remoteJid: '999@s.whatsapp.net', id: 'M3', fromMe: false }, message: { conversation: 'hey' }, messageTimestamp: 1700 }],
      type: 'notify',
    })
    const payload = seen.mock.calls[0]?.[0] as MessageContext
    await expect(payload.receiverName()).resolves.toBeNull()
  })

  it('dropSpoofedSelfOnly guard still drops spoofed self-only messages', () => {
    const { client, socket } = setup()
    const seen = vi.fn()
    client.on('text', seen)
    socket.triggerMessagesUpsert({
      messages: [{ key: { remoteJid: '999@s.whatsapp.net', id: 'M4', fromMe: false }, message: { conversation: 'spoof' }, messageTimestamp: 1700 }],
      type: 'notify',
      requestId: 'spoof-id',
    })
    expect(seen).not.toHaveBeenCalled()
  })
})
