import type { WAMessage, WAMessageKey } from 'baileys'
import { afterEach, describe, expect, it, vi } from 'vitest'

const loadMediaMock = vi.fn<[unknown], Promise<{ buffer: Buffer; mime: string; size: number }>>()
const toOpusMock = vi.fn<[], Promise<Buffer>>()
const stickerCreateMock = vi.fn<[unknown?], Promise<Buffer>>()

vi.mock('../../src/builder/media-loader.js', () => ({
  loadMedia: (src: unknown) => loadMediaMock(src),
  detectMimeFromBuffer: async () => 'image/jpeg',
}))

vi.mock('../../src/media/index.js', () => ({
  Media: vi.fn(function (this: Record<string, unknown>, input: unknown) {
    this.__input = input
    this.audio = { toOpus: () => toOpusMock() }
    this.sticker = { create: (meta?: unknown) => stickerCreateMock(meta) }
  }),
}))

import { type BuilderSocketLike, MessageBuilder } from '../../src/builder/builder.js'
import { deleteMessage, forwardMessage, reactToMessage } from '../../src/builder/mutations.js'
import { EditBuilder } from '../../src/builder/edit-builder.js'

const imgBuf = Buffer.from([0xff, 0xd8, 0xff, 0xe0])
const vidBuf = Buffer.from('VID')
const audBuf = Buffer.from('AUD')
const stkBuf = Buffer.from('STK')

const setupMedia = () => {
  loadMediaMock.mockImplementation(async (src: unknown) => {
    const tag = String(src)
    if (tag.includes('vid')) return { buffer: vidBuf, mime: 'video/mp4', size: vidBuf.length }
    if (tag.includes('aud')) return { buffer: audBuf, mime: 'audio/ogg', size: audBuf.length }
    if (tag.includes('stk')) return { buffer: stkBuf, mime: 'image/webp', size: stkBuf.length }
    return { buffer: imgBuf, mime: 'image/jpeg', size: imgBuf.length }
  })
  toOpusMock.mockResolvedValue(Buffer.from('OPUS'))
  stickerCreateMock.mockResolvedValue(Buffer.from('WEBP'))
}

type Call = { jid: string; content: Record<string, unknown>; options: Record<string, unknown> }

const makeSocket = () => {
  const calls: Call[] = []
  let n = 0
  const socket: BuilderSocketLike & { lastCall: () => Call | undefined } = {
    sendMessage: async (jid, content, options) => {
      n += 1
      calls.push({
        jid,
        content: content as unknown as Record<string, unknown>,
        options: (options ?? {}) as Record<string, unknown>,
      })
      return { key: { id: `sc-${n}`, remoteJid: jid, fromMe: true } } as unknown as WAMessage
    },
    lastCall: () => calls[calls.length - 1],
  }
  return { socket, calls }
}

const RECIPIENT = '1@s.whatsapp.net'
const QUOTED: WAMessageKey = { id: 'Q1', remoteJid: 'r@s.whatsapp.net', fromMe: false }

afterEach(() => {
  vi.clearAllMocks()
})

describe('[SC-1] chain text+reply+mentions returns key, type-safe', () => {
  it('[SC-1] resolves to the sent WAMessageKey', async () => {
    const { socket } = makeSocket()
    const key = await MessageBuilder.create(socket, RECIPIENT)
      .text('hi')
      .reply(QUOTED)
      .mentions(['x@s.whatsapp.net'])
    expect(key.id).toBe('sc-1')
    expect(key.remoteJid).toBe(RECIPIENT)
    expect(key.fromMe).toBe(true)
  })

  it('[SC-1] dispatches text content with mentions and quoted option', async () => {
    const { socket, calls } = makeSocket()
    await MessageBuilder.create(socket, RECIPIENT)
      .text('hi')
      .reply(QUOTED)
      .mentions(['x@s.whatsapp.net'])
    const last = calls[calls.length - 1]!
    expect(last.jid).toBe(RECIPIENT)
    expect(last.content.text).toBe('hi')
    expect(last.content.mentions).toEqual(['x@s.whatsapp.net'])
    expect(last.options.quoted).toEqual(QUOTED)
  })

  it('[SC-1] merges mentions across multiple calls', async () => {
    const { socket, calls } = makeSocket()
    await MessageBuilder.create(socket, RECIPIENT)
      .text('hi')
      .mentions(['a@s.whatsapp.net'])
      .mentions(['b@s.whatsapp.net'])
    expect(calls[0]!.content.mentions).toEqual(['a@s.whatsapp.net', 'b@s.whatsapp.net'])
  })
})

describe('[SC-2] media uniform sources + PTT + sticker WebP', () => {
  it('[SC-2] accepts a string path source for .image', async () => {
    setupMedia()
    const { socket, calls } = makeSocket()
    await MessageBuilder.create(socket, RECIPIENT).image('./img-path.jpg')
    expect(Buffer.isBuffer(calls[0]!.content.image)).toBe(true)
    expect(loadMediaMock).toHaveBeenCalledWith('./img-path.jpg')
  })

  it('[SC-2] accepts a Buffer source for .image', async () => {
    setupMedia()
    const { socket, calls } = makeSocket()
    const raw = Buffer.from('RAW')
    await MessageBuilder.create(socket, RECIPIENT).image(raw)
    expect(Buffer.isBuffer(calls[0]!.content.image)).toBe(true)
    expect(loadMediaMock).toHaveBeenCalledWith(raw)
  })

  it('[SC-2] accepts a URL instance source for .image', async () => {
    setupMedia()
    const { socket, calls } = makeSocket()
    const url = new URL('https://cdn.example/img.jpg')
    await MessageBuilder.create(socket, RECIPIENT).image(url)
    expect(Buffer.isBuffer(calls[0]!.content.image)).toBe(true)
    expect(loadMediaMock).toHaveBeenCalledWith(url)
  })

  it('[SC-2] .audio(src, {ptt:true}) emits a voice note', async () => {
    setupMedia()
    const { socket, calls } = makeSocket()
    await MessageBuilder.create(socket, RECIPIENT).audio('./aud.ogg', { ptt: true })
    expect(calls[0]!.content.ptt).toBe(true)
    expect(Buffer.isBuffer(calls[0]!.content.audio)).toBe(true)
  })

  it('[SC-2] .sticker(src, {animated:true}) emits animated WebP', async () => {
    setupMedia()
    const { socket, calls } = makeSocket()
    await MessageBuilder.create(socket, RECIPIENT).sticker('./stk.webp', { animated: true })
    expect(Buffer.isBuffer(calls[0]!.content.sticker)).toBe(true)
    expect(calls[0]!.content.isAnimated).toBe(true)
  })
})

