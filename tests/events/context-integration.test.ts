import { Readable } from 'node:stream'
import { describe, expect, it, vi } from 'vitest'
import { TypedEventEmitter } from '../../src/client/event-emitter.js'
import type { ClientEventMap } from '../../src/client/types.js'
import { attachInboundPipeline } from '../../src/events/pipeline.js'
import type { MessageContext } from '../../src/events/context.js'
import { computeUniqueId } from '../../src/events/context.js'
import { makeInboundSocket } from '../_helpers/mock-socket-events.js'

const { downloadMediaMessage } = vi.hoisted(() => ({ downloadMediaMessage: vi.fn() }))

vi.mock('baileys', async (importOriginal) => {
  const actual = await importOriginal<typeof import('baileys')>()
  return { ...actual, downloadMediaMessage }
})

const SELF_JID = '628SELF@s.whatsapp.net'
const SESSION_ID = 'session-xyz'
const GROUP = '99-1@g.us'
const SENDER_PN = '628111@s.whatsapp.net'
const SENDER_LID = '27211@lid'

function setup(opts: {
  channelId?: string
  groupMetadata?: (id: string) => Promise<{ subject?: string } | null>
  citationConfig?: import('../../src/events/context.js').CitationConfig
  receiverName?: () => Promise<string | null>
} = {}) {
  const client = new TypedEventEmitter<ClientEventMap>()
  const socket = makeInboundSocket({ user: { id: SELF_JID } })
  attachInboundPipeline(
    client,
    socket as unknown as Parameters<typeof attachInboundPipeline>[1],
    { selfJid: SELF_JID, channelId: opts.channelId ?? SESSION_ID, ...opts },
  )
  return { client, socket }
}

function textMsg(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    key: { remoteJid: SENDER_PN, id: 'M1', fromMe: false },
    message: { conversation: 'hello' },
    messageTimestamp: 1700,
    pushName: 'Alice',
    ...overrides,
  }
}

describe('context-integration: receiverId and channelId wiring (BLOCKER 4)', () => {
  it('emitted context.receiverId equals the selfJid supplied to the pipeline', () => {
    const { client, socket } = setup()
    const seen = vi.fn()
    client.on('text', seen)
    socket.triggerMessagesUpsert({ messages: [textMsg()], type: 'notify' })
    const ctx = seen.mock.calls[0]?.[0] as MessageContext
    expect(ctx.receiverId).toBeTruthy()
    expect(ctx.receiverId).toBe(SELF_JID)
  })

  it('emitted context.channelId equals the sessionId supplied to the pipeline', () => {
    const { client, socket } = setup({ channelId: SESSION_ID })
    const seen = vi.fn()
    client.on('text', seen)
    socket.triggerMessagesUpsert({ messages: [textMsg()], type: 'notify' })
    const ctx = seen.mock.calls[0]?.[0] as MessageContext
    expect(ctx.channelId).toBe(SESSION_ID)
  })

  it('receiverId and channelId are independent of message content', () => {
    const customChannel = 'my-custom-session'
    const { client, socket } = setup({ channelId: customChannel })
    const seen = vi.fn()
    client.on('text', seen)
    socket.triggerMessagesUpsert({
      messages: [textMsg({ message: { conversation: 'irrelevant content' } })],
      type: 'notify',
    })
    const ctx = seen.mock.calls[0]?.[0] as MessageContext
    expect(ctx.receiverId).toBe(SELF_JID)
    expect(ctx.channelId).toBe(customChannel)
  })
})

