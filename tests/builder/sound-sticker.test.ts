import { proto, type WAMessageKey } from 'baileys'
import { describe, expect, it, vi } from 'vitest'

const webpBuffer = Buffer.from('WEBP-STICKER')
const oggBuffer = Buffer.from('OGG-OPUS-SOUND')
const videoBuffer = Buffer.from('VIDEO-WITH-AUDIO')
const customSound = Buffer.from('CUSTOM-SOUND')

const stickerCreateMock = vi.fn(async (_meta?: unknown) => webpBuffer)
const stickerSoundMock = vi.fn(async (_input: unknown) => ({ ogg: oggBuffer, seconds: 3 }))

vi.mock('../../src/builder/media-loader.js', () => ({
  loadMedia: vi.fn(async (src: unknown) =>
    src === customSound ? { buffer: customSound, mime: 'audio/ogg' } : { buffer: videoBuffer, mime: 'video/mp4' },
  ),
}))

vi.mock('../../src/media/index.js', () => ({
  Media: vi.fn(function (this: Record<string, unknown>, input: unknown) {
    this.sticker = { create: (meta?: unknown) => stickerCreateMock(meta) }
    this.audio = { stickerSound: () => stickerSoundMock(input) }
  }),
  MimeValidator: { isAnimated: (mime: string) => mime.startsWith('video/') },
}))

import { MessageBuilder, type BuilderSocketLike } from '../../src/builder/builder.js'
import { installSoundStickerEncoder, STICKER_AUDIO } from '../../src/builder/content/sticker.js'

const RECIPIENT = '1@s.whatsapp.net'
const SENT_KEY: WAMessageKey = { remoteJid: RECIPIENT, fromMe: true, id: 'MSG1' }

const makeSocket = () => {
  const relayMessage = vi.fn(async (_jid: string, _msg: proto.IMessage, _opts: unknown) => 'R1')
  let n = 0
  const waUploadToServer = vi.fn(async () => ({ mediaUrl: `https://mmg.test/${++n}`, directPath: `/v/${n}` }))
  const socket: BuilderSocketLike = {
    sendMessage: vi.fn(async () => ({ key: SENT_KEY }) as never),
    relayMessage,
    waUploadToServer,
    user: { id: '9@s.whatsapp.net' },
  } as BuilderSocketLike
  const relayed = () => relayMessage.mock.calls[0]![1] as proto.IMessage
  return { socket, relayMessage, waUploadToServer, relayed }
}

/** Reads every length-delimited field 26 out of an encoded StickerMessage. */
const field26 = (bytes: Uint8Array): Uint8Array[] => {
  const out: Uint8Array[] = []
  let i = 0
  const varint = (): number => {
    let shift = 0
    let value = 0
    for (;;) {
      const b = bytes[i++]!
      value += (b & 0x7f) * 2 ** shift
      if (b < 0x80) return value
      shift += 7
    }
  }
  while (i < bytes.length) {
    const tag = varint()
    const wire = tag & 7
    if (wire === 0) varint()
    else if (wire === 1) i += 8
    else if (wire === 5) i += 4
    else {
      const len = varint()
      if (tag >>> 3 === 26) out.push(bytes.slice(i, i + len))
      i += len
    }
  }
  return out
}

describe('sound sticker encoder', () => {
  it('appends the audio as field 26 only when the sticker carries it', () => {
    installSoundStickerEncoder()
    const audio = proto.Message.AudioMessage.encode({ directPath: '/a', seconds: 2 }).finish()
    const plain = proto.Message.StickerMessage.encode({ directPath: '/s' }).finish()
    expect(field26(plain)).toHaveLength(0)
    const withSound = { directPath: '/s', [STICKER_AUDIO]: audio }
    const [carried] = field26(proto.Message.StickerMessage.encode(withSound).finish())
    expect(proto.Message.AudioMessage.decode(carried!).directPath).toBe('/a')
  })

  it('installs once, so the field is never written twice', () => {
    installSoundStickerEncoder()
    installSoundStickerEncoder()
    const audio = proto.Message.AudioMessage.encode({ directPath: '/a' }).finish()
    const bytes = proto.Message.StickerMessage.encode({ directPath: '/s', [STICKER_AUDIO]: audio }).finish()
    expect(field26(bytes)).toHaveLength(1)
  })
})

describe('sticker({ sound })', () => {
  it('uses the source audio when sound is true and relays one sticker carrying it', async () => {
    const { socket, relayed, waUploadToServer } = makeSocket()
    await MessageBuilder.create(socket, RECIPIENT).sticker(videoBuffer, { sound: true })
    expect(stickerSoundMock).toHaveBeenLastCalledWith(videoBuffer)
    expect(waUploadToServer).toHaveBeenCalledTimes(2)
    const sticker = relayed().stickerMessage!
    expect(sticker.isAnimated).toBe(true)
    const [carried] = field26(proto.Message.StickerMessage.encode(sticker).finish())
    const audio = proto.Message.AudioMessage.decode(carried!)
    expect(audio.mimetype).toBe('audio/ogg; codecs=opus')
    expect(audio.seconds).toBe(3)
    expect(audio.directPath).not.toBe(sticker.directPath)
  })

  it('survives the full message encode used by the relay', async () => {
    const { socket, relayed } = makeSocket()
    await MessageBuilder.create(socket, RECIPIENT).sticker(videoBuffer, { sound: true })
    const decoded = proto.Message.decode(proto.Message.encode(relayed()).finish())
    expect(decoded.stickerMessage).toBeTruthy()
    const raw = proto.Message.StickerMessage.encode(relayed().stickerMessage!).finish()
    expect(field26(raw)).toHaveLength(1)
  })

  it('takes the sound from a separate source when one is given', async () => {
    const { socket } = makeSocket()
    await MessageBuilder.create(socket, RECIPIENT).sticker(videoBuffer, { sound: customSound })
    expect(stickerSoundMock).toHaveBeenLastCalledWith(customSound)
    expect(stickerCreateMock).toHaveBeenLastCalledWith(expect.objectContaining({ sound: customSound }))
  })

  it('reports a source without usable audio clearly', async () => {
    stickerSoundMock.mockRejectedValueOnce(new Error('no audio stream'))
    const { socket, relayMessage } = makeSocket()
    await expect(
      MessageBuilder.create(socket, RECIPIENT).sticker(videoBuffer, { sound: true }),
    ).rejects.toMatchObject({ code: 'MEDIA_LOAD_FAILED', message: expect.stringContaining('no usable audio') })
    expect(relayMessage).not.toHaveBeenCalled()
  })

  it('fails as SEND_FAILED when the socket cannot upload', async () => {
    const { socket } = makeSocket()
    delete (socket as { waUploadToServer?: unknown }).waUploadToServer
    await expect(
      MessageBuilder.create(socket, RECIPIENT).sticker(videoBuffer, { sound: true }),
    ).rejects.toMatchObject({ code: 'SEND_FAILED' })
  })

  it('keeps the plain sticker path when sound is false', async () => {
    const { socket, relayMessage } = makeSocket()
    await MessageBuilder.create(socket, RECIPIENT).sticker(videoBuffer, { sound: false })
    expect(relayMessage).not.toHaveBeenCalled()
    expect(socket.sendMessage).toHaveBeenCalledOnce()
  })
})
