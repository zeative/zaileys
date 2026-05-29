import type { AnyMessageContent } from 'baileys'
import { loadMedia } from '../media-loader.js'
import type { ImageOptions, MediaSource } from '../types.js'

/** Image content shape passed to `sendMessage`; the loaded buffer is uploaded by Baileys. */
export type ImageContent = {
  image: Buffer
  caption?: string
  viewOnce?: boolean
}

/**
 * Load a {@link MediaSource} and build Baileys image content.
 *
 * @param src - file path, URL, or raw `Buffer`; loaded via {@link loadMedia}.
 * @param opts - optional `caption` and `viewOnce` flag.
 * @throws ZaileysBuilderError `MEDIA_LOAD_FAILED` when the source cannot be read.
 */
export const buildImageContent = async (
  src: MediaSource,
  opts?: ImageOptions,
): Promise<AnyMessageContent> => {
  const { buffer } = await loadMedia(src)
  const content: ImageContent = { image: buffer }
  if (opts?.caption !== undefined) content.caption = opts.caption
  if (opts?.viewOnce !== undefined) content.viewOnce = opts.viewOnce
  return content as unknown as AnyMessageContent
}