describe('context-integration: LID DM senderId + senderLid', () => {
  it('LID DM: empty participant + remoteJidAlt resolves senderId (PN) and senderLid (LID)', () => {
    const { client, socket } = setup()
    const seen = vi.fn()
    client.on('text', seen)
    socket.triggerMessagesUpsert({
      messages: [
        textMsg({
          key: {
            remoteJid: SENDER_PN,
            remoteJidAlt: SENDER_LID,
            id: 'LID1',
            fromMe: false,
            participant: '',
          },
          message: { conversation: 'lid dm message' },
        }),
      ],
      type: 'notify',
    })
    const ctx = seen.mock.calls[0]?.[0] as MessageContext
    expect(ctx.senderId).toBe(SENDER_PN)
    expect(ctx.senderLid).toBe(SENDER_LID)
  })

  it('LID DM: both senderId and senderLid are non-empty strings', () => {
    const { client, socket } = setup()
    const seen = vi.fn()
    client.on('text', seen)
    socket.triggerMessagesUpsert({
      messages: [
        textMsg({
          key: {
            remoteJid: SENDER_PN,
            remoteJidAlt: SENDER_LID,
            id: 'LID2',
            fromMe: false,
            participant: '',
          },
        }),
      ],
      type: 'notify',
    })
    const ctx = seen.mock.calls[0]?.[0] as MessageContext
    expect(typeof ctx.senderId).toBe('string')
    expect(ctx.senderId.length).toBeGreaterThan(0)
    expect(typeof ctx.senderLid).toBe('string')
    expect((ctx.senderLid as string).length).toBeGreaterThan(0)
  })
})

describe('context-integration: group roomName single-fetch cache', () => {
  it('two group messages share exactly one groupMetadata fetch', async () => {
    const groupMetaSpy = vi.fn().mockResolvedValue({ subject: 'Group Test' })
    const { client, socket } = setup({ groupMetadata: groupMetaSpy })
    const seen = vi.fn()
    client.on('text', seen)

    socket.triggerMessagesUpsert({
      messages: [
        {
          key: { remoteJid: GROUP, id: 'G1', fromMe: false, participant: SENDER_PN },
          message: { conversation: 'first' },
          messageTimestamp: 1700,
        },
      ],
      type: 'notify',
    })
    socket.triggerMessagesUpsert({
      messages: [
        {
          key: { remoteJid: GROUP, id: 'G2', fromMe: false, participant: SENDER_PN },
          message: { conversation: 'second' },
          messageTimestamp: 1701,
        },
      ],
      type: 'notify',
    })

    expect(seen).toHaveBeenCalledTimes(2)
    const name1 = await (seen.mock.calls[0]?.[0] as MessageContext).roomName()
    const name2 = await (seen.mock.calls[1]?.[0] as MessageContext).roomName()
    expect(name1).toBe('Group Test')
    expect(name2).toBe('Group Test')
    expect(groupMetaSpy).toHaveBeenCalledTimes(1)
  })

  it('roomName() returns the peer name for non-group DM (no group fetch)', async () => {
    const groupMetaSpy = vi.fn().mockResolvedValue({ subject: 'Should Not Be Called' })
    const { client, socket } = setup({ groupMetadata: groupMetaSpy })
    const seen = vi.fn()
    client.on('text', seen)
    socket.triggerMessagesUpsert({ messages: [textMsg()], type: 'notify' })
    const ctx = seen.mock.calls[0]?.[0] as MessageContext
    const name = await ctx.roomName()
    expect(name).toBe('Alice')
    expect(groupMetaSpy).not.toHaveBeenCalled()
  })
})

describe('context-integration: lazy media (zero calls pre-access)', () => {
  it('emitting an image event does NOT call downloadMediaMessage until media.buffer() awaited', async () => {
    downloadMediaMessage.mockReset()
    const buf = Buffer.from('img-data')
    downloadMediaMessage.mockResolvedValueOnce(buf)
    const { client, socket } = setup()
    const seen = vi.fn()
    client.on('image', seen)

    socket.triggerMessagesUpsert({
      messages: [
        textMsg({ message: { imageMessage: { mimetype: 'image/jpeg', caption: 'pic', fileLength: 100 } } }),
      ],
      type: 'notify',
    })

    expect(downloadMediaMessage).not.toHaveBeenCalled()
    const ctx = seen.mock.calls[0]?.[0] as MessageContext
    expect(ctx.media).toBeDefined()

    const result = await ctx.media!.buffer()
    expect(downloadMediaMessage).toHaveBeenCalledTimes(1)
    expect(Buffer.isBuffer(result)).toBe(true)
  })

  it('media.stream() returns a Readable', async () => {
    downloadMediaMessage.mockReset()
    const readable = new Readable({ read() { this.push(null) } })
    downloadMediaMessage.mockResolvedValueOnce(readable)
    const { client, socket } = setup()
    const seen = vi.fn()
    client.on('video', seen)

    socket.triggerMessagesUpsert({
      messages: [
        textMsg({ message: { videoMessage: { mimetype: 'video/mp4' } } }),
      ],
      type: 'notify',
    })

    expect(downloadMediaMessage).not.toHaveBeenCalled()
    const ctx = seen.mock.calls[0]?.[0] as MessageContext
    const stream = await ctx.media!.stream()
    expect(downloadMediaMessage).toHaveBeenCalledTimes(1)
    expect(stream instanceof Readable).toBe(true)
  })
})

