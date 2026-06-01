import { Readable } from 'node:stream'
import type { WAMessage } from 'baileys'
import type { MediaDownloadResult, MediaKind } from '../types.js'

export interface DownloadLogger {
  warn(obj: unknown, msg?: string): void
}

const MEDIA_FIELD: Record<MediaKind, string> = {
  image: 'imageMessage',
  video: 'videoMessage',
  audio: 'audioMessage',
  document: 'documentMessage',
  sticker: 'stickerMessage',
}

const extractMime = (msg: WAMessage, kind: MediaKind): string | null => {
  const content = msg.message
  if (content == null) return null
  const node = (content as Record<string, unknown>)[MEDIA_FIELD[kind]]
  if (node == null || typeof node !== 'object') return null
  const mime = (node as { mimetype?: unknown }).mimetype
  return typeof mime === 'string' && mime.length > 0 ? mime : null
}

export const createDownloadFn = (
  msg: WAMessage,
  kind: MediaKind,
  logger?: DownloadLogger,
): (() => Promise<MediaDownloadResult>) => {
  return async (): Promise<MediaDownloadResult> => {
    try {
      const { downloadMediaMessage } = await import('baileys')
      const buffer = (await downloadMediaMessage(msg, 'buffer', {})) as Buffer
      const mime = extractMime(msg, kind) ?? 'application/octet-stream'
      return { buffer, mime, size: buffer.byteLength }
    } catch (error) {
      logger?.warn({ error, kind, id: msg.key?.id }, 'media download failed')
      throw error instanceof Error ? error : new Error('media download failed')
    }
  }
}

export const createStreamFn = (
  msg: WAMessage,
  kind: MediaKind,
  logger?: DownloadLogger,
): (() => Promise<Readable>) => {
  return async (): Promise<Readable> => {
    try {
      const { downloadMediaMessage } = await import('baileys')
      const stream = (await downloadMediaMessage(msg, 'stream', {})) as Readable
      return stream
    } catch (error) {
      logger?.warn({ error, kind, id: msg.key?.id }, 'media stream download failed')
      throw error instanceof Error ? error : new Error('media stream download failed')
    }
  }
}
