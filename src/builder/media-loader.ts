import { readFile, stat } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { detectFileType, initializeFFmpeg } from '../media/ffmpeg/core.js'
import { ZaileysBuilderError } from './errors.js'
import type { MediaSource } from './types.js'

const DEFAULT_TIMEOUT_MS = 30_000
/** A 30s timeout still lets ~3 GB through on a fast link; cap the bytes, not just the clock. */
const DEFAULT_MAX_BYTES = 64 * 1024 * 1024
const FALLBACK_MIME = 'application/octet-stream'

export type LoadedMedia = {
  buffer: Buffer
  mime: string
  size: number
}

export type LoadMediaOptions = {
  timeoutMs?: number
  /** Hard ceiling on bytes read from a URL or file. Default 64 MB. */
  maxBytes?: number
}

export const detectMimeFromBuffer = async (buffer: Buffer): Promise<string> => {
  if (buffer.byteLength === 0) return FALLBACK_MIME
  const detected = await detectFileType(buffer)
  return detected?.mime ?? FALLBACK_MIME
}

const finalize = async (buffer: Buffer): Promise<LoadedMedia> => ({
  buffer,
  mime: await detectMimeFromBuffer(buffer),
  size: buffer.byteLength,
})

const readCapped = async (res: Response, url: string, maxBytes: number): Promise<Buffer> => {
  const declared = Number(res.headers?.get?.('content-length') ?? '0')
  if (Number.isFinite(declared) && declared > maxBytes) {
    throw new ZaileysBuilderError('MEDIA_LOAD_FAILED', `${url} exceeds ${maxBytes} bytes`)
  }
  const body = res.body
  /** Falls back to a buffered read when the response exposes no stream, then enforces the cap. */
  if (body == null || typeof body.getReader !== 'function') {
    const whole = Buffer.from(await res.arrayBuffer())
    if (whole.byteLength > maxBytes) {
      throw new ZaileysBuilderError('MEDIA_LOAD_FAILED', `${url} exceeds ${maxBytes} bytes`)
    }
    return whole
  }
  /** Streamed so an undeclared or lying content-length cannot exhaust memory before the check. */
  const chunks: Uint8Array[] = []
  let total = 0
  const reader = body.getReader()
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    if (value === undefined) continue
    total += value.byteLength
    if (total > maxBytes) {
      await reader.cancel().catch(() => undefined)
      throw new ZaileysBuilderError('MEDIA_LOAD_FAILED', `${url} exceeds ${maxBytes} bytes`)
    }
    chunks.push(value)
  }
  return Buffer.concat(chunks)
}

const fetchUrl = async (url: string, timeoutMs: number, maxBytes: number): Promise<Buffer> => {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetch(url, { signal: controller.signal })
    if (!res.ok) {
      throw new ZaileysBuilderError('MEDIA_LOAD_FAILED', `fetch ${url} failed with status ${res.status}`, {
        cause: res.status,
      })
    }
    return await readCapped(res, url, maxBytes)
  } catch (err) {
    if (err instanceof ZaileysBuilderError) throw err
    throw new ZaileysBuilderError('MEDIA_LOAD_FAILED', `fetch ${url} failed: ${(err as Error).message}`, {
      cause: err,
    })
  } finally {
    clearTimeout(timer)
  }
}

const readPath = async (path: string, maxBytes: number): Promise<Buffer> => {
  try {
    const info = await stat(path)
    if (info.size > maxBytes) {
      throw new ZaileysBuilderError('MEDIA_LOAD_FAILED', `${path} exceeds ${maxBytes} bytes`)
    }
    return await readFile(path)
  } catch (err) {
    if (err instanceof ZaileysBuilderError) throw err
    throw new ZaileysBuilderError('MEDIA_LOAD_FAILED', `read ${path} failed: ${(err as Error).message}`, {
      cause: err,
    })
  }
}

const isHttp = (value: string): boolean => value.startsWith('http://') || value.startsWith('https://')

export const loadMedia = async (src: MediaSource, options?: LoadMediaOptions): Promise<LoadedMedia> => {
  await initializeFFmpeg()
  const timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS
  const maxBytes = options?.maxBytes ?? DEFAULT_MAX_BYTES

  if (Buffer.isBuffer(src)) return finalize(src)

  if (src instanceof URL) {
    if (src.protocol === 'file:') return finalize(await readPath(fileURLToPath(src), maxBytes))
    return finalize(await fetchUrl(src.toString(), timeoutMs, maxBytes))
  }

  if (isHttp(src)) return finalize(await fetchUrl(src, timeoutMs, maxBytes))

  return finalize(await readPath(src, maxBytes))
}
