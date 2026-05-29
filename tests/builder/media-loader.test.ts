import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { ZaileysBuilderError } from '../../src/builder/errors.js'
import { detectMimeFromBuffer, loadMedia } from '../../src/builder/media-loader.js'

const FIXTURE_DIR = join(process.cwd(), 'tests', '_fixtures', 'builder')
const JPEG_PATH = join(FIXTURE_DIR, 'sample.jpg')
const TXT_PATH = join(FIXTURE_DIR, 'sample.txt')

const jpegBuffer = readFileSync(JPEG_PATH)
const txtBuffer = readFileSync(TXT_PATH)

const pngBuffer = (() => {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  const ihdr = Buffer.from([0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52])
  return Buffer.concat([sig, ihdr, Buffer.alloc(48, 0)])
})()

const webpBuffer = Buffer.concat([
  Buffer.from('RIFF'),
  Buffer.from([0x00, 0x00, 0x00, 0x00]),
  Buffer.from('WEBPVP8 '),
  Buffer.alloc(16, 0),
])

const arrayBufOf = (buf: Buffer): ArrayBuffer =>
  buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer

const okResponse = (buf: Buffer) => ({
  ok: true,
  status: 200,
  arrayBuffer: () => Promise.resolve(arrayBufOf(buf)),
})

describe('detectMimeFromBuffer', () => {
  it('detects JPEG', async () => {
    expect(await detectMimeFromBuffer(jpegBuffer)).toBe('image/jpeg')
  })

  it('detects PNG', async () => {
    expect(await detectMimeFromBuffer(pngBuffer)).toBe('image/png')
  })

  it('detects WebP', async () => {
    expect(await detectMimeFromBuffer(webpBuffer)).toBe('image/webp')
  })

  it('falls back to application/octet-stream for unknown bytes', async () => {
    expect(await detectMimeFromBuffer(txtBuffer)).toBe('application/octet-stream')
  })

  it('falls back for empty buffer', async () => {
    expect(await detectMimeFromBuffer(Buffer.alloc(0))).toBe('application/octet-stream')
  })
})

describe('loadMedia — Buffer source', () => {
  it('passes the same Buffer reference through', async () => {
    const result = await loadMedia(jpegBuffer)
    expect(result.buffer).toBe(jpegBuffer)
  })

  it('reports JPEG mime and byte size', async () => {
    const result = await loadMedia(jpegBuffer)
    expect(result.mime).toBe('image/jpeg')
    expect(result.size).toBe(jpegBuffer.byteLength)
  })

  it('reports application/octet-stream for unknown Buffer bytes', async () => {
    const result = await loadMedia(txtBuffer)
    expect(result.mime).toBe('application/octet-stream')
    expect(result.size).toBe(txtBuffer.byteLength)
  })
})

describe('loadMedia — file path source', () => {
  it('reads an absolute path', async () => {
    const result = await loadMedia(JPEG_PATH)
    expect(result.mime).toBe('image/jpeg')
    expect(result.size).toBe(jpegBuffer.byteLength)
    expect(result.buffer.equals(jpegBuffer)).toBe(true)
  })

  it('reads a relative path resolved from cwd', async () => {
    const rel = './tests/_fixtures/builder/sample.jpg'
    const result = await loadMedia(rel)
    expect(result.buffer.equals(jpegBuffer)).toBe(true)
    expect(resolve(rel)).toBe(JPEG_PATH)
  })

  it('reads a text fixture as octet-stream', async () => {
    const result = await loadMedia(TXT_PATH)
    expect(result.mime).toBe('application/octet-stream')
    expect(result.size).toBe(10)
  })

  it('throws MEDIA_LOAD_FAILED with ENOENT cause for missing file', async () => {
    await expect(loadMedia('/nonexistent-zaileys-media.jpg')).rejects.toMatchObject({
      code: 'MEDIA_LOAD_FAILED',
    })
    try {
      await loadMedia('/nonexistent-zaileys-media.jpg')
      expect.unreachable('should have thrown')
    } catch (e) {
      expect(e).toBeInstanceOf(ZaileysBuilderError)
      expect((e as ZaileysBuilderError).code).toBe('MEDIA_LOAD_FAILED')
      expect((e as { cause?: { code?: string } }).cause?.code).toBe('ENOENT')
    }
  })
})

