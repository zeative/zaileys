import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const FIXTURE_DIR = join(process.cwd(), 'tests', '_fixtures', 'builder')
const JPEG_PATH = join(FIXTURE_DIR, 'sample.jpg')
const jpegBuffer = readFileSync(JPEG_PATH)

const pngBuffer = (() => {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  const ihdr = Buffer.from([0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52])
  return Buffer.concat([sig, ihdr, Buffer.alloc(48, 0)])
})()

const opusBuffer = Buffer.from('OPUS-TRANSCODED')
const webpBuffer = Buffer.from('WEBP-STICKER')

const toOpusMock = vi.fn<[], Promise<Buffer>>()
const stickerCreateMock = vi.fn<[unknown?], Promise<Buffer>>()

vi.mock('../../src/media/index.js', () => ({
  Media: vi.fn(function (this: Record<string, unknown>, input: unknown) {
    this.__input = input
    this.audio = { toOpus: () => toOpusMock() }
    this.sticker = { create: (meta?: unknown) => stickerCreateMock(meta) }
  }),
}))

import { Media } from '../../src/media/index.js'
import {
  type BuilderSocketLike,
  MessageBuilder,
} from '../../src/builder/builder.js'
import { ZaileysBuilderError } from '../../src/builder/errors.js'

const arrayBufOf = (buf: Buffer): ArrayBuffer =>
  buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer

const okResponse = (buf: Buffer) => ({
  ok: true,
  status: 200,
  arrayBuffer: () => Promise.resolve(arrayBufOf(buf)),
})

type Captured = {
  jid: string
  content: Record<string, unknown>
  options: Record<string, unknown>
}

const makeSocket = (): { socket: BuilderSocketLike; captured: () => Captured } => {
  let last: Captured | undefined
  const socket: BuilderSocketLike = {
    sendMessage: async (jid, content, options) => {
      last = {
        jid,
        content: content as unknown as Record<string, unknown>,
        options: (options ?? {}) as Record<string, unknown>,
      }
      return { key: { id: 'MSG1', remoteJid: jid, fromMe: true } } as never
    },
  }
  return { socket, captured: () => last as Captured }
}

const RECIPIENT = '123@s.whatsapp.net'

beforeEach(() => {
  toOpusMock.mockResolvedValue(opusBuffer)
  stickerCreateMock.mockResolvedValue(webpBuffer)
})

afterEach(() => {
  vi.clearAllMocks()
  vi.unstubAllGlobals()
})

describe('image()', () => {
  it('sends image from a file path with caption', async () => {
    const { socket, captured } = makeSocket()
    await MessageBuilder.create(socket, RECIPIENT).image(JPEG_PATH, { caption: 'cap' })
    const { content } = captured()
    expect(Buffer.isBuffer(content.image)).toBe(true)
    expect((content.image as Buffer).equals(jpegBuffer)).toBe(true)
    expect(content.caption).toBe('cap')
  })

  it('sends image from a raw Buffer', async () => {
    const { socket, captured } = makeSocket()
    await MessageBuilder.create(socket, RECIPIENT).image(jpegBuffer)
    const { content } = captured()
    expect((content.image as Buffer).equals(jpegBuffer)).toBe(true)
  })

  it('sends image from an http URL via fetch', async () => {
    const fetchMock = vi.fn().mockResolvedValue(okResponse(pngBuffer))
    vi.stubGlobal('fetch', fetchMock)
    const { socket, captured } = makeSocket()
    await MessageBuilder.create(socket, RECIPIENT).image('https://example.com/x.png')
    expect(fetchMock).toHaveBeenCalledOnce()
    expect((captured().content.image as Buffer).equals(pngBuffer)).toBe(true)
  })

  it('omits caption when not provided', async () => {
    const { socket, captured } = makeSocket()
    await MessageBuilder.create(socket, RECIPIENT).image(jpegBuffer)
    expect(captured().content.caption).toBeUndefined()
  })

  it('propagates viewOnce', async () => {
    const { socket, captured } = makeSocket()
    await MessageBuilder.create(socket, RECIPIENT).image(jpegBuffer, { viewOnce: true })
    expect(captured().content.viewOnce).toBe(true)
  })

  it('merges mentions modifier', async () => {
    const { socket, captured } = makeSocket()
    await MessageBuilder.create(socket, RECIPIENT)
      .image(jpegBuffer)
      .mentions(['999@s.whatsapp.net'])
    expect(captured().content.mentions).toEqual(['999@s.whatsapp.net'])
  })

  it('merges reply modifier', async () => {
    const { socket, captured } = makeSocket()
    const quoted = { key: { id: 'Q1' } } as never
    await MessageBuilder.create(socket, RECIPIENT).image(jpegBuffer).reply(quoted)
    expect(captured().options.quoted).toBe(quoted)
  })

  it('merges disappearing modifier', async () => {
    const { socket, captured } = makeSocket()
    await MessageBuilder.create(socket, RECIPIENT).image(jpegBuffer).disappearing(60)
    expect(captured().options.ephemeralExpiration).toBe(60)
  })

  it('propagates MEDIA_LOAD_FAILED for a missing path', async () => {
    const { socket } = makeSocket()
    await expect(
      MessageBuilder.create(socket, RECIPIENT).image('/no-such-zaileys-img.jpg'),
    ).rejects.toMatchObject({ code: 'MEDIA_LOAD_FAILED' })
  })
})

