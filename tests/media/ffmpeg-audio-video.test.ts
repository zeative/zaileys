import { beforeEach, describe, expect, it, vi } from 'vitest'

const fileTypeMock = vi.fn()
vi.mock('file-type', () => ({ fileTypeFromBuffer: (...a: unknown[]) => fileTypeMock(...a) }))

const processMock = vi.fn(async (config: { onEnd: () => Promise<void> }) => {
  await config.onEnd()
})
const getDurationMock = vi.fn(async () => 30)

vi.mock('../../src/media/ffmpeg/core.js', async () => {
  const actual = await vi.importActual<typeof import('../../src/media/ffmpeg/core.js')>(
    '../../src/media/ffmpeg/core.js',
  )
  return {
    ...actual,
    FFmpegProcessor: {
      process: (...a: unknown[]) => processMock(...(a as [{ onEnd: () => Promise<void> }])),
      getDuration: (...a: unknown[]) => getDurationMock(...a),
    },
    FileManager: {
      createTempPath: (prefix: string, ext: string) => `/tmp/${prefix}.${ext}`,
      cleanup: vi.fn(async () => undefined),
      safeReadFile: vi.fn(async () => Buffer.from('OUTPUT')),
      safeWriteFile: vi.fn(async () => undefined),
    },
    BufferConverter: {
      ...actual.BufferConverter,
      toBuffer: vi.fn(async (i: unknown) => (Buffer.isBuffer(i) ? i : Buffer.from('src'))),
      getExtension: vi.fn(async () => 'wav'),
    },
  }
})

import { AudioProcessor } from '../../src/media/ffmpeg/audio.js'
import { VideoProcessor } from '../../src/media/ffmpeg/video.js'

beforeEach(() => {
  fileTypeMock.mockReset()
  processMock.mockClear()
  getDurationMock.mockClear()
})

describe('AudioProcessor', () => {
  it('AU1: toOpus builds the libopus ogg option set', async () => {
    fileTypeMock.mockResolvedValue({ mime: 'audio/wav', ext: 'wav' })
    const out = await AudioProcessor.toOpus(Buffer.from('a'))
    expect(out.toString()).toBe('OUTPUT')
    const opts = processMock.mock.calls[0]![0].options as string[]
    expect(opts).toContain('libopus')
    expect(opts.slice(-2)).toEqual(['-f', 'ogg'])
  })

  it('AU2: toMp3 builds the libmp3lame option set', async () => {
    fileTypeMock.mockResolvedValue({ mime: 'audio/wav', ext: 'wav' })
    await AudioProcessor.toMp3(Buffer.from('a'))
    const opts = processMock.mock.calls[0]![0].options as string[]
    expect(opts).toContain('libmp3lame')
    expect(opts.slice(-2)).toEqual(['-f', 'mp3'])
  })

  it('AU3: convert defaults to opus', async () => {
    fileTypeMock.mockResolvedValue({ mime: 'audio/wav', ext: 'wav' })
    await AudioProcessor.convert(Buffer.from('a'))
    const opts = processMock.mock.calls[0]![0].options as string[]
    expect(opts).toContain('libopus')
  })

  it('AU4: rejects non-audio input via MimeValidator', async () => {
    fileTypeMock.mockResolvedValue({ mime: 'image/png', ext: 'png' })
    await expect(AudioProcessor.toOpus(Buffer.from('a'))).rejects.toThrow('expected audio/*')
  })

  it('AU5: wraps ffmpeg failures with an OPUS-prefixed message', async () => {
    fileTypeMock.mockResolvedValue({ mime: 'audio/wav', ext: 'wav' })
    processMock.mockRejectedValueOnce(new Error('exit 1'))
    await expect(AudioProcessor.toOpus(Buffer.from('a'))).rejects.toThrow(
      'OPUS conversion failed: exit 1',
    )
  })
})

describe('VideoProcessor', () => {
  it('VI1: toMp4 builds the libx264 mp4 option set', async () => {
    fileTypeMock.mockResolvedValue({ mime: 'video/webm', ext: 'webm' })
    const out = await VideoProcessor.toMp4(Buffer.from('v'))
    expect(out.toString()).toBe('OUTPUT')
    const opts = processMock.mock.calls[0]![0].options as string[]
    expect(opts).toContain('libx264')
    expect(opts.slice(-2)).toEqual(['-f', 'mp4'])
  })

  it('VI2: toMp4 rejects non-video input', async () => {
    fileTypeMock.mockResolvedValue({ mime: 'audio/wav', ext: 'wav' })
    await expect(VideoProcessor.toMp4(Buffer.from('v'))).rejects.toThrow('expected video/*')
  })

  it('VI3: toMp4 wraps ffmpeg failures', async () => {
    fileTypeMock.mockResolvedValue({ mime: 'video/mp4', ext: 'mp4' })
    processMock.mockRejectedValueOnce(new Error('boom'))
    await expect(VideoProcessor.toMp4(Buffer.from('v'))).rejects.toThrow(
      'Video re-encoding failed: boom',
    )
  })

  it('VI4: thumbnail seeks to 10% of duration and returns base64', async () => {
    fileTypeMock.mockResolvedValue({ mime: 'video/mp4', ext: 'mp4' })
    getDurationMock.mockResolvedValue(100)
    const out = await VideoProcessor.thumbnail(Buffer.from('v'))
    expect(out).toBe(Buffer.from('OUTPUT').toString('base64'))
    const opts = processMock.mock.calls[0]![0].options as string[]
    const ssIdx = opts.indexOf('-ss')
    expect(opts[ssIdx + 1]).toBe('10')
  })

  it('VI5: thumbnail wraps failures', async () => {
    fileTypeMock.mockResolvedValue({ mime: 'video/mp4', ext: 'mp4' })
    getDurationMock.mockRejectedValueOnce(new Error('probe fail'))
    await expect(VideoProcessor.thumbnail(Buffer.from('v'))).rejects.toThrow(
      'Thumbnail generation failed',
    )
  })

  it('VI6: duration delegates to FFmpegProcessor.getDuration', async () => {
    getDurationMock.mockResolvedValue(7)
    expect(await VideoProcessor.duration('/f.mp4')).toBe(7)
  })
})
