import type { AnyMessageContent } from 'baileys'
import { Media } from '../../media/index.js'
import { ZaileysBuilderError } from '../errors.js'
import { loadMedia } from '../media-loader.js'
import type { AudioOptions, MediaSource } from '../types.js'

export type AudioContent = {
  audio: Buffer
  ptt?: boolean
  seconds?: number
  waveform?: Uint8Array
}

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
  const ptt = opts?.ptt ?? true
  const content: AudioContent = { audio: opus, ptt }
  if (ptt) {
    try {
      const { waveform, seconds } = await new Media(buffer).audio.waveform()
      content.waveform = waveform
      if (opts?.seconds === undefined) content.seconds = seconds
    } catch {}
  }
  if (opts?.seconds !== undefined) content.seconds = opts.seconds
  return content as unknown as AnyMessageContent
}
