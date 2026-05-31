import type { WAMessage } from 'baileys'
import { describe, expect, it, vi } from 'vitest'

vi.mock('baileys', async (importOriginal) => {
  const actual = await importOriginal<typeof import('baileys')>()
  return {
    ...actual,
    downloadMediaMessage: vi.fn().mockImplementation((_msg: unknown, type: string) => {
      if (type === 'stream') {
        const { Readable } = require('stream')
        return Promise.resolve(new Readable({ read() { this.push(null) } }))
      }
      return Promise.resolve(Buffer.alloc(8))
    }),
  }
})

const {
  decodeText,
  decodeImage,
  decodeVideo,
  decodeAudio,
  decodeDocument,
  decodeSticker,
  decodeMention,
  decodeMentionAll,
} = await import('../../../src/events/decoders/messages.js')

const SELF = '628111@s.whatsapp.net'
const GROUP = '120363@g.us'

type Ctx = { selfJid: string }
const ctx: Ctx = { selfJid: SELF }

const base = (over: Partial<WAMessage> = {}): WAMessage =>
  ({
    key: { remoteJid: '628222@s.whatsapp.net', fromMe: false, id: 'M1' },
    messageTimestamp: 1700000000,
    pushName: 'Alice',
    message: {},
    ...over,
  }) as unknown as WAMessage

describe('decodeText', () => {
  it('decodes a plain conversation message', () => {
    const out = decodeText(base({ message: { conversation: 'hello' } }), ctx)
    expect(out).not.toBeNull()
    expect(out?.text).toBe('hello')
    expect(out?.isFromMe).toBe(false)
    expect(out?.isGroup).toBe(false)
    expect(out?.senderId).toBe('628222@s.whatsapp.net')
    expect(out?.chatId).toBe('M1')
    expect(out?.chatType).toBe('text')
  })

  it('decodes an extendedTextMessage', () => {
    const out = decodeText(base({ message: { extendedTextMessage: { text: 'world' } } }), ctx)
    expect(out?.text).toBe('world')
  })

  it('returns null when message body is absent', () => {
    expect(decodeText(base({ message: {} }), ctx)).toBeNull()
    expect(decodeText(base({ message: null }), ctx)).toBeNull()
  })

  it('decodes a 1:1 DM addressed over LID where participant is an empty string', () => {
    const out = decodeText(
      base({
        key: {
          remoteJid: '123918899749051@lid',
          remoteJidAlt: '6285136635787@s.whatsapp.net',
          fromMe: false,
          id: 'L1',
          participant: '',
          addressingMode: 'lid',
        } as unknown as WAMessage['key'],
        message: { extendedTextMessage: { text: 'tes' }, messageContextInfo: {} },
      }),
      ctx,
    )
    expect(out).not.toBeNull()
    expect(out?.text).toBe('tes')
    expect(out?.isGroup).toBe(false)
    expect(out?.senderId).toBe('123918899749051@lid')
  })

  it('flags group context from participant key', () => {
    const out = decodeText(
      base({
        key: { remoteJid: GROUP, fromMe: false, id: 'G', participant: '628333@s.whatsapp.net' },
        message: { conversation: 'gm' },
      }),
      ctx,
    )
    expect(out?.isGroup).toBe(true)
    expect(out?.senderId).toBe('628333@s.whatsapp.net')
    expect(out?.chatType).toBe('text')
  })

  it('honours isFromMe', () => {
    const out = decodeText(
      base({ key: { remoteJid: '628222@s.whatsapp.net', fromMe: true, id: 'X' }, message: { conversation: 'me' } }),
      ctx,
    )
    expect(out?.isFromMe).toBe(true)
  })

  it('mentions array is populated from contextInfo.mentionedJid', () => {
    const out = decodeText(
      base({
        message: {
          extendedTextMessage: {
            text: 'hey @628999',
            contextInfo: { mentionedJid: ['628999@s.whatsapp.net'] },
          },
        },
      }),
      ctx,
    )
    expect(out?.mentions).toContain('628999@s.whatsapp.net')
  })

  it('links extracted from text', () => {
    const out = decodeText(base({ message: { conversation: 'visit https://example.com please' } }), ctx)
    expect(out?.links).toContain('https://example.com')
  })

  it('does NOT call roomName resolver or downloadMediaMessage during decode (lazy invariant)', async () => {
    const { downloadMediaMessage } = await import('baileys')
    const downloadSpy = vi.mocked(downloadMediaMessage)
    downloadSpy.mockClear()

    const roomNameSpy = vi.fn().mockResolvedValue('Group Test')
    const out = decodeText(
      base({
        key: { remoteJid: GROUP, fromMe: false, id: 'G2', participant: '628333@s.whatsapp.net' },
        message: { conversation: 'hi' },
      }),
      { selfJid: SELF, resolveRoomName: roomNameSpy },
    )
    expect(out).not.toBeNull()
    expect(roomNameSpy).not.toHaveBeenCalled()
    expect(downloadSpy).not.toHaveBeenCalled()
  })
})

