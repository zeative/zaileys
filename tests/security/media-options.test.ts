import { afterEach, describe, expect, it } from 'vitest'
import {
  configureMediaLoading,
  getMediaLoadingDefaults,
  loadMedia,
} from '../../src/builder/media-loader.js'
import { configureMediaLimits, getMediaLimits } from '../../src/media/ffmpeg/core.js'
import { ImageProcessor } from '../../src/media/ffmpeg/image.js'
import { Client } from '../../src/client/client.js'

const pngHeader = (w: number, h: number): Buffer => {
  const buf = Buffer.alloc(24)
  buf.writeUInt32BE(0x89504e47, 0)
  buf.writeUInt32BE(0x0d0a1a0a, 4)
  buf.writeUInt32BE(13, 8)
  buf.write('IHDR', 12, 'ascii')
  buf.writeUInt32BE(w, 16)
  buf.writeUInt32BE(h, 20)
  return buf
}

afterEach(() => {
  configureMediaLoading({ allowLocalPaths: true, allowPrivateNetwork: false, deniedDirs: [], maxBytes: 64 * 1024 * 1024 })
  configureMediaLimits({ maxConcurrent: 4, maxQueued: 64, queueTimeoutMs: 120_000, maxImagePixels: 50_000_000 })
})

describe('process-wide media loading defaults', () => {
  it('strict mode set once applies to every later load', async () => {
    configureMediaLoading({ allowLocalPaths: false })
    await expect(loadMedia('./anything.png')).rejects.toThrow(/disabled/)
  })

  it('a per-call option still overrides the default', async () => {
    configureMediaLoading({ allowLocalPaths: false })
    await expect(loadMedia('/nonexistent/zaileys.png', { allowLocalPaths: true })).rejects.toThrow(/read .* failed/)
  })

  it('extra denied directories apply to every load', async () => {
    configureMediaLoading({ deniedDirs: ['/tmp/zaileys-secret-area'] })
    await expect(loadMedia('/tmp/zaileys-secret-area/x.png')).rejects.toThrow(/protected directory/)
  })

  it('rejects an invalid byte cap', () => {
    expect(() => configureMediaLoading({ maxBytes: 0 })).toThrow()
  })
})

describe('configurable image pixel cap', () => {
  it('rejects an image above a lowered cap before decoding', async () => {
    configureMediaLimits({ maxImagePixels: 1_000_000 })
    await expect(ImageProcessor.thumbnail(pngHeader(2000, 2000))).rejects.toThrow(/too large/i)
  })
})

describe('Client media option', () => {
  it('applies loading and processing limits', () => {
    new Client({
      autoConnect: false,
      media: { allowLocalPaths: false, maxImagePixels: 12_000_000, maxConcurrentFfmpeg: 2, maxQueuedFfmpeg: 8 },
    })
    expect(getMediaLoadingDefaults().allowLocalPaths).toBe(false)
    expect(getMediaLimits().maxImagePixels).toBe(12_000_000)
    expect(getMediaLimits().maxConcurrent).toBe(2)
    expect(getMediaLimits().maxQueued).toBe(8)
  })
})

describe('custom auth directory stays protected', () => {
  it('a FileAuthStore with a custom basePath cannot be read as media', async () => {
    const { FileAuthStore } = await import('../../src/auth/adapters/file.js')
    const auth = new FileAuthStore({ basePath: '/tmp/zaileys-custom-sessions/bot1' })
    new Client({ autoConnect: false, auth })
    await expect(loadMedia('/tmp/zaileys-custom-sessions/bot1/creds.json')).rejects.toThrow(/protected directory/)
  })
})