describe('context-integration: replied() nested MessageContext', () => {
  it('a quoted message yields a nested MessageContext with correct fields', async () => {
    const { client, socket } = setup()
    const seen = vi.fn()
    client.on('text', seen)

    socket.triggerMessagesUpsert({
      messages: [
        {
          key: { remoteJid: SENDER_PN, id: 'M2', fromMe: false },
          message: {
            extendedTextMessage: {
              text: 'reply text',
              contextInfo: {
                stanzaId: 'QUOTED1',
                participant: SENDER_PN,
                remoteJid: SENDER_PN,
                quotedMessage: { conversation: 'original text' },
              },
            },
          },
          messageTimestamp: 1700,
          pushName: 'Alice',
        },
      ],
      type: 'notify',
    })

    const ctx = seen.mock.calls[0]?.[0] as MessageContext
    const replied = await ctx.replied()
    expect(replied).not.toBeNull()
    expect(replied!.text).toBe('original text')
    expect(replied!.chatType).toBe('text')
  })

  it('a quoted media message yields a nested context with media attachment', async () => {
    const { client, socket } = setup()
    const seen = vi.fn()
    client.on('text', seen)

    socket.triggerMessagesUpsert({
      messages: [
        {
          key: { remoteJid: SENDER_PN, id: 'M3', fromMe: false },
          message: {
            extendedTextMessage: {
              text: 'reply to image',
              contextInfo: {
                stanzaId: 'QUOTED2',
                participant: SENDER_PN,
                remoteJid: SENDER_PN,
                quotedMessage: { imageMessage: { mimetype: 'image/jpeg', caption: 'orig pic' } },
              },
            },
          },
          messageTimestamp: 1700,
          pushName: 'Alice',
        },
      ],
      type: 'notify',
    })

    const ctx = seen.mock.calls[0]?.[0] as MessageContext
    const replied = await ctx.replied()
    expect(replied).not.toBeNull()
    expect(replied!.chatType).toBe('image')
    expect(replied!.media?.type).toBe('image')
    expect(typeof (replied!.media as { buffer?: unknown })?.buffer).toBe('function')
  })

  it('quoting own (bot) message resolves self PN + chat room, not the LID', async () => {
    const SELF_LID = '262298551722238@lid'
    const client = new TypedEventEmitter<ClientEventMap>()
    const socket = makeInboundSocket({ user: { id: SELF_JID } })
    attachInboundPipeline(
      client,
      socket as unknown as Parameters<typeof attachInboundPipeline>[1],
      { selfJid: SELF_JID, selfLid: SELF_LID, selfName: 'Botty', channelId: SESSION_ID },
    )
    const seen = vi.fn()
    client.on('text', seen)
    socket.triggerMessagesUpsert({
      messages: [
        {
          key: { remoteJid: SENDER_PN, id: 'R1', fromMe: false },
          message: {
            extendedTextMessage: {
              text: 'reply to my own msg',
              contextInfo: {
                stanzaId: 'QSELF',
                participant: SELF_LID,
                remoteJid: SELF_LID,
                quotedMessage: { conversation: 'bot earlier reply' },
              },
            },
          },
          messageTimestamp: 1700,
          pushName: 'Alice',
        },
      ],
      type: 'notify',
    })
    const ctx = seen.mock.calls[0]?.[0] as MessageContext
    const replied = await ctx.replied()
    expect(replied).not.toBeNull()
    expect(replied!.isFromMe).toBe(true)
    expect(replied!.senderId).toBe(SELF_JID)
    expect(replied!.roomId).toBe(SENDER_PN)
    expect(replied!.senderName).toBe('Botty')
    expect(await replied!.roomName()).toBe('Alice')
  })

  it('quoting the DM partner resolves their PN even when contextInfo carries a LID', async () => {
    const { client, socket } = setup()
    const seen = vi.fn()
    client.on('text', seen)
    socket.triggerMessagesUpsert({
      messages: [
        {
          key: { remoteJid: SENDER_PN, id: 'R2', fromMe: false, participantAlt: SENDER_LID },
          message: {
            extendedTextMessage: {
              text: 'reply to partner',
              contextInfo: {
                stanzaId: 'QPART',
                participant: SENDER_LID,
                remoteJid: SENDER_LID,
                quotedMessage: { conversation: 'partner earlier msg' },
              },
            },
          },
          messageTimestamp: 1700,
          pushName: 'Alice',
        },
      ],
      type: 'notify',
    })
    const ctx = seen.mock.calls[0]?.[0] as MessageContext
    const replied = await ctx.replied()
    expect(replied).not.toBeNull()
    expect(replied!.isFromMe).toBe(false)
    expect(replied!.senderId).toBe(SENDER_PN)
    expect(replied!.roomId).toBe(SENDER_PN)
    expect(replied!.senderName).toBe('Alice')
  })

  it('replied() returns null when no contextInfo quote present', async () => {
    const { client, socket } = setup()
    const seen = vi.fn()
    client.on('text', seen)
    socket.triggerMessagesUpsert({ messages: [textMsg()], type: 'notify' })
    const ctx = seen.mock.calls[0]?.[0] as MessageContext
    const replied = await ctx.replied()
    expect(replied).toBeNull()
  })
})

