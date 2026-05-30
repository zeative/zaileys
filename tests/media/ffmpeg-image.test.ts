import { beforeEach, describe, expect, it, vi } from 'vitest'

const { processMock, safeReadFileMock } = vi.hoisted(() => ({
  processMock: vi.fn(async (config: { onEnd: () => Promise<void> }) => {
    await config.onEnd()
  }),
  safeReadFileMock: vi.fn(async () => Buffer.from('WEBP')),
}))

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
      safeReadFile: (...a: unknown[]) => safeReadFileMock(...a),
      safeWriteFile: vi.fn(async () => undefined),
    },
  }
})

import { ImageProcessor } from '../../src/media/ffmpeg/image.js'

const PNG_1x1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M8AAAMBAQDJ/pLvAAAAAElFTkSuQmCC',
  'base64',
)

beforeEach(() => {
  processMock.mockClear()
  safeReadFileMock.mockClear()
})

describe('ImageProcessor', () => {
  it('IM1: thumbnail returns a non-empty base64 jpeg string', async () => {
    const out = await ImageProcessor.thumbnail(PNG_1x1)
    expect(typeof out).toBe('string')
    expect(out.length).toBeGreaterThan(0)
    expect(Buffer.from(out, 'base64').length).toBeGreaterThan(0)
  })

  it('IM2: resize returns a PNG buffer', async () => {
    const out = await ImageProcessor.resize(PNG_1x1, 8, 8)
    expect(Buffer.isBuffer(out)).toBe(true)
    expect(out.length).toBeGreaterThan(0)
  })

  it('IM3: toJpeg converts a PNG buffer into a JPEG buffer', async () => {
    const out = await ImageProcessor.toJpeg(PNG_1x1)
    expect(Buffer.isBuffer(out)).toBe(true)
    expect(out.length).toBeGreaterThan(0)
  })

  it('IM4: toJpeg surfaces an error for an undecodable buffer', async () => {
    await expect(ImageProcessor.toJpeg(Buffer.from('not-an-image'))).rejects.toThrow()
  })

  it('IM5: resizeForSticker default shape produces a non-empty webp buffer', async () => {
    const out = await ImageProcessor.resizeForSticker(PNG_1x1, 60, 'default')
    expect(Buffer.isBuffer(out)).toBe(true)
    expect(out.length).toBeGreaterThan(0)
  })

  it('IM6: resizeForSticker circle shape produces a non-empty webp buffer', async () => {
    const out = await ImageProcessor.resizeForSticker(PNG_1x1, 60, 'circle')
    expect(out.length).toBeGreaterThan(0)
  })

  it('IM7: resizeForSticker rounded shape produces a non-empty webp buffer', async () => {
    const out = await ImageProcessor.resizeForSticker(PNG_1x1, 60, 'rounded')
    expect(out.length).toBeGreaterThan(0)
  })

  it('IM8: resizeForSticker oval shape produces a non-empty webp buffer', async () => {
    const out = await ImageProcessor.resizeForSticker(PNG_1x1, 60, 'oval')
    expect(out.length).toBeGreaterThan(0)
  })
})
