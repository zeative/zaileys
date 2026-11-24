import { proto, type AnyMessageContent } from 'baileys'
import { Media, MimeValidator } from '../../media/index.js'
import { ZaileysBuilderError } from '../errors.js'
import { loadMedia } from '../media-loader.js'
import type { MediaSource, StickerOptions } from '../types.js'
import { RELAY_CONTENT_KEY } from './buttons.js'

export type StickerContent = {
  sticker: Buffer
  isAnimated?: boolean
}

/** Sound sticker parts, uploaded by the builder just before the relay. */
export const RELAY_SOUND_STICKER_KEY = '__zaileysSoundSticker'

export type SoundSticker = {
  webp: Buffer
  ogg: Buffer
  seconds: number
  isAnimated: boolean
}

/** Encoded AudioMessage carried on a StickerMessage object; baileys' proto has no field for it. */
export const STICKER_AUDIO = Symbol('zaileys.stickerAudio')

let soundEncoderInstalled = false

/**
 * WhatsApp plays a sticker's sound from StickerMessage field 26 (an AudioMessage). baileys' generated
 * encoder drops unknown fields, so append it after the regular encode — only for stickers built here.
 */
export const installSoundStickerEncoder = (): void => {
  if (soundEncoderInstalled) return
  soundEncoderInstalled = true
  const encode = proto.Message.StickerMessage.encode
  proto.Message.StickerMessage.encode = function (message, writer) {
    const out = encode.call(this, message, writer)
    const audio = (message as { [STICKER_AUDIO]?: Uint8Array } | null)?.[STICKER_AUDIO]
    if (audio !== undefined) out.uint32(210).bytes(audio)
    return out
  }
}

/** Attaches the uploaded sound to an uploaded sticker so it encodes as field 26. */
export const attachStickerAudio = (
  sticker: proto.Message.IStickerMessage,
  audio: proto.Message.IAudioMessage,
): proto.Message.IStickerMessage => {
  installSoundStickerEncoder()
  ;(sticker as { [STICKER_AUDIO]?: Uint8Array })[STICKER_AUDIO] = proto.Message.AudioMessage.encode(audio).finish()
  return sticker
}

const buildSoundSticker = async (
  buffer: Buffer,
  mime: string,
  opts: StickerOptions & { sound: true | MediaSource },
): Promise<AnyMessageContent> => {
  const audioBuffer = opts.sound === true ? buffer : (await loadMedia(opts.sound)).buffer
  let webp: Buffer
  let sound: { ogg: Buffer; seconds: number }
  try {
    webp = await new Media(buffer).sticker.create(opts)
  } catch (err) {
    throw new ZaileysBuilderError('MEDIA_LOAD_FAILED', `sticker() conversion failed: ${(err as Error).message}`, {
      cause: err,
    })
  }
  try {
    sound = await new Media(audioBuffer).audio.stickerSound()
  } catch (err) {
    throw new ZaileysBuilderError(
      'MEDIA_LOAD_FAILED',
      `sticker() sound: source has no usable audio track (${(err as Error).message})`,
      { cause: err },
    )
  }
  const soundSticker: SoundSticker = {
    webp,
    ogg: sound.ogg,
    seconds: sound.seconds,
    isAnimated: opts.animated ?? MimeValidator.isAnimated(mime),
  }
  return { [RELAY_CONTENT_KEY]: {}, [RELAY_SOUND_STICKER_KEY]: soundSticker } as unknown as AnyMessageContent
}

export const buildStickerContent = async (
  src: MediaSource,
  opts?: StickerOptions,
): Promise<AnyMessageContent> => {
  const { buffer, mime } = await loadMedia(src)
  if (opts?.sound !== undefined && opts.sound !== false) {
    return buildSoundSticker(buffer, mime, opts as StickerOptions & { sound: true | MediaSource })
  }
  let webp: Buffer
  try {
    webp = await new Media(buffer).sticker.create(opts)
  } catch (err) {
    throw new ZaileysBuilderError('MEDIA_LOAD_FAILED', `sticker() conversion failed: ${(err as Error).message}`, {
      cause: err,
    })
  }
  const content: StickerContent = { sticker: webp, isAnimated: opts?.animated ?? false }
  return content as unknown as AnyMessageContent
}