describe('context-integration: citation predicates', () => {
  it('banned array containing senderId -> await ctx.citation.banned() === true', async () => {
    const { client, socket } = setup({ citationConfig: { banned: [SENDER_PN] } })
    const seen = vi.fn()
    client.on('text', seen)
    socket.triggerMessagesUpsert({ messages: [textMsg()], type: 'notify' })
    const ctx = seen.mock.calls[0]?.[0] as MessageContext
    await expect(ctx.citation.banned()).resolves.toBe(true)
    await expect(ctx.citation.authors()).resolves.toBe(false)
  })

  it('authors array containing senderId -> await ctx.citation.authors() === true', async () => {
    const { client, socket } = setup({ citationConfig: { authors: [SENDER_PN] } })
    const seen = vi.fn()
    client.on('text', seen)
    socket.triggerMessagesUpsert({ messages: [textMsg()], type: 'notify' })
    const ctx = seen.mock.calls[0]?.[0] as MessageContext
    await expect(ctx.citation.authors()).resolves.toBe(true)
    await expect(ctx.citation.banned()).resolves.toBe(false)
  })

  it('absent citation config -> both predicates resolve false', async () => {
    const { client, socket } = setup()
    const seen = vi.fn()
    client.on('text', seen)
    socket.triggerMessagesUpsert({ messages: [textMsg()], type: 'notify' })
    const ctx = seen.mock.calls[0]?.[0] as MessageContext
    await expect(ctx.citation.authors()).resolves.toBe(false)
    await expect(ctx.citation.banned()).resolves.toBe(false)
  })

  it('citation predicate resolved fresh per access (no cached true)', async () => {
    const bannedFn = vi.fn().mockResolvedValue(true)
    const { client, socket } = setup({ citationConfig: { banned: bannedFn } })
    const seen = vi.fn()
    client.on('text', seen)
    socket.triggerMessagesUpsert({ messages: [textMsg()], type: 'notify' })
    const ctx = seen.mock.calls[0]?.[0] as MessageContext
    await ctx.citation.banned()
    await ctx.citation.banned()
    expect(bannedFn).toHaveBeenCalledTimes(2)
  })
})