describe('video()', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        arrayBuffer: () =>
          Promise.resolve(
            arrayBufOf(
              Buffer.concat([Buffer.from([0, 0, 0, 0x18]), Buffer.from('ftypmp42'), Buffer.alloc(16, 0)]),
            ),
          ),
      }),
    )
  })

  const mp4Buffer = Buffer.concat([
    Buffer.from([0, 0, 0, 0x18]),
    Buffer.from('ftypmp42'),
    Buffer.alloc(16, 0),
  ])

  it('sends video from Buffer with caption', async () => {
    const { socket, captured } = makeSocket()
    await MessageBuilder.create(socket, RECIPIENT).video(mp4Buffer, { caption: 'clip' })
    const { content } = captured()
    expect((content.video as Buffer).equals(mp4Buffer)).toBe(true)
    expect(content.caption).toBe('clip')
  })

  it('propagates gifPlayback option', async () => {
    const { socket, captured } = makeSocket()
    await MessageBuilder.create(socket, RECIPIENT).video(mp4Buffer, { gifPlayback: true })
    expect(captured().content.gifPlayback).toBe(true)
  })

  it('propagates viewOnce option', async () => {
    const { socket, captured } = makeSocket()
    await MessageBuilder.create(socket, RECIPIENT).video(mp4Buffer, { viewOnce: true })
    expect(captured().content.viewOnce).toBe(true)
  })

  it('loads video from an http URL', async () => {
    const { socket, captured } = makeSocket()
    await MessageBuilder.create(socket, RECIPIENT).video('https://example.com/x.mp4')
    expect((captured().content.video as Buffer).equals(mp4Buffer)).toBe(true)
  })

  it('throws INVALID_OPTIONS when source mime is not video', async () => {
    const { socket } = makeSocket()
    await expect(
      MessageBuilder.create(socket, RECIPIENT).video(jpegBuffer),
    ).rejects.toMatchObject({ code: 'INVALID_OPTIONS' })
  })

  it('composes mentions on a video', async () => {
    const { socket, captured } = makeSocket()
    await MessageBuilder.create(socket, RECIPIENT)
      .video(mp4Buffer)
      .mentions(['999@s.whatsapp.net'])
    expect(captured().content.mentions).toEqual(['999@s.whatsapp.net'])
  })
})

