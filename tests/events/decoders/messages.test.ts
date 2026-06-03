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

  it('routes ctx.reply through the injected reply callback (target, content, opts, quoted)', async () => {
    const reply = vi.fn(async () => ({ id: 'SENT' }))
    const msg = base({ message: { conversation: 'hi' } })
    const out = decodeText(msg, { selfJid: SELF, reply } as never)
    await out!.reply('balasan', { rich: true })
    expect(reply).toHaveBeenCalledWith('628222@s.whatsapp.net', 'balasan', { rich: true }, msg)
  })

  it('routes ctx.react through the injected react callback (key, emoji)', async () => {
    const react = vi.fn(async () => ({ id: 'R' }))
    const msg = base({ message: { conversation: 'hi' } })
    const out = decodeText(msg, { selfJid: SELF, react } as never)
    await out!.react('👍')
    expect(react).toHaveBeenCalledWith(msg.key, '👍')
  })

  it('rejects ctx.reply when no client is bound', async () => {
    const out = decodeText(base({ message: { conversation: 'hi' } }), ctx)
    await expect(out!.reply('x')).rejects.toThrow(/connected client/)
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
    expect(out?.senderId).toBe('6285136635787@s.whatsapp.net')
    expect(out?.senderLid).toBe('123918899749051@lid')
  })

  it('puts the PN in senderId and the @lid in senderLid for a group participant (not inverted)', () => {
    const out = decodeText(
      base({
        key: {
          remoteJid: GROUP,
          fromMe: false,
          id: 'GP',
          participant: '272111@lid',
          participantAlt: '628444@s.whatsapp.net',
        } as unknown as WAMessage['key'],
        message: { conversation: 'hi' },
      }),
      ctx,
    )
    expect(out?.isGroup).toBe(true)
    expect(out?.senderId).toBe('628444@s.whatsapp.net')
    expect(out?.senderLid).toBe('272111@lid')
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

describe('Task 1b — media-aware contextInfo behaviors (BLOCKER 2)', () => {
  it('IMAGE with isForwarded in imageMessage.contextInfo surfaces isForwarded:true', () => {
    const out = decodeImage(
      mediaMsg('imageMessage', {
        mimetype: 'image/jpeg',
        contextInfo: { isForwarded: true },
      }),
      ctx,
    )
    expect(out?.isForwarded).toBe(true)
  })

  it('IMAGE with extendedText absent but imageMessage.contextInfo.isForwarded:true surfaces isForwarded:true', () => {
    const out = decodeImage(
      mediaMsg('imageMessage', {
        mimetype: 'image/jpeg',
        contextInfo: { forwardingScore: 5 },
      }),
      ctx,
    )
    expect(out?.isForwarded).toBe(true)
  })

  it('IMAGE with imageMessage.contextInfo.stanzaId + quotedMessage => replied() resolves a nested MessageContext', async () => {
    const out = decodeImage(
      mediaMsg('imageMessage', {
        mimetype: 'image/jpeg',
        contextInfo: {
          stanzaId: 'Q2',
          participant: '628444@s.whatsapp.net',
          remoteJid: '628444@s.whatsapp.net',
          quotedMessage: { conversation: 'what did you send?' },
        },
      }),
      ctx,
    )
    expect(out).not.toBeNull()
    const replied = await out!.replied()
    expect(replied).not.toBeNull()
    expect(replied?.text).toBe('what did you send?')
    expect(replied?.chatType).toBe('text')
  })

  it('text message with quoted text => replied() resolves a nested MessageContext', async () => {
    const out = decodeText(
      base({
        message: {
          extendedTextMessage: {
            text: 'yes',
            contextInfo: {
              stanzaId: 'Q3',
              participant: '628555@s.whatsapp.net',
              remoteJid: '628555@s.whatsapp.net',
              quotedMessage: { conversation: 'are you there?' },
            },
          },
        },
      }),
      ctx,
    )
    expect(out).not.toBeNull()
    const replied = await out!.replied()
    expect(replied).not.toBeNull()
    expect(replied?.text).toBe('are you there?')
  })

  it('no quote => replied() resolves null', async () => {
    const out = decodeText(base({ message: { conversation: 'hello' } }), ctx)
    await expect(out!.replied()).resolves.toBeNull()
  })

  it('replied() prefers the full original from resolveQuoted (real timestamp + senderName)', async () => {
    const original = {
      key: { remoteJid: '628222@s.whatsapp.net', fromMe: false, id: 'ORIG1' },
      messageTimestamp: 1766000000,
      pushName: 'Origin Author',
      message: { conversation: 'original text' },
    } as unknown as WAMessage
    const resolveQuoted = vi.fn().mockResolvedValue(original)
    const out = decodeText(
      base({
        key: { remoteJid: '628222@s.whatsapp.net', fromMe: false, id: 'REPLY1' },
        message: {
          extendedTextMessage: {
            text: 'a reply',
            contextInfo: {
              stanzaId: 'ORIG1',
              participant: '628222@s.whatsapp.net',
              quotedMessage: { conversation: 'original text' },
            },
          },
        },
      }),
      { selfJid: SELF, resolveQuoted },
    )
    const replied = await out!.replied()
    expect(resolveQuoted).toHaveBeenCalledWith('ORIG1', '628222@s.whatsapp.net')
    expect(replied).not.toBeNull()
    expect(replied?.text).toBe('original text')
    expect(replied?.timestamp).toBe(1766000000 * 1000)
    expect(replied?.senderName).toBe('Origin Author')
  })

  it('replied() falls back to contextInfo reconstruction when resolveQuoted returns null', async () => {
    const resolveQuoted = vi.fn().mockResolvedValue(null)
    const out = decodeText(
      base({
        message: {
          extendedTextMessage: {
            text: 'reply',
            contextInfo: {
              stanzaId: 'Q9',
              participant: '628222@s.whatsapp.net',
              remoteJid: '628222@s.whatsapp.net',
              quotedMessage: { conversation: 'quoted body' },
            },
          },
        },
      }),
      { selfJid: SELF, resolveQuoted },
    )
    const replied = await out!.replied()
    expect(resolveQuoted).toHaveBeenCalled()
    expect(replied).not.toBeNull()
    expect(replied?.text).toBe('quoted body')
  })

  it('WARNING-7: quotedMessage present but stanzaId missing => replied() resolves null without throwing', async () => {
    const out = decodeText(
      base({
        message: {
          extendedTextMessage: {
            text: 'reply',
            contextInfo: {
              quotedMessage: { conversation: 'incomplete quote' },
            },
          },
        },
      }),
      ctx,
    )
    expect(out).not.toBeNull()
    await expect(out!.replied()).resolves.toBeNull()
  })

  it('BLOCKER-1: no-resolver context => citation.banned() resolves false without throwing', async () => {
    const out = decodeText(base({ message: { conversation: 'hi' } }), { selfJid: SELF })
    expect(out).not.toBeNull()
    await expect(out!.citation.banned()).resolves.toBe(false)
    await expect(out!.citation.authors()).resolves.toBe(false)
  })

  it('BLOCKER-1: no-resolver context => replied() resolves null without throwing', async () => {
    const out = decodeText(base({ message: { conversation: 'hi' } }), { selfJid: SELF })
    expect(out).not.toBeNull()
    await expect(out!.replied()).resolves.toBeNull()
  })

  it('LID DM with empty participant still resolves senderId (no extractSender regression)', () => {
    const out = decodeText(
      base({
        key: {
          remoteJid: '123918899749051@lid',
          remoteJidAlt: '6285136635787@s.whatsapp.net',
          fromMe: false,
          id: 'L2',
          participant: '',
          addressingMode: 'lid',
        } as unknown as WAMessage['key'],
        message: { conversation: 'lid test' },
      }),
      ctx,
    )
    expect(out).not.toBeNull()
    expect(out?.senderId).toBe('6285136635787@s.whatsapp.net')
    expect(out?.senderLid).toBe('123918899749051@lid')
  })
})

const mentionMsg = (mentionedJid: string[], over: Record<string, unknown> = {}): WAMessage =>
  base({
    key: { remoteJid: GROUP, fromMe: false, id: 'MN', participant: '628333@s.whatsapp.net' },
    message: { extendedTextMessage: { text: 'hey @you', contextInfo: { mentionedJid, ...over } } },
  })

describe('decodeMention (Task 1b — MentionContext)', () => {
  it('decodes when self is mentioned in group — emits MentionContext', () => {
    const out = decodeMention(mentionMsg([SELF, '628999@s.whatsapp.net']), ctx)
    expect(out).not.toBeNull()
    expect(out?.selfJid).toBe(SELF)
    expect(out?.mentionedJids).toContain(SELF)
    expect(out?.text).toBe('hey @you')
    expect(out?.chatType).toBe('text')
    expect(out?.isGroup).toBe(true)
    expect(typeof out?.roomName).toBe('function')
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

describe('decodeMentionAll (Task 1b — MentionAllContext)', () => {
  it('decodes a group-wide mention in a group — emits MentionAllContext', () => {
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
    expect(out?.isGroup).toBe(true)
    expect(out?.chatType).toBe('text')
    expect(typeof out?.roomName).toBe('function')
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

describe('replied() to rich / interactive bubbles', () => {
  const withQuote = (quotedMessage: unknown, participant: string): WAMessage =>
    base({
      key: { remoteJid: '628222@s.whatsapp.net', fromMe: false, id: 'R1' },
      message: {
        extendedTextMessage: {
          text: 'clear',
          contextInfo: {
            stanzaId: 'Q1',
            participant,
            remoteJid: '628222@s.whatsapp.net',
            quotedMessage,
          },
        },
      },
    } as Partial<WAMessage>)

  it('extracts text from a quoted AIRich (richResponseMessage) bubble', async () => {
    const quoted = {
      botForwardedMessage: {
        message: {
          richResponseMessage: {
            submessages: [
              { messageType: 2, messageText: 'nih link docs resminya kak:' },
              { messageType: 2, messageText: 'kalau mau, bisa kirim link skill juga.' },
            ],
          },
        },
      },
    }
    const out = decodeText(withQuote(quoted, SELF), ctx)
    const replied = await out?.replied()
    expect(replied?.text).toBe('nih link docs resminya kak:\nkalau mau, bisa kirim link skill juga.')
  })

  it('marks isFromMe=true when the quoted bubble was authored by self', async () => {
    const quoted = { botForwardedMessage: { message: { richResponseMessage: { submessages: [{ messageText: 'hi' }] } } } }
    const out = decodeText(withQuote(quoted, SELF), ctx)
    const replied = await out?.replied()
    expect(replied?.isFromMe).toBe(true)
  })

  it('keeps isFromMe=false when the quoted bubble was authored by someone else', async () => {
    const quoted = { conversation: 'orang lain' }
    const out = decodeText(withQuote(quoted, '628999@s.whatsapp.net'), ctx)
    const replied = await out?.replied()
    expect(replied?.isFromMe).toBe(false)
    expect(replied?.text).toBe('orang lain')
  })

  it('extracts body text from a quoted interactiveMessage (buttons/carousel)', async () => {
    const quoted = { interactiveMessage: { body: { text: 'pilih salah satu ya' } } }
    const out = decodeText(withQuote(quoted, SELF), ctx)
    const replied = await out?.replied()
    expect(replied?.text).toBe('pilih salah satu ya')
  })
})

describe('comprehensive text in payload (main + replied + viewOnce)', () => {
  const quotedBy = (quotedMessage: unknown, participant = SELF): WAMessage =>
    base({
      key: { remoteJid: '628222@s.whatsapp.net', fromMe: false, id: 'RX' },
      message: {
        extendedTextMessage: {
          text: 'q',
          contextInfo: { stanzaId: 'QX', participant, remoteJid: '628222@s.whatsapp.net', quotedMessage },
        },
      },
    } as Partial<WAMessage>)

  it('main: poll -> text event with poll name', () => {
    const out = decodeText(base({ message: { pollCreationMessage: { name: 'Makan apa?' } } }), ctx)
    expect(out?.text).toBe('Makan apa?')
  })

  it('main: location -> text event with name/address', () => {
    const out = decodeText(base({ message: { locationMessage: { name: 'Monas', address: 'Jakarta Pusat' } } }), ctx)
    expect(out?.text).toBe('Monas — Jakarta Pusat')
  })

  it('main: contact -> text event with display name', () => {
    const out = decodeText(base({ message: { contactMessage: { displayName: 'Budi' } } }), ctx)
    expect(out?.text).toBe('Budi')
  })

  it('main: document/image with caption does NOT double-emit as text (own decoder handles it)', () => {
    expect(decodeText(base({ message: { documentMessage: { caption: 'laporan', fileName: 'a.pdf' } } }), ctx)).toBeNull()
    expect(decodeText(base({ message: { imageMessage: { caption: 'hai' } } }), ctx)).toBeNull()
  })

  it('replied: document caption + filename fallback', async () => {
    const withCap = await decodeText(quotedBy({ documentMessage: { caption: 'laporan q3' } }), ctx)?.replied()
    expect(withCap?.text).toBe('laporan q3')
    const noCapName = await decodeText(quotedBy({ documentMessage: { fileName: 'invoice.pdf' } }), ctx)?.replied()
    expect(noCapName?.text).toBe('invoice.pdf')
  })

  it('replied: poll / location / contact', async () => {
    expect((await decodeText(quotedBy({ pollCreationMessage: { name: 'Voting' } }), ctx)?.replied())?.text).toBe('Voting')
    expect((await decodeText(quotedBy({ locationMessage: { name: 'Kantor' } }), ctx)?.replied())?.text).toBe('Kantor')
    expect((await decodeText(quotedBy({ contactMessage: { displayName: 'Sari' } }), ctx)?.replied())?.text).toBe('Sari')
  })

  it('replied: viewOnce-wrapped image caption is unwrapped', async () => {
    const quoted = { viewOnceMessageV2: { message: { imageMessage: { caption: 'rahasia' } } } }
    const out = await decodeText(quotedBy(quoted), ctx)?.replied()
    expect(out?.text).toBe('rahasia')
  })
})

describe('button responses in payload', () => {
  const quotedBy = (quotedMessage: unknown): WAMessage =>
    base({
      key: { remoteJid: '628222@s.whatsapp.net', fromMe: false, id: 'BR' },
      message: {
        extendedTextMessage: {
          text: 'q',
          contextInfo: { stanzaId: 'BRQ', participant: '628999@s.whatsapp.net', remoteJid: '628222@s.whatsapp.net', quotedMessage },
        },
      },
    } as Partial<WAMessage>)

  it('replied: buttons response -> selectedDisplayText', async () => {
    const out = await decodeText(quotedBy({ buttonsResponseMessage: { selectedButtonId: 'yes', selectedDisplayText: 'Ya, lanjut' } }), ctx)?.replied()
    expect(out?.text).toBe('Ya, lanjut')
  })

  it('replied: list response -> title', async () => {
    const out = await decodeText(quotedBy({ listResponseMessage: { title: 'Pizza', singleSelectReply: { selectedRowId: 'pizza' } } }), ctx)?.replied()
    expect(out?.text).toBe('Pizza')
  })

  it('replied: template button reply -> selectedDisplayText', async () => {
    const out = await decodeText(quotedBy({ templateButtonReplyMessage: { selectedId: 't1', selectedDisplayText: 'Action 1' } }), ctx)?.replied()
    expect(out?.text).toBe('Action 1')
  })

  it('main: button response does NOT emit as text (button-click decoder handles it)', () => {
    expect(decodeText(base({ message: { buttonsResponseMessage: { selectedButtonId: 'yes', selectedDisplayText: 'Ya' } } }), ctx)).toBeNull()
    expect(decodeText(base({ message: { listResponseMessage: { title: 'Pizza', singleSelectReply: { selectedRowId: 'p' } } } }), ctx)).toBeNull()
  })
})
