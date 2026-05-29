import type { AnyMessageContent } from 'baileys'
import { Media } from '../../media/index.js'
import { ZaileysBuilderError } from '../errors.js'
import { loadMedia } from '../media-loader.js'
import type { MediaSource, StickerOptions } from '../types.js'

/** Sticker content shape passed to `sendMessage`; the buffer is converted to WebP. */
export type StickerContent = {
  sticker: Buffer
  isAnimated?: boolean
}

/**
 * Load a {@link MediaSource} and build Baileys sticker content, converting to WebP
 * via the Phase 1 {@link Media} processor. The `animated` flag is surfaced as
 * `isAnimated`; animation itself is auto-detected by the processor from the source.
 * Mentions are not part of the sticker content shape and are silently ignored.
 *
 * @param src - file path, URL, or raw `Buffer`; loaded via {@link loadMedia}.
 * @param opts - `animated` reports whether the sticker is animated.
 * @throws ZaileysBuilderError `MEDIA_LOAD_FAILED` when the source cannot be read or converted.
 */
export const buildStickerContent = async (
  src: MediaSource,
  opts?: StickerOptions,
): Promise<AnyMessageContent> => {
  const { buffer } = await loadMedia(src)
  let webp: Buffer
  try {
    webp = await new Media(buffer).sticker.create()
  } catch (err) {
    throw new ZaileysBuilderError('MEDIA_LOAD_FAILED', `sticker() conversion failed: ${(err as Error).message}`, {
      cause: err,
    })
  }
  const content: StickerContent = { sticker: webp, isAnimated: opts?.animated ?? false }
  return content as unknown as AnyMessageContent
}