describe('loadMedia — http/https fetch source', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('fetches an http URL and returns the body buffer', async () => {
    const fetchMock = vi.fn().mockResolvedValue(okResponse(jpegBuffer))
    vi.stubGlobal('fetch', fetchMock)
    const result = await loadMedia('http://example.com/x.jpg')
    expect(fetchMock).toHaveBeenCalledOnce()
    expect(result.buffer.equals(jpegBuffer)).toBe(true)
    expect(result.mime).toBe('image/jpeg')
    expect(result.size).toBe(jpegBuffer.byteLength)
  })

  it('fetches an https URL via global fetch', async () => {
    const fetchMock = vi.fn().mockResolvedValue(okResponse(pngBuffer))
    vi.stubGlobal('fetch', fetchMock)
    const result = await loadMedia('https://example.com/x.png')
    expect(fetchMock).toHaveBeenCalledOnce()
    expect(result.mime).toBe('image/png')
  })

  it('throws MEDIA_LOAD_FAILED with status in message for non-2xx', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 404, arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)) })
    vi.stubGlobal('fetch', fetchMock)
    try {
      await loadMedia('https://example.com/missing.jpg')
      expect.unreachable('should have thrown')
    } catch (e) {
      expect(e).toBeInstanceOf(ZaileysBuilderError)
      expect((e as ZaileysBuilderError).code).toBe('MEDIA_LOAD_FAILED')
      expect((e as Error).message).toContain('404')
    }
  })

  it('throws MEDIA_LOAD_FAILED with cause for network error', async () => {
    const netErr = new Error('ECONNREFUSED')
    const fetchMock = vi.fn().mockRejectedValue(netErr)
    vi.stubGlobal('fetch', fetchMock)
    try {
      await loadMedia('http://example.com/x.jpg')
      expect.unreachable('should have thrown')
    } catch (e) {
      expect(e).toBeInstanceOf(ZaileysBuilderError)
      expect((e as ZaileysBuilderError).code).toBe('MEDIA_LOAD_FAILED')
      expect((e as ZaileysBuilderError).cause).toBe(netErr)
    }
  })

  it('passes an AbortSignal to fetch', async () => {
    const fetchMock = vi.fn().mockResolvedValue(okResponse(jpegBuffer))
    vi.stubGlobal('fetch', fetchMock)
    await loadMedia('https://example.com/x.jpg')
    const init = fetchMock.mock.calls[0]?.[1] as { signal?: AbortSignal } | undefined
    expect(init?.signal).toBeInstanceOf(AbortSignal)
  })
})

describe('loadMedia — URL object source', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('fetches a https URL instance with stringified url', async () => {
    const fetchMock = vi.fn().mockResolvedValue(okResponse(jpegBuffer))
    vi.stubGlobal('fetch', fetchMock)
    const result = await loadMedia(new URL('https://example.com/x.jpg'))
    expect(fetchMock).toHaveBeenCalledWith('https://example.com/x.jpg', expect.anything())
    expect(result.mime).toBe('image/jpeg')
  })

  it('reads a file:// URL instance from disk', async () => {
    const result = await loadMedia(new URL(`file://${JPEG_PATH}`))
    expect(result.buffer.equals(jpegBuffer)).toBe(true)
    expect(result.mime).toBe('image/jpeg')
  })
})

describe('loadMedia — timeout', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('aborts and throws MEDIA_LOAD_FAILED when fetch exceeds timeoutMs', async () => {
    const fetchMock = vi.fn().mockImplementation((_url: string, init?: { signal?: AbortSignal }) => {
      return new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => {
          reject(Object.assign(new Error('aborted'), { name: 'AbortError' }))
        })
      })
    })
    vi.stubGlobal('fetch', fetchMock)
    try {
      await loadMedia('https://example.com/slow.jpg', { timeoutMs: 30 })
      expect.unreachable('should have thrown')
    } catch (e) {
      expect(e).toBeInstanceOf(ZaileysBuilderError)
      expect((e as ZaileysBuilderError).code).toBe('MEDIA_LOAD_FAILED')
    }
  })
})

describe('loadMedia — concurrency', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('resolves 10 parallel file + fetch loads without state corruption', async () => {
    const fetchMock = vi.fn().mockResolvedValue(okResponse(pngBuffer))
    vi.stubGlobal('fetch', fetchMock)
    const ops = [
      loadMedia(JPEG_PATH),
      loadMedia('https://example.com/a.png'),
      loadMedia(TXT_PATH),
      loadMedia(jpegBuffer),
      loadMedia('https://example.com/b.png'),
      loadMedia(JPEG_PATH),
      loadMedia(new URL('https://example.com/c.png')),
      loadMedia(txtBuffer),
      loadMedia('https://example.com/d.png'),
      loadMedia(JPEG_PATH),
    ]
    const results = await Promise.all(ops)
    expect(results).toHaveLength(10)
    expect(results[0]?.mime).toBe('image/jpeg')
    expect(results[1]?.mime).toBe('image/png')
    expect(results[2]?.mime).toBe('application/octet-stream')
    expect(results[3]?.buffer).toBe(jpegBuffer)
  })
})
