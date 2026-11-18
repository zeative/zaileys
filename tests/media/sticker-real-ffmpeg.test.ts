import { describe, expect, it } from 'vitest'
import { execFileSync } from 'node:child_process'
import { existsSync, promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { randomBytes } from 'node:crypto'

/**
 * Runs the animated sticker pipeline against a real ffmpeg that can encode WebP. The mocked unit
 * tests could not have caught `-vsync` being rejected by ffmpeg 7+; only a real binary does.
 */
const hasLibwebp = (bin: string): boolean => {
  try {
    return execFileSync(bin, ['-hide_banner', '-encoders'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
      .includes('libwebp')
  } catch {
    return false
  }
}

const candidates = [
  process.env['ZAILEYS_TEST_FFMPEG'],
  '/opt/homebrew/opt/ffmpeg-full/bin/ffmpeg',
  '/opt/homebrew/bin/ffmpeg',
  '/usr/local/bin/ffmpeg',
  '/usr/bin/ffmpeg',
].filter((c): c is string => typeof c === 'string' && existsSync(c))

const ffmpeg = candidates.find(hasLibwebp)
const ffprobe = ffmpeg === undefined ? undefined : [path.join(path.dirname(ffmpeg), 'ffprobe'), '/opt/homebrew/bin/ffprobe', '/usr/bin/ffprobe'].find(existsSync)

/** Each ANMF chunk stores its frame duration in milliseconds as 24 bits at payload offset 12. */
const frameDurations = (webp: Buffer): number[] => {
  const out: number[] = []
  let offset = 12
  while (offset + 8 <= webp.length) {
    const size = webp.readUInt32LE(offset + 4)
    if (webp.toString('ascii', offset, offset + 4) === 'ANMF') out.push(webp.readUIntLE(offset + 8 + 12, 3))
    offset += 8 + size + (size & 1)
  }
  return out
}

describe.skipIf(ffmpeg === undefined || ffprobe === undefined)('animated sticker with a real ffmpeg', () => {
  const version = ffmpeg === undefined ? '' : execFileSync(ffmpeg, ['-hide_banner', '-version'], { encoding: 'utf8' }).split('\n')[0]

  it(`produces an animated WebP (${version})`, async () => {
    process.env['FFMPEG_PATH'] = ffmpeg
    process.env['FFPROBE_PATH'] = ffprobe
    const { StickerProcessor } = await import('../../src/media/ffmpeg/sticker.js')

    const gif = path.join(os.tmpdir(), `zaileys-anim-${randomBytes(4).toString('hex')}.gif`)
    try {
      execFileSync(ffmpeg as string, ['-y', '-loglevel', 'error', '-f', 'lavfi', '-i', 'testsrc2=size=160x120:rate=15', '-t', '2', gif])
      const sticker = await StickerProcessor.create(await fs.readFile(gif))
      const frames = frameDurations(sticker)
      expect(frames.length).toBeGreaterThan(1)
      expect(frames.every((delay) => delay === 100)).toBe(true)
      expect(sticker.includes(Buffer.from('EXIF'))).toBe(true)
    } finally {
      await fs.rm(gif, { force: true })
    }
  }, 60_000)
})
