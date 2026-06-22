import { describe, expect, it, vi } from 'vitest'

const loadMediaMock = vi.fn<[unknown], Promise<{ buffer: Buffer; mime: string; size: number }>>()
vi.mock('../../src/builder/media-loader.js', () => ({
  loadMedia: (src: unknown) => loadMediaMock(src),
}))

const { buildVideoContent } = await import('../../src/builder/content/video.js')

const rec = (c: unknown) => c as Record<string, unknown>

describe('buildVideoContent ptv (video note)', () => {
  it('sets ptv:true when requested', async () => {
    const buf = Buffer.from('vid')
    loadMediaMock.mockResolvedValue({ buffer: buf, mime: 'video/mp4', size: buf.length })
    const content = rec(await buildVideoContent('x', { ptv: true }))
    expect(content.ptv).toBe(true)
    expect(content.video).toBe(buf)
  })

  it('omits ptv for a normal video', async () => {
    const buf = Buffer.from('vid')
    loadMediaMock.mockResolvedValue({ buffer: buf, mime: 'video/mp4', size: buf.length })
    const content = rec(await buildVideoContent('x', { caption: 'hi' }))
    expect(content.ptv).toBeUndefined()
    expect(content.caption).toBe('hi')
  })

  it('rejects a non-video source', async () => {
    const buf = Buffer.from('img')
    loadMediaMock.mockResolvedValue({ buffer: buf, mime: 'image/png', size: buf.length })
    await expect(buildVideoContent('x', { ptv: true })).rejects.toThrow()
  })
})
