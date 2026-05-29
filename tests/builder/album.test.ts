import { afterEach, describe, expect, it, vi } from 'vitest'

const loadMediaMock = vi.fn<[unknown], Promise<{ buffer: Buffer; mime: string; size: number }>>()

vi.mock('../../src/builder/media-loader.js', () => ({
  loadMedia: (src: unknown) => loadMediaMock(src),
}))

import { type BuilderSocketLike, MessageBuilder } from '../../src/builder/builder.js'
import { sendAlbum } from '../../src/builder/album.js'
import { ZaileysBuilderError } from '../../src/builder/errors.js'
import type { AlbumItem } from '../../src/builder/types.js'

const imgBuf = Buffer.from('IMG')
const vidBuf = Buffer.from('VID')

const setupMedia = () => {
  loadMediaMock.mockImplementation(async (src: unknown) => {
    const tag = String(src)
    if (tag.includes('vid')) return { buffer: vidBuf, mime: 'video/mp4', size: vidBuf.length }
    return { buffer: imgBuf, mime: 'image/jpeg', size: imgBuf.length }
  })
}

type Call = { jid: string; content: Record<string, unknown>; options: Record<string, unknown> }

const makeSocket = (opts?: { failParent?: boolean; failChildAt?: number }) => {
  const calls: Call[] = []
  let n = 0
  const socket: BuilderSocketLike = {
    sendMessage: async (jid, content, options) => {
      const c = content as unknown as Record<string, unknown>
      const isParent = 'album' in c
      if (isParent && opts?.failParent) throw new Error('parent boom')
      if (!isParent && opts?.failChildAt !== undefined) {
        const childIndex = calls.filter((x) => !('album' in x.content)).length
        if (childIndex === opts.failChildAt) throw new Error('child boom')
      }
      calls.push({ jid, content: c, options: (options ?? {}) as Record<string, unknown> })
      n += 1
      return { key: { id: `K${n}`, remoteJid: jid, fromMe: true } } as never
    },
  }
  return { socket, calls }
}

const RECIPIENT = '123@s.whatsapp.net'

const items = (...types: Array<'image' | 'video'>): AlbumItem[] =>
  types.map((type, i) => ({ type, src: `${type === 'video' ? 'vid' : 'img'}-${i}` }))

afterEach(() => {
  vi.clearAllMocks()
})