describe('Task 1a — graceful defaults (BLOCKER 1)', () => {
  it('decodes without throwing when DecodeContext has only selfJid', () => {
    const out = decodeText(base({ message: { conversation: 'hello' } }), { selfJid: SELF })
    expect(out).not.toBeNull()
  })

  it('channelId is empty string when absent from context', () => {
    const out = decodeText(base({ message: { conversation: 'hi' } }), { selfJid: SELF })
    expect(out?.channelId).toBe('')
  })

  it('receiverId is empty string when absent from context', () => {
    const out = decodeText(base({ message: { conversation: 'hi' } }), { selfJid: SELF })
    expect(out?.receiverId).toBe('')
  })

  it('isPrefix is false when prefixes absent from context', () => {
    const out = decodeText(base({ message: { conversation: '/start' } }), { selfJid: SELF })
    expect(out?.isPrefix).toBe(false)
  })

  it('roomName() resolves null when resolveRoomName absent', async () => {
    const out = decodeText(
      base({
        key: { remoteJid: GROUP, fromMe: false, id: 'GN', participant: '628333@s.whatsapp.net' },
        message: { conversation: 'hi' },
      }),
      { selfJid: SELF },
    )
    expect(out).not.toBeNull()
    await expect(out!.roomName()).resolves.toBeNull()
  })

  it('receiverName() resolves null when resolveReceiverName absent', async () => {
    const out = decodeText(base({ message: { conversation: 'hi' } }), { selfJid: SELF })
    await expect(out!.receiverName()).resolves.toBeNull()
  })
})

const mediaMsg = (field: string, body: Record<string, unknown>, over: Partial<WAMessage> = {}): WAMessage =>
  base({ message: { [field]: body }, ...over })

describe('decodeImage', () => {
  it('decodes image with mimetype and chatType:image', () => {
    const out = decodeImage(mediaMsg('imageMessage', { mimetype: 'image/jpeg', fileLength: 2048, caption: 'pic' }), ctx)
    expect(out?.chatType).toBe('image')
    expect(out?.text).toBe('pic')
    expect(out?.media).toBeDefined()
    expect(typeof out?.media?.buffer).toBe('function')
    expect(typeof out?.media?.stream).toBe('function')
    expect(out?.chatId).toBe('M1')
  })

  it('returns null without imageMessage', () => {
    expect(decodeImage(base({ message: { conversation: 'x' } }), ctx)).toBeNull()
    expect(decodeImage(base({ message: null }), ctx)).toBeNull()
  })

  it('media.buffer() lazy download resolves a Buffer', async () => {
    const out = decodeImage(mediaMsg('imageMessage', { mimetype: 'image/png' }), ctx)
    expect(out?.media).toBeDefined()
    const buf = await out!.media!.buffer()
    expect(buf).toBeInstanceOf(Buffer)
    expect(buf.byteLength).toBe(8)
  })

  it('media.stream() lazy download resolves a Readable', async () => {
    const { Readable } = await import('stream')
    const out = decodeImage(mediaMsg('imageMessage', { mimetype: 'image/png' }), ctx)
    expect(out?.media).toBeDefined()
    const stream = await out!.media!.stream()
    expect(stream).toBeInstanceOf(Readable)
  })

  it('does NOT call downloadMediaMessage during decode (lazy invariant)', async () => {
    const { downloadMediaMessage } = await import('baileys')
    const downloadSpy = vi.mocked(downloadMediaMessage)
    downloadSpy.mockClear()
    decodeImage(mediaMsg('imageMessage', { mimetype: 'image/jpeg' }), ctx)
    expect(downloadSpy).not.toHaveBeenCalled()
  })

  it('flags group context', () => {
    const out = decodeImage(
      mediaMsg('imageMessage', { mimetype: 'image/jpeg' }, { key: { remoteJid: GROUP, fromMe: false, id: 'I', participant: '628333@s.whatsapp.net' } }),
      ctx,
    )
    expect(out?.isGroup).toBe(true)
  })
})

describe('decodeVideo', () => {
  it('decodes video with chatType:video', () => {
    const out = decodeVideo(mediaMsg('videoMessage', { mimetype: 'video/mp4', fileLength: 99, caption: 'clip' }), ctx)
    expect(out?.chatType).toBe('video')
    expect(out?.text).toBe('clip')
    expect(out?.media).toBeDefined()
  })
  it('returns null without videoMessage', () => {
    expect(decodeVideo(base({ message: {} }), ctx)).toBeNull()
  })
  it('exposes media accessor', () => {
    expect(typeof decodeVideo(mediaMsg('videoMessage', { mimetype: 'video/mp4' }), ctx)?.media?.buffer).toBe('function')
  })
  it('returns null on null message', () => {
    expect(decodeVideo(base({ message: null }), ctx)).toBeNull()
  })
})