describe('document()', () => {
  const pdfBuffer = Buffer.concat([Buffer.from('%PDF-1.4\n'), Buffer.alloc(32, 0)])

  it('sends a document with fileName and explicit mimetype', async () => {
    const { socket, captured } = makeSocket()
    await MessageBuilder.create(socket, RECIPIENT).document(pdfBuffer, {
      fileName: 'report.pdf',
      mimetype: 'application/pdf',
    })
    const { content } = captured()
    expect((content.document as Buffer).equals(pdfBuffer)).toBe(true)
    expect(content.fileName).toBe('report.pdf')
    expect(content.mimetype).toBe('application/pdf')
  })

  it('auto-detects mimetype from buffer when omitted', async () => {
    const { socket, captured } = makeSocket()
    await MessageBuilder.create(socket, RECIPIENT).document(pdfBuffer, { fileName: 'report.pdf' })
    expect(captured().content.mimetype).toBe('application/pdf')
  })

  it('propagates caption', async () => {
    const { socket, captured } = makeSocket()
    await MessageBuilder.create(socket, RECIPIENT).document(pdfBuffer, {
      fileName: 'r.pdf',
      caption: 'see attached',
    })
    expect(captured().content.caption).toBe('see attached')
  })

  it('throws INVALID_OPTIONS for an empty fileName', async () => {
    const { socket } = makeSocket()
    await expect(
      MessageBuilder.create(socket, RECIPIENT).document(pdfBuffer, { fileName: '  ' }),
    ).rejects.toMatchObject({ code: 'INVALID_OPTIONS' })
  })

  it('loads a document from a file path', async () => {
    const { socket, captured } = makeSocket()
    await MessageBuilder.create(socket, RECIPIENT).document(JPEG_PATH, { fileName: 'pic.jpg' })
    expect((captured().content.document as Buffer).equals(jpegBuffer)).toBe(true)
  })

  it('falls back to octet-stream for undetectable bytes', async () => {
    const { socket, captured } = makeSocket()
    const raw = Buffer.from('plain text not a known type')
    await MessageBuilder.create(socket, RECIPIENT).document(raw, { fileName: 'x.bin' })
    expect(captured().content.mimetype).toBe('application/octet-stream')
  })
})

describe('audio()', () => {
  it('transcodes via Media.audio.toOpus and defaults ptt true', async () => {
    const { socket, captured } = makeSocket()
    await MessageBuilder.create(socket, RECIPIENT).audio(jpegBuffer)
    const { content } = captured()
    expect(toOpusMock).toHaveBeenCalledOnce()
    expect((content.audio as Buffer).equals(opusBuffer)).toBe(true)
    expect(content.ptt).toBe(true)
  })

  it('constructs Media with the loaded buffer', async () => {
    const { socket } = makeSocket()
    await MessageBuilder.create(socket, RECIPIENT).audio(jpegBuffer)
    expect(Media).toHaveBeenCalledWith(jpegBuffer)
  })

  it('sets ptt false when requested but still transcodes', async () => {
    const { socket, captured } = makeSocket()
    await MessageBuilder.create(socket, RECIPIENT).audio(jpegBuffer, { ptt: false })
    expect(toOpusMock).toHaveBeenCalledOnce()
    expect(captured().content.ptt).toBe(false)
  })

  it('propagates seconds', async () => {
    const { socket, captured } = makeSocket()
    await MessageBuilder.create(socket, RECIPIENT).audio(jpegBuffer, { seconds: 120 })
    expect(captured().content.seconds).toBe(120)
  })

  it('omits seconds when not provided', async () => {
    const { socket, captured } = makeSocket()
    await MessageBuilder.create(socket, RECIPIENT).audio(jpegBuffer)
    expect(captured().content.seconds).toBeUndefined()
  })

  it('loads audio from a file path then transcodes', async () => {
    const { socket, captured } = makeSocket()
    await MessageBuilder.create(socket, RECIPIENT).audio(JPEG_PATH)
    expect((captured().content.audio as Buffer).equals(opusBuffer)).toBe(true)
  })

  it('loads audio from an http URL then transcodes', async () => {
    const fetchMock = vi.fn().mockResolvedValue(okResponse(pngBuffer))
    vi.stubGlobal('fetch', fetchMock)
    const { socket, captured } = makeSocket()
    await MessageBuilder.create(socket, RECIPIENT).audio('https://example.com/a.ogg')
    expect(Media).toHaveBeenCalledWith(pngBuffer)
    expect((captured().content.audio as Buffer).equals(opusBuffer)).toBe(true)
  })

  it('wraps a transcode failure as MEDIA_LOAD_FAILED', async () => {
    toOpusMock.mockRejectedValueOnce(new Error('ffmpeg boom'))
    const { socket } = makeSocket()
    await expect(
      MessageBuilder.create(socket, RECIPIENT).audio(jpegBuffer),
    ).rejects.toMatchObject({ code: 'MEDIA_LOAD_FAILED' })
  })

  it('composes reply modifier on audio', async () => {
    const { socket, captured } = makeSocket()
    const quoted = { key: { id: 'Q2' } } as never
    await MessageBuilder.create(socket, RECIPIENT).audio(jpegBuffer).reply(quoted)
    expect(captured().options.quoted).toBe(quoted)
  })

  it('propagates a load failure before transcoding runs', async () => {
    const { socket } = makeSocket()
    await expect(
      MessageBuilder.create(socket, RECIPIENT).audio('/missing-zaileys-audio.ogg'),
    ).rejects.toMatchObject({ code: 'MEDIA_LOAD_FAILED' })
    expect(toOpusMock).not.toHaveBeenCalled()
  })
})

