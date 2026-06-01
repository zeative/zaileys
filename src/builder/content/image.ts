import type { AnyMessageContent } from 'baileys'
import { loadMedia } from '../media-loader.js'
import type { ImageOptions, MediaSource } from '../types.js'

export type ImageContent = {
  image: Buffer
  caption?: string
  viewOnce?: boolean
}

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
