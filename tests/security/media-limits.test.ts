import { describe, expect, it } from 'vitest'
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { randomBytes } from 'node:crypto'
import { ImageProcessor } from '../../src/media/ffmpeg/image.js'
import { loadMedia } from '../../src/builder/media-loader.js'

/** 42-byte PNG header declaring 65535x65535 — the classic decompression bomb. */
const pngBomb = (): Buffer => {
  const buf = Buffer.alloc(24)
  buf.writeUInt32BE(0x89504e47, 0)
  buf.writeUInt32BE(0x0d0a1a0a, 4)
  buf.writeUInt32BE(13, 8)
  buf.write('IHDR', 12, 'ascii')
  buf.writeUInt32BE(65535, 16)
  buf.writeUInt32BE(65535, 20)
  return buf
}

const gifBomb = (): Buffer => {
  const buf = Buffer.alloc(13)
  buf.write('GIF89a', 0, 'ascii')
  buf.writeUInt16LE(65535, 6)
  buf.writeUInt16LE(65535, 8)
  return buf
}

describe('image decompression bombs', () => {
  it('refuses a PNG declaring 65535x65535 instead of allocating ~17 GB', async () => {
    await expect(ImageProcessor.thumbnail(pngBomb())).rejects.toThrow(/too large/i)
  })

  it('refuses a GIF declaring 65535x65535', async () => {
    await expect(ImageProcessor.thumbnail(gifBomb())).rejects.toThrow(/too large/i)
  })

  it('refuses an absurd resize target', async () => {
    await expect(ImageProcessor.resize(pngBomb(), 1_000_000, 1_000_000)).rejects.toThrow()
  })

  it('refuses a non-integer resize target', async () => {
    await expect(ImageProcessor.resize(pngBomb(), Number.NaN, 10)).rejects.toThrow(/Invalid resize/i)
  })
})

describe('media byte caps', () => {
  it('refuses a local file larger than maxBytes', async () => {
    const file = path.join(os.tmpdir(), `zaileys-big-${randomBytes(4).toString('hex')}.bin`)
    await fs.writeFile(file, Buffer.alloc(2048))
    try {
      await expect(loadMedia(file, { maxBytes: 1024 })).rejects.toThrow(/exceeds/)
    } finally {
      await fs.rm(file, { force: true })
    }
  })

  it('still loads a file under the cap', async () => {
    const file = path.join(os.tmpdir(), `zaileys-ok-${randomBytes(4).toString('hex')}.bin`)
    await fs.writeFile(file, Buffer.alloc(64))
    try {
      const out = await loadMedia(file, { maxBytes: 1024 })
      expect(out.size).toBe(64)
    } finally {
      await fs.rm(file, { force: true })
    }
  })
})
