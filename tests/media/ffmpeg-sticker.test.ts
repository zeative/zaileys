import { beforeEach, describe, expect, it, vi } from 'vitest'

const fileTypeMock = vi.fn()
vi.mock('file-type', () => ({ fileTypeFromBuffer: (...a: unknown[]) => fileTypeMock(...a) }))

const resizeStickerMock = vi.fn(async () => Buffer.from('STATIC_WEBP'))
vi.mock('../../src/media/ffmpeg/image.js', () => ({
  ImageProcessor: { resizeForSticker: (...a: unknown[]) => resizeStickerMock(...a) },
}))

const durationMock = vi.fn(async () => 3)
vi.mock('../../src/media/ffmpeg/video.js', () => ({
  VideoProcessor: { duration: (...a: unknown[]) => durationMock(...a) },
}))

const processMock = vi.fn(async (config: { onEnd: () => Promise<void> }) => {
  await config.onEnd()
})
vi.mock('../../src/media/ffmpeg/core.js', async () => {
  const actual = await vi.importActual<typeof import('../../src/media/ffmpeg/core.js')>(
    '../../src/media/ffmpeg/core.js',
  )
  return {
    ...actual,
    FFmpegProcessor: { process: (...a: unknown[]) => processMock(...(a as never)) },
    FileManager: {
      createTempPath: (p: string, e: string) => `/tmp/${p}.${e}`,
      cleanup: vi.fn(async () => undefined),
      safeReadFile: vi.fn(async () => Buffer.from('ANIM_WEBP')),
      safeWriteFile: vi.fn(async () => undefined),
    },
    BufferConverter: { toBuffer: vi.fn(async () => Buffer.from('media')) },
  }
})

const loadMock = vi.fn(async () => undefined)
const saveMock = vi.fn(async () => Buffer.from('FINAL'))
vi.mock('node-webpmux', () => ({
  default: { Image: class { exif: unknown; load = loadMock; save = saveMock } },
}))

import { StickerProcessor } from '../../src/media/ffmpeg/sticker.js'

beforeEach(() => {
  fileTypeMock.mockReset()
  resizeStickerMock.mockClear()
  durationMock.mockReset()
  durationMock.mockResolvedValue(3)
  processMock.mockClear()
  loadMock.mockClear()
  saveMock.mockClear()
})

describe('StickerProcessor.create', () => {
  it('ST1: builds a static sticker via ImageProcessor and writes exif', async () => {
    fileTypeMock.mockResolvedValue({ mime: 'image/png', ext: 'png' })
    const out = await StickerProcessor.create(Buffer.from('i'))
    expect(out.toString()).toBe('FINAL')
    expect(resizeStickerMock).toHaveBeenCalledOnce()
    expect(loadMock).toHaveBeenCalledOnce()
  })

  it('ST2: passes custom quality and shape through to the image processor', async () => {
    fileTypeMock.mockResolvedValue({ mime: 'image/png', ext: 'png' })
    await StickerProcessor.create(Buffer.from('i'), { quality: 80, shape: 'circle' })
    expect(resizeStickerMock).toHaveBeenCalledWith(expect.any(Buffer), 80, 'circle')
  })

  it('ST3: routes animated gif input through the ffmpeg pipeline', async () => {
    fileTypeMock.mockResolvedValue({ mime: 'image/gif', ext: 'gif' })
    await StickerProcessor.create(Buffer.from('g'))
    expect(processMock).toHaveBeenCalledOnce()
    expect(resizeStickerMock).not.toHaveBeenCalled()
    const opts = processMock.mock.calls[0]![0].options as string[]
    expect(opts.some((o) => o.includes('libwebp'))).toBe(true)
  })

  it('ST4: routes animated video input through the ffmpeg pipeline', async () => {
    fileTypeMock.mockResolvedValue({ mime: 'video/mp4', ext: 'mp4' })
    await StickerProcessor.create(Buffer.from('v'))
    expect(processMock).toHaveBeenCalledOnce()
  })

  it('ST5: falls back to default duration when probing fails', async () => {
    fileTypeMock.mockResolvedValue({ mime: 'video/mp4', ext: 'mp4' })
    durationMock.mockRejectedValueOnce(new Error('no probe'))
    const out = await StickerProcessor.create(Buffer.from('v'))
    expect(out.toString()).toBe('FINAL')
  })

  it('ST6: throws when the file type cannot be detected', async () => {
    fileTypeMock.mockResolvedValue(undefined)
    await expect(StickerProcessor.create(Buffer.from('x'))).rejects.toThrow(
      'Sticker creation failed: Unable to detect file type',
    )
  })

  it('ST7: wraps animated pipeline failures', async () => {
    fileTypeMock.mockResolvedValue({ mime: 'video/mp4', ext: 'mp4' })
    processMock.mockRejectedValueOnce(new Error('encode fail'))
    await expect(StickerProcessor.create(Buffer.from('v'))).rejects.toThrow(
      'Sticker creation failed',
    )
  })

  it('ST8: embeds custom pack metadata into the exif buffer', async () => {
    fileTypeMock.mockResolvedValue({ mime: 'image/png', ext: 'png' })
    let captured: Buffer | undefined
    saveMock.mockImplementationOnce(async function (this: { exif: Buffer }) {
      captured = this.exif
      return Buffer.from('FINAL')
    })
    await StickerProcessor.create(Buffer.from('i'), { packageName: 'MyPack', authorName: 'Me' })
    expect(captured!.toString('utf8')).toContain('MyPack')
    expect(captured!.toString('utf8')).toContain('Me')
  })
})
