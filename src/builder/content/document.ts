import type { AnyMessageContent } from 'baileys'
import { ZaileysBuilderError } from '../errors.js'
import { loadMedia } from '../media-loader.js'
import type { DocumentOptions, MediaSource } from '../types.js'

/** Document content shape passed to `sendMessage`; the loaded buffer is uploaded by Baileys. */
export type DocumentContent = {
  document: Buffer
  fileName: string
  mimetype: string
  caption?: string
}

/**
 * Load a {@link MediaSource} and build Baileys document content.
 *
 * @param src - file path, URL, or raw `Buffer`; loaded via {@link loadMedia}.
 * @param opts - `fileName` is required; `mimetype` falls back to the detected mime.
 * @throws ZaileysBuilderError `MEDIA_LOAD_FAILED` when the source cannot be read,
 *   `INVALID_OPTIONS` when `fileName` is blank.
 */
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
