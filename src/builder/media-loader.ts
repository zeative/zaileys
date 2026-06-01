import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { detectFileType, initializeFFmpeg } from '../media/ffmpeg/core.js'
import { ZaileysBuilderError } from './errors.js'
import type { MediaSource } from './types.js'

const DEFAULT_TIMEOUT_MS = 30_000
const FALLBACK_MIME = 'application/octet-stream'

export type LoadedMedia = {
  buffer: Buffer
  mime: string
  size: number
}

export type LoadMediaOptions = {
  timeoutMs?: number
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

const fetchUrl = async (url: string, timeoutMs: number): Promise<Buffer> => {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetch(url, { signal: controller.signal })
    if (!res.ok) {
      throw new ZaileysBuilderError('MEDIA_LOAD_FAILED', `fetch ${url} failed with status ${res.status}`, {
        cause: res.status,
      })
    }
    return Buffer.from(await res.arrayBuffer())
  } catch (err) {
    if (err instanceof ZaileysBuilderError) throw err
    throw new ZaileysBuilderError('MEDIA_LOAD_FAILED', `fetch ${url} failed: ${(err as Error).message}`, {
      cause: err,
    })
  } finally {
    clearTimeout(timer)
  }
}

const readPath = async (path: string): Promise<Buffer> => {
  try {
    return await readFile(path)
  } catch (err) {
    throw new ZaileysBuilderError('MEDIA_LOAD_FAILED', `read ${path} failed: ${(err as Error).message}`, {
      cause: err,
    })
  }
}

const isHttp = (value: string): boolean => value.startsWith('http://') || value.startsWith('https://')

/** Load a {@link MediaSource} into a `Buffer` with detected mime and byte size, wrapping all failures as `MEDIA_LOAD_FAILED`. */
export const loadMedia = async (src: MediaSource, options?: LoadMediaOptions): Promise<LoadedMedia> => {
  await initializeFFmpeg()
  const timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS

  if (Buffer.isBuffer(src)) return finalize(src)

  if (src instanceof URL) {
    if (src.protocol === 'file:') return finalize(await readPath(fileURLToPath(src)))
    return finalize(await fetchUrl(src.toString(), timeoutMs))
  }

  if (isHttp(src)) return finalize(await fetchUrl(src, timeoutMs))

  return finalize(await readPath(src))
}
