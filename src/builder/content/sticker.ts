import type { AnyMessageContent } from 'baileys'
import { Media } from '../../media/index.js'
import { ZaileysBuilderError } from '../errors.js'
import { loadMedia } from '../media-loader.js'
import type { MediaSource, StickerOptions } from '../types.js'

export type StickerContent = {
  sticker: Buffer
  isAnimated?: boolean
}

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