describe('decodeAudio', () => {
  it('decodes audio with chatType:audio', () => {
    const out = decodeAudio(mediaMsg('audioMessage', { mimetype: 'audio/ogg', ptt: true, fileLength: 12 }), ctx)
    expect(out?.chatType).toBe('audio')
    expect(out?.media).toBeDefined()
  })
  it('returns null without audioMessage', () => {
    expect(decodeAudio(base({ message: {} }), ctx)).toBeNull()
  })
  it('exposes media accessor', () => {
    expect(typeof decodeAudio(mediaMsg('audioMessage', { ptt: false }), ctx)?.media?.buffer).toBe('function')
  })
})

describe('decodeDocument', () => {
  it('decodes document with chatType:document', () => {
    const out = decodeDocument(mediaMsg('documentMessage', { mimetype: 'application/pdf', fileName: 'a.pdf', fileLength: 500 }), ctx)
    expect(out?.chatType).toBe('document')
    expect(out?.media).toBeDefined()
  })
  it('returns null without documentMessage', () => {
    expect(decodeDocument(base({ message: {} }), ctx)).toBeNull()
  })
  it('returns null on null message', () => {
    expect(decodeDocument(base({ message: null }), ctx)).toBeNull()
  })
})

describe('decodeSticker', () => {
  it('decodes sticker with chatType:sticker', () => {
    const out = decodeSticker(mediaMsg('stickerMessage', { mimetype: 'image/webp', fileLength: 30 }), ctx)
    expect(out?.chatType).toBe('sticker')
    expect(out?.media).toBeDefined()
  })
  it('returns null without stickerMessage', () => {
    expect(decodeSticker(base({ message: {} }), ctx)).toBeNull()
  })
  it('returns null on null message', () => {
    expect(decodeSticker(base({ message: null }), ctx)).toBeNull()
  })
})

const mentionMsg = (mentionedJid: string[], over: Record<string, unknown> = {}): WAMessage =>
  base({
    key: { remoteJid: GROUP, fromMe: false, id: 'MN', participant: '628333@s.whatsapp.net' },
    message: { extendedTextMessage: { text: 'hey @you', contextInfo: { mentionedJid, ...over } } },
  })

describe('decodeMention', () => {
  it('decodes when self is mentioned in group', () => {
    const out = decodeMention(mentionMsg([SELF, '628999@s.whatsapp.net']), ctx)
    expect(out).not.toBeNull()
    expect(out?.selfJid).toBe(SELF)
    expect(out?.mentionedJids).toContain(SELF)
    expect(out?.content).toBe('hey @you')
  })

  it('returns null when self not mentioned', () => {
    expect(decodeMention(mentionMsg(['628999@s.whatsapp.net']), ctx)).toBeNull()
  })

  it('normalizes device suffix when matching self', () => {
    const out = decodeMention(mentionMsg(['628111:5@s.whatsapp.net']), ctx)
    expect(out).not.toBeNull()
  })

  it('returns null without contextInfo', () => {
    expect(decodeMention(base({ message: { extendedTextMessage: { text: 'x' } } }), ctx)).toBeNull()
  })

  it('returns null when message missing', () => {
    expect(decodeMention(base({ message: null }), ctx)).toBeNull()
  })
})

const mentionAllCtx = { groupMentions: [{ groupJid: GROUP, groupSubject: 'Team' }] }

describe('decodeMentionAll', () => {
  it('decodes a group-wide mention in a group', () => {
    const out = decodeMentionAll(
      base({
        key: { remoteJid: GROUP, fromMe: false, id: 'MA', participant: '628333@s.whatsapp.net' },
        message: { extendedTextMessage: { text: '@everyone', contextInfo: mentionAllCtx } },
      }),
      ctx,
    )
    expect(out).not.toBeNull()
    expect(out?.isMentionAll).toBe(true)
    expect(out?.selfJid).toBe(SELF)
  })

  it('returns null for a group-wide mention in a 1:1 chat', () => {
    const out = decodeMentionAll(
      base({ message: { extendedTextMessage: { text: '@everyone', contextInfo: mentionAllCtx } } }),
      ctx,
    )
    expect(out).toBeNull()
  })

  it('returns null without contextInfo', () => {
    const out = decodeMentionAll(
      base({ key: { remoteJid: GROUP, fromMe: false, id: 'N', participant: '628333@s.whatsapp.net' }, message: { conversation: 'x' } }),
      ctx,
    )
    expect(out).toBeNull()
  })

  it('returns null when groupMentions are absent', () => {
    const out = decodeMentionAll(
      base({
        key: { remoteJid: GROUP, fromMe: false, id: 'N2', participant: '628333@s.whatsapp.net' },
        message: { extendedTextMessage: { text: 'x', contextInfo: { mentionedJid: [] } } },
      }),
      ctx,
    )
    expect(out).toBeNull()
  })

  it('returns null when message missing', () => {
    expect(decodeMentionAll(base({ message: null }), ctx)).toBeNull()
  })
})
