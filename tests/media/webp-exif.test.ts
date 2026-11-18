import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { setWebpExif } from '../../src/media/ffmpeg/webp-exif.js'

const fixture = (name: string): Buffer => readFileSync(new URL(`../_fixtures/webp/${name}.webp`, import.meta.url))

const EXIF = Buffer.from(
  '49492a00080000000100415707000000000016000000' + Buffer.from('{"sticker-pack-name":"x"}').toString('hex'),
  'hex',
)

interface Chunk {
  id: string
  data: Buffer
}

const chunksOf = (webp: Buffer): Chunk[] => {
  const out: Chunk[] = []
  let offset = 12
  const end = 8 + webp.readUInt32LE(4)
  while (offset + 8 <= end) {
    const size = webp.readUInt32LE(offset + 4)
    out.push({ id: webp.toString('ascii', offset, offset + 4), data: webp.subarray(offset + 8, offset + 8 + size) })
    offset += 8 + size + (size & 1)
  }
  return out
}

describe('setWebpExif — parity with node-webpmux', () => {
  for (const name of ['lossy', 'lossless', 'alpha-lossy', 'alpha-lossless']) {
    it(`writes ${name} byte for byte like node-webpmux did`, () => {
      expect(setWebpExif(fixture(name), EXIF).equals(fixture(`${name}.webpmux`))).toBe(true)
    })
  }
})

describe('setWebpExif — container layout', () => {
  it('promotes a simple lossy file to VP8X with the EXIF flag and the canvas size', () => {
    const chunks = chunksOf(setWebpExif(fixture('lossy'), EXIF))
    expect(chunks.map((c) => c.id)).toEqual(['VP8X', 'VP8 ', 'EXIF'])
    const vp8x = chunks[0]!.data
    expect(vp8x[0]).toBe(0x08)
    expect(vp8x.readUIntLE(4, 3) + 1).toBe(64)
    expect(vp8x.readUIntLE(7, 3) + 1).toBe(48)
  })

  it('carries the alpha bit of a lossless file into VP8X', () => {
    const vp8x = chunksOf(setWebpExif(fixture('alpha-lossless'), EXIF))[0]!.data
    expect(vp8x[0]).toBe(0x18)
    expect(vp8x.readUIntLE(4, 3) + 1).toBe(33)
    expect(vp8x.readUIntLE(7, 3) + 1).toBe(21)
  })

  it('keeps every animation frame and the existing flags, adding EXIF last', () => {
    const input = fixture('animated')
    const chunks = chunksOf(setWebpExif(input, EXIF))
    expect(chunks.map((c) => c.id)).toEqual(['VP8X', 'ANIM', 'ANMF', 'ANMF', 'ANMF', 'ANMF', 'ANMF', 'EXIF'])
    expect(chunks[0]!.data[0]).toBe(chunksOf(input)[0]!.data[0]! | 0x08)
    expect(chunks[7]!.data.equals(EXIF)).toBe(true)
  })

  it('replaces an existing EXIF chunk instead of adding a second one', () => {
    const once = setWebpExif(fixture('animated'), EXIF)
    const other = Buffer.from('49492a00', 'hex')
    const chunks = chunksOf(setWebpExif(once, other))
    expect(chunks.filter((c) => c.id === 'EXIF')).toHaveLength(1)
    expect(chunks.at(-1)!.data.equals(other)).toBe(true)
  })

  it('is idempotent', () => {
    const once = setWebpExif(fixture('alpha-lossy'), EXIF)
    expect(setWebpExif(once, EXIF).equals(once)).toBe(true)
  })

  it('pads an odd-length EXIF payload and counts the pad in the RIFF size', () => {
    const out = setWebpExif(fixture('lossy'), Buffer.from([1, 2, 3]))
    expect(out.length % 2).toBe(0)
    expect(out.readUInt32LE(4)).toBe(out.length - 8)
  })
})

describe('setWebpExif — hostile input', () => {
  it('rejects data that is not a WebP file', () => {
    expect(() => setWebpExif(Buffer.from('not an image at all'), EXIF)).toThrow('not a WebP file')
  })

  it('rejects a chunk that claims more bytes than the file has', () => {
    const broken = Buffer.from(fixture('lossy'))
    broken.writeUInt32LE(0x7fffffff, 16)
    expect(() => setWebpExif(broken, EXIF)).toThrow('truncated WebP')
  })

  it('rejects a RIFF container with no image chunk', () => {
    const empty = Buffer.from('RIFF\x04\x00\x00\x00WEBP', 'latin1')
    expect(() => setWebpExif(empty, EXIF)).toThrow('no image data')
  })

  it('rejects a VP8 chunk without the frame start code', () => {
    const broken = Buffer.from(fixture('lossy'))
    broken[23] = 0
    expect(() => setWebpExif(broken, EXIF)).toThrow('invalid VP8 frame header')
  })
})