describe('sendAlbum', () => {
  it('sends parent first then one child per item', async () => {
    setupMedia()
    const { socket, calls } = makeSocket()
    const sendSpy = vi.spyOn(socket, 'sendMessage')
    await sendAlbum(socket, RECIPIENT, items('image', 'image', 'video'), { recipient: RECIPIENT })
    expect(sendSpy).toHaveBeenCalledTimes(4)
    expect(calls).toHaveLength(4)
    expect('album' in calls[0]!.content).toBe(true)
    expect('album' in calls[1]!.content).toBe(false)
    const firstArgs = sendSpy.mock.calls[0]
    expect('album' in (firstArgs![1] as Record<string, unknown>)).toBe(true)
    const secondArgs = sendSpy.mock.calls[1]
    expect((secondArgs![1] as Record<string, unknown>).albumParentKey).toBeDefined()
  })

  it('sets expectedImageCount and expectedVideoCount on parent', async () => {
    setupMedia()
    const { socket, calls } = makeSocket()
    await sendAlbum(socket, RECIPIENT, items('image', 'image', 'video'), { recipient: RECIPIENT })
    const album = calls[0]!.content.album as { expectedImageCount: number; expectedVideoCount: number }
    expect(album.expectedImageCount).toBe(2)
    expect(album.expectedVideoCount).toBe(1)
  })

  it('propagates parent key as albumParentKey on every child', async () => {
    setupMedia()
    const { socket, calls } = makeSocket()
    const sendSpy = vi.spyOn(socket, 'sendMessage')
    await sendAlbum(socket, RECIPIENT, items('image', 'video'), { recipient: RECIPIENT })
    const parentKey = { id: 'K1', remoteJid: RECIPIENT, fromMe: true }
    for (const args of sendSpy.mock.calls.slice(1)) {
      expect((args[1] as Record<string, unknown>).albumParentKey).toEqual(parentKey)
    }
    expect(calls.slice(1).every((c) => c.content.albumParentKey)).toBe(true)
  })

  it('returns the parent key', async () => {
    setupMedia()
    const { socket } = makeSocket()
    const sendSpy = vi.spyOn(socket, 'sendMessage')
    const key = await sendAlbum(socket, RECIPIENT, items('image', 'image'), { recipient: RECIPIENT })
    expect(key.id).toBe('K1')
    expect(sendSpy).toHaveBeenCalledTimes(3)
  })

  it('builds image children as image content and video children as video content', async () => {
    setupMedia()
    const { socket, calls } = makeSocket()
    await sendAlbum(socket, RECIPIENT, items('image', 'video'), { recipient: RECIPIENT })
    expect(Buffer.isBuffer(calls[1]!.content.image)).toBe(true)
    expect(Buffer.isBuffer(calls[2]!.content.video)).toBe(true)
  })

  it('propagates caption to a child', async () => {
    setupMedia()
    const { socket, calls } = makeSocket()
    const withCaption: AlbumItem[] = [
      { type: 'image', src: 'img-0', caption: 'first' },
      { type: 'image', src: 'img-1' },
    ]
    await sendAlbum(socket, RECIPIENT, withCaption, { recipient: RECIPIENT })
    expect(calls[1]!.content.caption).toBe('first')
    expect(calls[2]!.content.caption).toBeUndefined()
  })

  it('loads media once per child', async () => {
    setupMedia()
    const { socket } = makeSocket()
    await sendAlbum(socket, RECIPIENT, items('image', 'image', 'video'), { recipient: RECIPIENT })
    expect(loadMediaMock).toHaveBeenCalledTimes(3)
  })

  it('applies quoted and mentions to the parent send', async () => {
    setupMedia()
    const { socket, calls } = makeSocket()
    await sendAlbum(socket, RECIPIENT, items('image', 'image'), {
      recipient: RECIPIENT,
      quoted: { id: 'Q', remoteJid: 'r', fromMe: false },
      mentions: ['62822@s.whatsapp.net'],
    })
    expect(calls[0]!.options.quoted).toBeDefined()
    expect((calls[0]!.content.mentions as string[]).length).toBe(1)
  })

  it('throws INVALID_OPTIONS for a single item', async () => {
    setupMedia()
    const { socket } = makeSocket()
    await expect(sendAlbum(socket, RECIPIENT, items('image'), { recipient: RECIPIENT })).rejects.toThrow(
      ZaileysBuilderError,
    )
  })

  it('throws INVALID_OPTIONS for more than 30 items', async () => {
    setupMedia()
    const { socket } = makeSocket()
    const many = Array.from({ length: 31 }, (): AlbumItem => ({ type: 'image', src: 'img-x' }))
    try {
      await sendAlbum(socket, RECIPIENT, many, { recipient: RECIPIENT })
      expect.unreachable()
    } catch (err) {
      expect((err as ZaileysBuilderError).code).toBe('INVALID_OPTIONS')
    }
  })

  it('throws SEND_FAILED and skips children when parent send fails', async () => {
    setupMedia()
    const { socket, calls } = makeSocket({ failParent: true })
    await expect(sendAlbum(socket, RECIPIENT, items('image', 'image'), { recipient: RECIPIENT })).rejects.toThrow(
      ZaileysBuilderError,
    )
    expect(calls).toHaveLength(0)
  })

  it('throws SEND_FAILED with parent key and index when a child fails mid-flight', async () => {
    setupMedia()
    const { socket } = makeSocket({ failChildAt: 1 })
    try {
      await sendAlbum(socket, RECIPIENT, items('image', 'video', 'image'), { recipient: RECIPIENT })
      expect.unreachable()
    } catch (err) {
      const e = err as ZaileysBuilderError
      expect(e.code).toBe('SEND_FAILED')
      const cause = e.cause as { parentKey: { id: string }; index: number }
      expect(cause.parentKey.id).toBe('K1')
      expect(cause.index).toBe(1)
    }
  })

  it('rejects an unknown item type discriminator', async () => {
    setupMedia()
    const { socket } = makeSocket()
    const bad = [
      { type: 'audio', src: 'a' },
      { type: 'image', src: 'img-0' },
    ] as unknown as AlbumItem[]
    await expect(sendAlbum(socket, RECIPIENT, bad, { recipient: RECIPIENT })).rejects.toThrow(ZaileysBuilderError)
  })
})

describe('MessageBuilder.album', () => {
  it('dispatches to the album orchestrator from the terminal and returns parent key', async () => {
    setupMedia()
    const { socket, calls } = makeSocket()
    const key = await MessageBuilder.create(socket, RECIPIENT).album(items('image', 'image', 'video'))
    expect(key.id).toBe('K1')
    expect(calls).toHaveLength(4)
    expect('album' in calls[0]!.content).toBe(true)
  })

  it('forwards chained reply and mentions to the parent send', async () => {
    setupMedia()
    const { socket, calls } = makeSocket()
    await MessageBuilder.create(socket, RECIPIENT)
      .album(items('image', 'video'))
      .reply({ id: 'Q', remoteJid: 'r', fromMe: false })
      .mentions(['62822@s.whatsapp.net'])
    expect(calls[0]!.options.quoted).toBeDefined()
    expect((calls[0]!.content.mentions as string[]).length).toBe(1)
  })
})