describe('sticker()', () => {
  it('processes via Media.sticker.create and defaults isAnimated false', async () => {
    const { socket, captured } = makeSocket()
    await MessageBuilder.create(socket, RECIPIENT).sticker(pngBuffer)
    const { content } = captured()
    expect(stickerCreateMock).toHaveBeenCalledOnce()
    expect((content.sticker as Buffer).equals(webpBuffer)).toBe(true)
    expect(content.isAnimated).toBe(false)
  })

  it('constructs Media with the loaded buffer', async () => {
    const { socket } = makeSocket()
    await MessageBuilder.create(socket, RECIPIENT).sticker(pngBuffer)
    expect(Media).toHaveBeenCalledWith(pngBuffer)
  })

  it('marks isAnimated true when requested', async () => {
    const { socket, captured } = makeSocket()
    await MessageBuilder.create(socket, RECIPIENT).sticker(pngBuffer, { animated: true })
    expect(captured().content.isAnimated).toBe(true)
  })

  it('loads sticker from a file path', async () => {
    const { socket, captured } = makeSocket()
    await MessageBuilder.create(socket, RECIPIENT).sticker(JPEG_PATH)
    expect(Media).toHaveBeenCalledWith(jpegBuffer)
    expect((captured().content.sticker as Buffer).equals(webpBuffer)).toBe(true)
  })

  it('loads sticker from an http URL', async () => {
    const fetchMock = vi.fn().mockResolvedValue(okResponse(pngBuffer))
    vi.stubGlobal('fetch', fetchMock)
    const { socket, captured } = makeSocket()
    await MessageBuilder.create(socket, RECIPIENT).sticker('https://example.com/s.png')
    expect((captured().content.sticker as Buffer).equals(webpBuffer)).toBe(true)
  })

  it('wraps a sticker processing failure as MEDIA_LOAD_FAILED', async () => {
    stickerCreateMock.mockRejectedValueOnce(new Error('webp boom'))
    const { socket } = makeSocket()
    await expect(
      MessageBuilder.create(socket, RECIPIENT).sticker(pngBuffer),
    ).rejects.toMatchObject({ code: 'MEDIA_LOAD_FAILED' })
  })

  it('composes reply modifier on sticker', async () => {
    const { socket, captured } = makeSocket()
    const quoted = { key: { id: 'Q3' } } as never
    await MessageBuilder.create(socket, RECIPIENT).sticker(pngBuffer).reply(quoted)
    expect(captured().options.quoted).toBe(quoted)
  })

  it('propagates a load failure before processing runs', async () => {
    const { socket } = makeSocket()
    await expect(
      MessageBuilder.create(socket, RECIPIENT).sticker('/missing-zaileys-sticker.png'),
    ).rejects.toMatchObject({ code: 'MEDIA_LOAD_FAILED' })
    expect(stickerCreateMock).not.toHaveBeenCalled()
  })
})

describe('error type', () => {
  it('media load failures are ZaileysBuilderError instances', async () => {
    const { socket } = makeSocket()
    try {
      await MessageBuilder.create(socket, RECIPIENT).image('/missing-zaileys-x.jpg')
      expect.unreachable('should throw')
    } catch (e) {
      expect(e).toBeInstanceOf(ZaileysBuilderError)
    }
  })
})
