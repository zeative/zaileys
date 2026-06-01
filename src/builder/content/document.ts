import type { AnyMessageContent } from 'baileys'
import { ZaileysBuilderError } from '../errors.js'
import { loadMedia } from '../media-loader.js'
import type { DocumentOptions, MediaSource } from '../types.js'

export type DocumentContent = {
  document: Buffer
  fileName: string
  mimetype: string
  caption?: string
}

export const buildDocumentContent = async (
  src: MediaSource,
  opts: DocumentOptions,
): Promise<AnyMessageContent> => {
  if (typeof opts?.fileName !== 'string' || opts.fileName.trim().length === 0) {
    throw new ZaileysBuilderError('INVALID_OPTIONS', 'document() requires a non-empty fileName')
  }
  const { buffer, mime } = await loadMedia(src)
  const content: DocumentContent = {
    document: buffer,
    fileName: opts.fileName,
    mimetype: opts.mimetype ?? mime,
  }
  if (opts.caption !== undefined) content.caption = opts.caption
  return content as unknown as AnyMessageContent
}
