import { readdirSync, readFileSync, statSync } from 'node:fs'
import { extname, join } from 'node:path'
import type { WAMessage, WAMessageKey } from 'baileys'
import { afterEach, describe, expect, it, vi } from 'vitest'

const loadMediaMock = vi.fn<[unknown], Promise<{ buffer: Buffer; mime: string; size: number }>>()
const toOpusMock = vi.fn<[], Promise<Buffer>>()
const stickerCreateMock = vi.fn<[unknown?], Promise<Buffer>>()

vi.mock('../../src/builder/media-loader.js', () => ({
  loadMedia: (src: unknown) => loadMediaMock(src),
  detectMimeFromBuffer: async () => 'image/jpeg',
}))

vi.mock('../../src/media/index.js', () => ({
  Media: vi.fn(function (this: Record<string, unknown>, input: unknown) {
    this.__input = input
    this.audio = { toOpus: () => toOpusMock() }
    this.sticker = { create: (meta?: unknown) => stickerCreateMock(meta) }
  }),
}))

import { type BuilderSocketLike, MessageBuilder } from '../../src/builder/builder.js'
import { deleteMessage } from '../../src/builder/mutations.js'
import { EditBuilder } from '../../src/builder/edit-builder.js'

const imgBuf = Buffer.from([0xff, 0xd8, 0xff, 0xe0])

type Call = { jid: string; content: Record<string, unknown>; options: Record<string, unknown> }

const makeSocket = () => {
  const calls: Call[] = []
  let n = 0
  const socket: BuilderSocketLike = {
    sendMessage: async (jid, content, options) => {
      n += 1
      calls.push({
        jid,
        content: content as unknown as Record<string, unknown>,
        options: (options ?? {}) as Record<string, unknown>,
      })
      return { key: { id: `m-${n}`, remoteJid: jid, fromMe: true } } as unknown as WAMessage
    },
  }
  return { socket, calls }
}

const setupMedia = () => {
  loadMediaMock.mockImplementation(async (src: unknown) => {
    const tag = String(src)
    if (tag.includes('vid') || Buffer.isBuffer(src)) {
      return { buffer: Buffer.from('VID'), mime: 'video/mp4', size: 3 }
    }
    return { buffer: imgBuf, mime: 'image/jpeg', size: imgBuf.length }
  })
  toOpusMock.mockResolvedValue(Buffer.from('OPUS'))
  stickerCreateMock.mockResolvedValue(Buffer.from('WEBP'))
}

const USER = 'user@s.whatsapp.net'
const GROUP = '120@g.us'

afterEach(() => {
  vi.clearAllMocks()
})