describe('[SC-3] album rc11+ albumParentKey', () => {
  it('[SC-3] sends parent then one child per item', async () => {
    setupMedia()
    const { socket, calls } = makeSocket()
    await MessageBuilder.create(socket, RECIPIENT).album([
      { type: 'image', src: 'img-0' },
      { type: 'image', src: 'img-1' },
      { type: 'video', src: 'vid-2' },
    ])
    expect(calls).toHaveLength(4)
    expect('album' in calls[0]!.content).toBe(true)
  })

  it('[SC-3] propagates parent key as albumParentKey on each child', async () => {
    setupMedia()
    const { socket, calls } = makeSocket()
    await MessageBuilder.create(socket, RECIPIENT).album([
      { type: 'image', src: 'img-0' },
      { type: 'image', src: 'img-1' },
      { type: 'video', src: 'vid-2' },
    ])
    const parentKey = { id: 'sc-1', remoteJid: RECIPIENT, fromMe: true }
    for (const child of calls.slice(1)) {
      expect(child.content.albumParentKey).toEqual(parentKey)
    }
  })

  it('[SC-3] returns the parent key from the terminal', async () => {
    setupMedia()
    const { socket } = makeSocket()
    const key = await MessageBuilder.create(socket, RECIPIENT).album([
      { type: 'image', src: 'img-0' },
      { type: 'image', src: 'img-1' },
    ])
    expect(key.id).toBe('sc-1')
  })
})

describe('[SC-4] interactive typed IDs roundtrip', () => {
  it('[SC-4] .buttons preserves the developer-supplied button id', async () => {
    const { socket, calls } = makeSocket()
    await MessageBuilder.create(socket, RECIPIENT).buttons([{ id: 'btn-1', text: 'Yes' }])
    const tpl = calls[0]!.content.templateButtons as Array<{
      quickReplyButton: { id: string }
    }>
    expect(tpl[0]!.quickReplyButton.id).toBe('btn-1')
  })

  it('[SC-4] .list preserves the developer-supplied row id', async () => {
    const { socket, calls } = makeSocket()
    await MessageBuilder.create(socket, RECIPIENT).list({
      buttonText: 'Open',
      sections: [{ title: 'S', rows: [{ id: 'row-9', title: 'Pick me' }] }],
    })
    const sections = calls[0]!.content.sections as Array<{ rows: Array<{ rowId: string }> }>
    expect(sections[0]!.rows[0]!.rowId).toBe('row-9')
  })

  it('[SC-4] .poll preserves the developer-supplied option values', async () => {
    const { socket, calls } = makeSocket()
    await MessageBuilder.create(socket, RECIPIENT).poll('Q', ['a', 'b'])
    const poll = calls[0]!.content.poll as { name: string; values: string[] }
    expect(poll.name).toBe('Q')
    expect(poll.values).toEqual(['a', 'b'])
  })
})

describe('[SC-5] mutations without re-fetch', () => {
  it('[SC-5] edit sends edit content keyed to the original message', async () => {
    const { socket, calls } = makeSocket()
    const key: WAMessageKey = { id: 'E1', remoteJid: RECIPIENT, fromMe: true }
    await new EditBuilder(socket, key).text('updated')
    expect(calls[0]!.content.text).toBe('updated')
    expect(calls[0]!.content.edit).toEqual(key)
  })

  it('[SC-5] delete sends a revoke without any store or socket fetch', async () => {
    const { socket, calls } = makeSocket()
    const key: WAMessageKey = { id: 'D1', remoteJid: RECIPIENT, fromMe: true }
    await deleteMessage(socket, key, { forEveryone: true })
    expect(calls[0]!.content.delete).toEqual(key)
    expect(calls).toHaveLength(1)
  })

  it('[SC-5] react sends the emoji keyed to the message', async () => {
    const { socket, calls } = makeSocket()
    const key: WAMessageKey = { id: 'R1', remoteJid: RECIPIENT, fromMe: false }
    await reactToMessage(socket, key, '👍')
    expect(calls[0]!.content.react).toEqual({ text: '👍', key })
  })

  it('[SC-5] forward reads source from store exactly once, no socket re-fetch', async () => {
    const { socket, calls } = makeSocket()
    const key: WAMessageKey = { id: 'F1', remoteJid: RECIPIENT, fromMe: false }
    const source = { key, message: { conversation: 'hello' } } as WAMessage
    const getMessage = vi.fn(async () => source)
    const loadMessage = vi.fn(async () => source)
    const store = { getMessage }
    await forwardMessage(socket, store, key, '2@s.whatsapp.net')
    expect(getMessage).toHaveBeenCalledTimes(1)
    expect(loadMessage).not.toHaveBeenCalled()
    expect(calls[0]!.content.forward).toEqual(source)
    expect(calls).toHaveLength(1)
  })
})