describe('context-integration: deterministic uniqueId', () => {
  it('two decodes of the same stanza produce the same uniqueId', () => {
    const { client, socket } = setup()
    const seen = vi.fn()
    client.on('text', seen)
    const stanza = textMsg({ key: { remoteJid: SENDER_PN, id: 'STABLE1', fromMe: false } })
    socket.triggerMessagesUpsert({ messages: [stanza], type: 'notify' })
    socket.triggerMessagesUpsert({ messages: [stanza], type: 'notify' })
    const id1 = (seen.mock.calls[0]?.[0] as MessageContext).uniqueId
    const id2 = (seen.mock.calls[1]?.[0] as MessageContext).uniqueId
    expect(id1).toBe(id2)
    expect(typeof id1).toBe('string')
    expect(id1.length).toBeGreaterThan(0)
  })

  it('uniqueId matches computeUniqueId output for the same key', () => {
    const { client, socket } = setup()
    const seen = vi.fn()
    client.on('text', seen)
    const key = { remoteJid: SENDER_PN, id: 'HASH1', fromMe: false }
    socket.triggerMessagesUpsert({ messages: [textMsg({ key })], type: 'notify' })
    const ctx = seen.mock.calls[0]?.[0] as MessageContext
    expect(ctx.uniqueId).toBe(computeUniqueId(key))
  })
})

describe('context-integration: links extraction', () => {
  it('a text with two URLs surfaces both in ctx.links', () => {
    const { client, socket } = setup()
    const seen = vi.fn()
    client.on('text', seen)
    socket.triggerMessagesUpsert({
      messages: [
        textMsg({
          message: {
            conversation: 'check https://github.com/zeative/zaileys and https://example.com',
          },
        }),
      ],
      type: 'notify',
    })
    const ctx = seen.mock.calls[0]?.[0] as MessageContext
    expect(ctx.links).toHaveLength(2)
    expect(ctx.links).toContain('https://github.com/zeative/zaileys')
    expect(ctx.links).toContain('https://example.com')
  })

  it('text with no URLs has empty links array', () => {
    const { client, socket } = setup()
    const seen = vi.fn()
    client.on('text', seen)
    socket.triggerMessagesUpsert({
      messages: [textMsg({ message: { conversation: 'plain text no urls' } })],
      type: 'notify',
    })
    const ctx = seen.mock.calls[0]?.[0] as MessageContext
    expect(ctx.links).toEqual([])
  })

  it('isQuestion true when text ends with ?', () => {
    const { client, socket } = setup()
    const seen = vi.fn()
    client.on('text', seen)
    socket.triggerMessagesUpsert({
      messages: [textMsg({ message: { conversation: 'Is this working?' } })],
      type: 'notify',
    })
    const ctx = seen.mock.calls[0]?.[0] as MessageContext
    expect(ctx.isQuestion).toBe(true)
  })

  it('isPrefix true when text starts with a configured prefix', () => {
    const client = new TypedEventEmitter<ClientEventMap>()
    const socket = makeInboundSocket({ user: { id: SELF_JID } })
    attachInboundPipeline(
      client,
      socket as unknown as Parameters<typeof attachInboundPipeline>[1],
      { selfJid: SELF_JID, channelId: SESSION_ID, prefixes: ['/'] },
    )
    const seen = vi.fn()
    client.on('text', seen)
    socket.triggerMessagesUpsert({
      messages: [textMsg({ message: { conversation: '/help me' } })],
      type: 'notify',
    })
    const ctx = seen.mock.calls[0]?.[0] as MessageContext
    expect(ctx.isPrefix).toBe(true)
  })

  it('isTagMe true when self jid is mentioned', () => {
    const { client, socket } = setup()
    const seen = vi.fn()
    client.on('text', seen)
    socket.triggerMessagesUpsert({
      messages: [
        textMsg({
          key: { remoteJid: GROUP, id: 'T1', fromMe: false, participant: SENDER_PN },
          message: {
            extendedTextMessage: {
              text: `hey @${SELF_JID.replace('@s.whatsapp.net', '')}`,
              contextInfo: { mentionedJid: [SELF_JID] },
            },
          },
        }),
      ],
      type: 'notify',
    })
    const ctx = seen.mock.calls[0]?.[0] as MessageContext
    expect(ctx.isTagMe).toBe(true)
  })
})
