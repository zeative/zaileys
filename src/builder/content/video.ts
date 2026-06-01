import type { AnyMessageContent } from 'baileys'
import { ZaileysBuilderError } from '../errors.js'
import { loadMedia } from '../media-loader.js'
import type { MediaSource, VideoOptions } from '../types.js'

export type VideoContent = {
  video: Buffer
  caption?: string
  gifPlayback?: boolean
  viewOnce?: boolean
}

export const buildVideoContent = async (
  src: MediaSource,
  opts?: VideoOptions,
): Promise<AnyMessageContent> => {
  const { buffer, mime } = await loadMedia(src)
  if (!mime.startsWith('video/')) {
    throw new ZaileysBuilderError('INVALID_OPTIONS', `video() expects a video source, got mime ${mime}`)
  }
  const content: VideoContent = { video: buffer }
  if (opts?.caption !== undefined) content.caption = opts.caption
  if (opts?.gifPlayback !== undefined) content.gifPlayback = opts.gifPlayback
  if (opts?.viewOnce !== undefined) content.viewOnce = opts.viewOnce
  return content as unknown as AnyMessageContent
}
