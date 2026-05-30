import { beforeEach, describe, expect, it, vi } from 'vitest'

const fileTypeMock = vi.fn()
vi.mock('file-type', () => ({ fileTypeFromBuffer: (...a: unknown[]) => fileTypeMock(...a) }))

const videoThumbMock = vi.fn(async () => 'VIDEO_THUMB')
const imageThumbMock = vi.fn(async () => 'IMAGE_THUMB')

vi.mock('../../src/media/ffmpeg/video.js', () => ({
  VideoProcessor: { thumbnail: (...a: unknown[]) => videoThumbMock(...a) },
}))
vi.mock('../../src/media/ffmpeg/image.js', () => ({
  ImageProcessor: { thumbnail: (...a: unknown[]) => imageThumbMock(...a) },
}))
vi.mock('../../src/media/ffmpeg/core.js', async () => {
  const actual = await vi.importActual<typeof import('../../src/media/ffmpeg/core.js')>(
    '../../src/media/ffmpeg/core.js',
  )
  return {
    ...actual,
    BufferConverter: { toBuffer: vi.fn(async () => Buffer.from('doc-bytes')) },
  }
})

import { DocumentProcessor } from '../../src/media/ffmpeg/document.js'

beforeEach(() => {
  fileTypeMock.mockReset()
  videoThumbMock.mockClear()
  imageThumbMock.mockClear()
})

describe('DocumentProcessor.create', () => {
  it('DOC1: builds a video document with a video thumbnail', async () => {
    fileTypeMock.mockResolvedValue({ mime: 'video/mp4', ext: 'mp4' })
    const out = await DocumentProcessor.create(Buffer.from('v'))
    expect(out.mimetype).toBe('video/mp4')
    expect(out.ext).toBe('mp4')
    expect(out.jpegThumbnail).toBe('VIDEO_THUMB')
    expect(videoThumbMock).toHaveBeenCalledOnce()
  })

  it('DOC2: builds an image document with an image thumbnail', async () => {
    fileTypeMock.mockResolvedValue({ mime: 'image/png', ext: 'png' })
    const out = await DocumentProcessor.create(Buffer.from('i'))
    expect(out.jpegThumbnail).toBe('IMAGE_THUMB')
    expect(imageThumbMock).toHaveBeenCalledOnce()
  })

  it('DOC3: leaves the thumbnail empty for non-media documents', async () => {
    fileTypeMock.mockResolvedValue({ mime: 'application/pdf', ext: 'pdf' })
    const out = await DocumentProcessor.create(Buffer.from('p'))
    expect(out.jpegThumbnail).toBe('')
    expect(videoThumbMock).not.toHaveBeenCalled()
    expect(imageThumbMock).not.toHaveBeenCalled()
  })

  it('DOC4: throws when the file type cannot be detected', async () => {
    fileTypeMock.mockResolvedValue(undefined)
    await expect(DocumentProcessor.create(Buffer.from('x'))).rejects.toThrow(
      'Document creation failed: Unable to detect file type',
    )
  })

  it('DOC5: assigns a generated fileName', async () => {
    fileTypeMock.mockResolvedValue({ mime: 'application/zip', ext: 'zip' })
    const out = await DocumentProcessor.create(Buffer.from('z'))
    expect(typeof out.fileName).toBe('string')
    expect(out.fileName.length).toBeGreaterThan(0)
  })
})
