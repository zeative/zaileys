import type { AnyMessageContent } from 'baileys'
import { Media } from '../../media/index.js'
import { ZaileysBuilderError } from '../errors.js'
import { loadMedia } from '../media-loader.js'
import type { AudioOptions, MediaSource } from '../types.js'

/** Audio content shape passed to `sendMessage`; the buffer is Opus-transcoded for WhatsApp. */
export type AudioContent = {
  audio: Buffer
  ptt?: boolean
  seconds?: number
}

/**
 * Load a {@link MediaSource} and build Baileys audio content, transcoding to Opus
 * via the Phase 1 {@link Media} processor so the result plays as a WhatsApp voice note.
 *
 * @param src - file path, URL, or raw `Buffer`; loaded via {@link loadMedia}.
 * @param opts - `ptt` (default `true`) marks a voice note; `seconds` sets the duration hint.
 * @throws ZaileysBuilderError `MEDIA_LOAD_FAILED` when the source cannot be read or transcoded.
 */
export const buildAudioContent = async (
  src: MediaSource,
  opts?: AudioOptions,
): Promise<AnyMessageContent> => {
  const { buffer } = await loadMedia(src)
  let opus: Buffer
  try {
    opus = await new Media(buffer).audio.toOpus()
  } catch (err) {
    throw new ZaileysBuilderError('MEDIA_LOAD_FAILED', `audio() transcode failed: ${(err as Error).message}`, {
      cause: err,
    })
  }
  const content: AudioContent = { audio: opus, ptt: opts?.ptt ?? true }
  if (opts?.seconds !== undefined) content.seconds = opts.seconds
  return content as unknown as AnyMessageContent
}
