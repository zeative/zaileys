import type { WAMessage } from 'baileys'
import { describe, expect, it, vi } from 'vitest'

vi.mock('baileys', async (importOriginal) => {
  const actual = await importOriginal<typeof import('baileys')>()
  return { ...actual, downloadMediaMessage: vi.fn().mockResolvedValue(Buffer.alloc(8)) }
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
    expect(out?.content).toBe('hello')
    expect(out?.fromMe).toBe(false)
    expect(out?.isGroup).toBe(false)
    expect(out?.sender.jid).toBe('628222@s.whatsapp.net')
    expect(out?.key.id).toBe('M1')
    expect(out?.key.remoteJid).toBe('628222@s.whatsapp.net')
  })

  it('decodes an extendedTextMessage', () => {
    const out = decodeText(base({ message: { extendedTextMessage: { text: 'world' } } }), ctx)
    expect(out?.content).toBe('world')
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
    expect(out?.content).toBe('tes')
    expect(out?.isGroup).toBe(false)
    expect(out?.jid).toBe('123918899749051@lid')
    expect(out?.sender.jid).toBe('123918899749051@lid')
    expect(out?.sender.lid).toBe('6285136635787@s.whatsapp.net')
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
    expect(out?.jid).toBe(GROUP)
    expect(out?.sender.jid).toBe('628333@s.whatsapp.net')
    expect(out?.key.remoteJid).toBe(GROUP)
  })

  it('attaches quoted reference when present', () => {
    const out = decodeText(
      base({
        message: {
          extendedTextMessage: {
            text: 're',
            contextInfo: { stanzaId: 'Q1', participant: '628444@s.whatsapp.net' },
          },
        },
      }),
      ctx,
    )
    expect(out?.quoted?.key.id).toBe('Q1')
  })

  it('honours fromMe', () => {
    const out = decodeText(
      base({ key: { remoteJid: '628222@s.whatsapp.net', fromMe: true, id: 'X' }, message: { conversation: 'me' } }),
      ctx,
    )
    expect(out?.fromMe).toBe(true)
  })
})

const mediaMsg = (field: string, body: Record<string, unknown>, over: Partial<WAMessage> = {}): WAMessage =>
  base({ message: { [field]: body }, ...over })

describe('decodeImage', () => {
  it('decodes image with mimetype, size, caption', () => {
    const out = decodeImage(mediaMsg('imageMessage', { mimetype: 'image/jpeg', fileLength: 2048, caption: 'pic' }), ctx)
    expect(out?.kind).toBe('image')
    expect(out?.media.mimetype).toBe('image/jpeg')
    expect(out?.media.size).toBe(2048)
    expect(out?.media.caption).toBe('pic')
    expect(typeof out?.download).toBe('function')
    expect(out?.key.id).toBe('M1')
  })

  it('returns null without imageMessage', () => {
    expect(decodeImage(base({ message: { conversation: 'x' } }), ctx)).toBeNull()
    expect(decodeImage(base({ message: null }), ctx)).toBeNull()
  })

  it('falls back to octet-stream mimetype', () => {
    const out = decodeImage(mediaMsg('imageMessage', {}), ctx)
    expect(out?.media.mimetype).toBe('application/octet-stream')
  })

  it('resolves download to buffer/mime/size', async () => {
    const out = decodeImage(mediaMsg('imageMessage', { mimetype: 'image/png' }), ctx)
    const dl = await out?.download()
    expect(dl?.mime).toBe('image/png')
    expect(dl?.size).toBe(8)
  })

  it('omits caption when absent', () => {
    const out = decodeImage(mediaMsg('imageMessage', { mimetype: 'image/webp' }), ctx)
    expect(out?.media.caption).toBeUndefined()
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
  it('decodes video with caption', () => {
    const out = decodeVideo(mediaMsg('videoMessage', { mimetype: 'video/mp4', fileLength: 99, caption: 'clip' }), ctx)
    expect(out?.kind).toBe('video')
    expect(out?.media.mimetype).toBe('video/mp4')
    expect(out?.media.caption).toBe('clip')
  })
  it('returns null without videoMessage', () => {
    expect(decodeVideo(base({ message: {} }), ctx)).toBeNull()
  })
  it('falls back mimetype', () => {
    expect(decodeVideo(mediaMsg('videoMessage', {}), ctx)?.media.mimetype).toBe('application/octet-stream')
  })
  it('exposes download', () => {
    expect(typeof decodeVideo(mediaMsg('videoMessage', { mimetype: 'video/mp4' }), ctx)?.download).toBe('function')
  })
  it('returns null on null message', () => {
    expect(decodeVideo(base({ message: null }), ctx)).toBeNull()
  })
})

describe('decodeAudio', () => {
  it('decodes audio and sets ptt', () => {
    const out = decodeAudio(mediaMsg('audioMessage', { mimetype: 'audio/ogg', ptt: true, fileLength: 12 }), ctx)
    expect(out?.kind).toBe('audio')
    expect(out?.media.ptt).toBe(true)
    expect(out?.media.size).toBe(12)
  })
  it('defaults ptt false when absent', () => {
    expect(decodeAudio(mediaMsg('audioMessage', { mimetype: 'audio/mp4' }), ctx)?.media.ptt).toBe(false)
  })
  it('returns null without audioMessage', () => {
    expect(decodeAudio(base({ message: {} }), ctx)).toBeNull()
  })
  it('falls back mimetype', () => {
    expect(decodeAudio(mediaMsg('audioMessage', {}), ctx)?.media.mimetype).toBe('application/octet-stream')
  })
  it('exposes download', () => {
    expect(typeof decodeAudio(mediaMsg('audioMessage', { ptt: false }), ctx)?.download).toBe('function')
  })
})

describe('decodeDocument', () => {
  it('decodes document with fileName', () => {
    const out = decodeDocument(mediaMsg('documentMessage', { mimetype: 'application/pdf', fileName: 'a.pdf', fileLength: 500 }), ctx)
    expect(out?.kind).toBe('document')
    expect(out?.media.fileName).toBe('a.pdf')
    expect(out?.media.size).toBe(500)
  })
  it('returns null without documentMessage', () => {
    expect(decodeDocument(base({ message: {} }), ctx)).toBeNull()
  })
  it('omits fileName when absent', () => {
    expect(decodeDocument(mediaMsg('documentMessage', { mimetype: 'application/zip' }), ctx)?.media.fileName).toBeUndefined()
  })
  it('falls back mimetype', () => {
    expect(decodeDocument(mediaMsg('documentMessage', {}), ctx)?.media.mimetype).toBe('application/octet-stream')
  })
  it('returns null on null message', () => {
    expect(decodeDocument(base({ message: null }), ctx)).toBeNull()
  })
})

describe('decodeSticker', () => {
  it('decodes sticker', () => {
    const out = decodeSticker(mediaMsg('stickerMessage', { mimetype: 'image/webp', fileLength: 30 }), ctx)
    expect(out?.kind).toBe('sticker')
    expect(out?.media.mimetype).toBe('image/webp')
  })
  it('returns null without stickerMessage', () => {
    expect(decodeSticker(base({ message: {} }), ctx)).toBeNull()
  })
  it('falls back mimetype', () => {
    expect(decodeSticker(mediaMsg('stickerMessage', {}), ctx)?.media.mimetype).toBe('application/octet-stream')
  })
  it('exposes download', () => {
    expect(typeof decodeSticker(mediaMsg('stickerMessage', { mimetype: 'image/webp' }), ctx)?.download).toBe('function')
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
