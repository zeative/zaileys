import { beforeEach, describe, expect, it, vi } from 'vitest'

const { fileTypeMock, audio, video, image, sticker, documentProc, toBufferMock } = vi.hoisted(
  () => ({
    fileTypeMock: vi.fn(),
    audio: {
      toOpus: vi.fn(async () => Buffer.from('OPUS')),
      toMp3: vi.fn(async () => Buffer.from('MP3')),
      convert: vi.fn(async () => Buffer.from('CONV')),
    },
    video: { toMp4: vi.fn(async () => Buffer.from('MP4')), thumbnail: vi.fn(async () => 'VTHUMB') },
    image: {
      toJpeg: vi.fn(async () => Buffer.from('JPEG')),
      thumbnail: vi.fn(async () => 'ITHUMB'),
      resize: vi.fn(async () => Buffer.from('RESIZED')),
    },
    sticker: { create: vi.fn(async () => Buffer.from('STICKER')) },
    documentProc: { create: vi.fn(async () => ({ document: Buffer.from('DOC') })) },
    toBufferMock: vi.fn(async () => Buffer.from('BUF')),
  }),
)

vi.mock('file-type', () => ({ fileTypeFromBuffer: (...a: unknown[]) => fileTypeMock(...a) }))

vi.mock('../../src/media/ffmpeg/index.js', async () => {
  const actual = await vi.importActual<typeof import('../../src/media/ffmpeg/index.js')>(
    '../../src/media/ffmpeg/index.js',
  )
  return {
    ...actual,
    AudioProcessor: audio,
    VideoProcessor: video,
    ImageProcessor: image,
    StickerProcessor: sticker,
    DocumentProcessor: documentProc,
    BufferConverter: { toBuffer: (...a: unknown[]) => toBufferMock(...a) },
    MimeValidator: actual.MimeValidator,
    FFMPEG_CONSTANTS: actual.FFMPEG_CONSTANTS,
  }
})

import { Media } from '../../src/media/media.js'

beforeEach(() => {
  fileTypeMock.mockReset()
  for (const m of [audio, video, image, sticker, documentProc]) {
    for (const fn of Object.values(m)) (fn as ReturnType<typeof vi.fn>).mockClear()
  }
  toBufferMock.mockClear()
})

describe('Media facade', () => {
  it('MF1: audio.toOpus / toMp3 / convert delegate to AudioProcessor', async () => {
    const m = new Media(Buffer.from('a'))
    expect((await m.audio.toOpus()).toString()).toBe('OPUS')
    expect((await m.audio.toMp3()).toString()).toBe('MP3')
    expect((await m.audio.convert('mp3')).toString()).toBe('CONV')
    expect(audio.convert).toHaveBeenCalledWith(expect.anything(), 'mp3')
  })

  it('MF2: video.toMp4 and thumbnail delegate to VideoProcessor', async () => {
    const m = new Media(Buffer.from('v'))
    expect((await m.video.toMp4()).toString()).toBe('MP4')
    expect(await m.video.thumbnail()).toBe('VTHUMB')
  })

  it('MF3: image.toJpeg delegates directly', async () => {
    const m = new Media(Buffer.from('i'))
    expect((await m.image.toJpeg()).toString()).toBe('JPEG')
  })

  it('MF4: image.thumbnail buffers the input first', async () => {
    const m = new Media('https://x/y.png')
    expect(await m.image.thumbnail()).toBe('ITHUMB')
    expect(toBufferMock).toHaveBeenCalledOnce()
    expect(image.thumbnail).toHaveBeenCalledWith(Buffer.from('BUF'))
  })

  it('MF5: image.resize buffers then passes dimensions', async () => {
    const m = new Media(Buffer.from('i'))
    expect((await m.image.resize(20, 30)).toString()).toBe('RESIZED')
    expect(image.resize).toHaveBeenCalledWith(Buffer.from('BUF'), 20, 30)
  })

  it('MF6: sticker.create forwards metadata', async () => {
    const m = new Media(Buffer.from('i'))
    await m.sticker.create({ quality: 70 })
    expect(sticker.create).toHaveBeenCalledWith(expect.anything(), { quality: 70 })
  })

  it('MF7: document.create delegates to DocumentProcessor', async () => {
    const m = new Media(Buffer.from('d'))
    const out = await m.document.create()
    expect(out.document.toString()).toBe('DOC')
  })

  it('MF8: thumbnail.get routes video mime to VideoProcessor', async () => {
    fileTypeMock.mockResolvedValue({ mime: 'video/mp4' })
    const m = new Media(Buffer.from('v'))
    expect(await m.thumbnail.get()).toBe('VTHUMB')
    expect(video.thumbnail).toHaveBeenCalledOnce()
  })

  it('MF9: thumbnail.get routes image mime to ImageProcessor', async () => {
    fileTypeMock.mockResolvedValue({ mime: 'image/png' })
    const m = new Media(Buffer.from('i'))
    expect(await m.thumbnail.get()).toBe('ITHUMB')
  })

  it('MF10: thumbnail.get throws for an unsupported mime', async () => {
    fileTypeMock.mockResolvedValue({ mime: 'application/pdf' })
    const m = new Media(Buffer.from('p'))
    await expect(m.thumbnail.get()).rejects.toThrow('Invalid media type')
  })

  it('MF11: thumbnail.get throws when the file type is undetectable', async () => {
    fileTypeMock.mockResolvedValue(undefined)
    const m = new Media(Buffer.from('x'))
    await expect(m.thumbnail.get()).rejects.toThrow('Invalid media type')
  })

  it('MF12: toBuffer delegates to BufferConverter', async () => {
    const m = new Media(Buffer.from('b'))
    expect((await m.toBuffer()).toString()).toBe('BUF')
  })
})