describe('smoke: realistic bot stories', () => {
  it('story 1: bot greets a user with a mention', async () => {
    const { socket, calls } = makeSocket()
    const key = await MessageBuilder.create(socket, GROUP).text('Hi @user').mentions([USER])
    expect(key.id).toBe('m-1')
    expect(calls[0]!.content.text).toBe('Hi @user')
    expect(calls[0]!.content.mentions).toEqual([USER])
  })

  it('story 1b: greeting resolves to a WAMessageKey', async () => {
    const { socket } = makeSocket()
    const key: WAMessageKey = await MessageBuilder.create(socket, GROUP).text('Hello').mentions([USER])
    expect(key.remoteJid).toBe(GROUP)
    expect(key.fromMe).toBe(true)
  })

  it('story 2: bot sends an order receipt image with caption', async () => {
    setupMedia()
    const { socket, calls } = makeSocket()
    const key = await MessageBuilder.create(socket, USER).image('./receipt.jpg', { caption: 'Your order' })
    expect(key.id).toBe('m-1')
    expect(Buffer.isBuffer(calls[0]!.content.image)).toBe(true)
    expect(calls[0]!.content.caption).toBe('Your order')
  })

  it('story 3: bot runs a multi-choice poll', async () => {
    const { socket, calls } = makeSocket()
    const key = await MessageBuilder.create(socket, GROUP).poll(
      'Pizza topping?',
      ['Cheese', 'Pepperoni', 'Veggie'],
      { multipleChoice: true },
    )
    expect(key.id).toBe('m-1')
    const poll = calls[0]!.content.poll as { name: string; values: string[]; selectableCount: number }
    expect(poll.name).toBe('Pizza topping?')
    expect(poll.values).toEqual(['Cheese', 'Pepperoni', 'Veggie'])
    expect(poll.selectableCount).toBe(3)
  })

  it('story 4: bot photoshares an album of 3 items', async () => {
    setupMedia()
    const { socket, calls } = makeSocket()
    const buf1 = Buffer.from('IMG1')
    const buf2 = Buffer.from('IMG2')
    const buf3 = Buffer.from('VID3')
    const parentKey = await MessageBuilder.create(socket, GROUP).album([
      { type: 'image', src: buf1 },
      { type: 'image', src: buf2 },
      { type: 'video', src: buf3 },
    ])
    expect(parentKey.id).toBe('m-1')
    expect(calls).toHaveLength(4)
    expect('album' in calls[0]!.content).toBe(true)
    for (const child of calls.slice(1)) {
      expect(child.content.albumParentKey).toBeDefined()
    }
  })

  it('story 5: bot edits then deletes a message', async () => {
    const { socket, calls } = makeSocket()
    const key = await MessageBuilder.create(socket, USER).text('temp')
    await new EditBuilder(socket, key).text('updated')
    await deleteMessage(socket, key)
    expect(calls).toHaveLength(3)
    expect(calls[1]!.content.text).toBe('updated')
    expect(calls[1]!.content.edit).toEqual(key)
    expect(calls[2]!.content.delete).toEqual(key)
  })

  it('story 5b: edit targets the original message key', async () => {
    const { socket, calls } = makeSocket()
    const key = await MessageBuilder.create(socket, USER).text('temp')
    await new EditBuilder(socket, key).text('fixed')
    expect((calls[1]!.content.edit as WAMessageKey).id).toBe(key.id)
  })

  it('story 6: bot quotes a previous message when replying', async () => {
    const { socket, calls } = makeSocket()
    const original: WAMessageKey = { id: 'orig', remoteJid: USER, fromMe: false }
    await MessageBuilder.create(socket, USER).text('Got it!').reply(original)
    expect(calls[0]!.options.quoted).toEqual({ key: original })
  })

  it('story 7: bot tags everyone in a group announcement', async () => {
    const { socket, calls } = makeSocket()
    await MessageBuilder.create(socket, GROUP).text('Announcement').mentionAll()
    expect(calls[0]!.content.mentionAll).toBe(true)
  })

  it('story 8: bot sends a disappearing reminder', async () => {
    const { socket, calls } = makeSocket()
    await MessageBuilder.create(socket, USER).text('See you soon').disappearing(86400)
    expect(calls[0]!.options.ephemeralExpiration).toBe(86400)
  })
})

describe('zero-any audit', () => {
  it('src/builder contains no any usage', () => {
    const root = join(process.cwd(), 'src', 'builder')
    const tsExts = new Set(['.ts', '.mts', '.cts'])
    const patterns = [/:\s*any\b/, /\bas\s+any\b/, /<any>/, /<\s*any\s*[,>]/, /,\s*any\s*>/]
    const files: string[] = []
    const walk = (dir: string): void => {
      for (const entry of readdirSync(dir)) {
        const full = join(dir, entry)
        if (statSync(full).isDirectory()) {
          walk(full)
          continue
        }
        if (entry.endsWith('.d.ts') || entry.endsWith('.test.ts')) continue
        if (tsExts.has(extname(entry))) files.push(full)
      }
    }
    walk(root)
    expect(files.length).toBeGreaterThan(0)
    const violations: string[] = []
    for (const file of files) {
      const lines = readFileSync(file, 'utf8').split('\n')
      lines.forEach((line, i) => {
        if (patterns.some((p) => p.test(line))) {
          violations.push(`${file}:${i + 1}: ${line.trim()}`)
        }
      })
    }
    expect(violations).toEqual([])
  })
})
