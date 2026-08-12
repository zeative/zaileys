import type { WAMessage, WAMessageKey } from 'baileys'
import { describe, expect, expectTypeOf, it, vi } from 'vitest'
import { MessageBuilder, type BuilderSocketLike } from '../../src/builder/builder.js'
import {
  buildGroupStatusContent,
  buildGroupStatusRepost,
  parseStatusArgb,
  resolveStatusFont,
} from '../../src/builder/content/group-status.js'
import { RELAY_CONTENT_KEY, RELAY_REQUIRE_GROUP_KEY } from '../../src/builder/content/buttons.js'
import { ZaileysBuilderError } from '../../src/builder/errors.js'

type ExtendedText = { text: string; backgroundArgb?: number; font?: number }

const innerOf = (content: unknown): Record<string, Record<string, unknown>> =>
  (content as Record<string, { groupStatusMessageV2: { message: Record<string, Record<string, unknown>> } }>)[
    RELAY_CONTENT_KEY
  ]!.groupStatusMessageV2.message

const statusOf = (content: unknown): ExtendedText =>
  innerOf(content)['extendedTextMessage'] as unknown as ExtendedText

const expectError = (fn: () => unknown, code: string) => {
  try {
    fn()
    expect.unreachable('expected throw')
  } catch (e) {
    expect(e).toBeInstanceOf(ZaileysBuilderError)
    expect((e as ZaileysBuilderError).code).toBe(code)
  }
}

describe('parseStatusArgb', () => {
  it('expands #RGB as CSS shorthand', () => {
    expect(parseStatusArgb('#f00')).toBe(0xffff0000)
  })

  it('accepts 6-digit hex with and without the hash', () => {
    expect(parseStatusArgb('#FF0000')).toBe(0xffff0000)
    expect(parseStatusArgb('FF0000')).toBe(0xffff0000)
  })

  it('preserves alpha on 8-digit hex', () => {
    expect(parseStatusArgb('#80FF0000')).toBe(0x80ff0000)
  })

  it('passes a positive integer through', () => {
    expect(parseStatusArgb(0xff00ff00)).toBe(0xff00ff00)
  })

  it('honours zero instead of dropping it', () => {
    expect(parseStatusArgb(0)).toBe(0)
  })

  it('wraps a negative integer into unsigned ARGB', () => {
    expect(parseStatusArgb(-1)).toBe(0xffffffff)
  })

  it('rejects malformed hex, out-of-range and non-integer values', () => {
    for (const bad of ['#12', 'zzzzzz', '1234567', '', 1.5, Number.NaN, Number.POSITIVE_INFINITY, 0x100000000]) {
      expectError(() => parseStatusArgb(bad as string | number), 'INVALID_OPTIONS')
    }
  })
})

describe('resolveStatusFont', () => {
  it('maps named fonts to their FontType value', () => {
    expect(resolveStatusFont('system')).toBe(0)
    expect(resolveStatusFont('system-text')).toBe(1)
    expect(resolveStatusFont('fb-script')).toBe(2)
    expect(resolveStatusFont('system-bold')).toBe(6)
    expect(resolveStatusFont('morningbreeze')).toBe(7)
    expect(resolveStatusFont('calistoga')).toBe(8)
    expect(resolveStatusFont('exo2')).toBe(9)
    expect(resolveStatusFont('courierprime')).toBe(10)
  })

  it('passes a raw non-negative integer through for forward compatibility', () => {
    expect(resolveStatusFont(9)).toBe(9)
    expect(resolveStatusFont(99)).toBe(99)
  })

  it('rejects unknown names and invalid numbers', () => {
    expectError(() => resolveStatusFont('comic-sans' as 'system'), 'INVALID_OPTIONS')
    expectError(() => resolveStatusFont(-1), 'INVALID_OPTIONS')
    expectError(() => resolveStatusFont(2.5), 'INVALID_OPTIONS')
  })
})

describe('buildGroupStatusContent', () => {
  it('wraps the text in a groupStatusMessageV2 relay envelope', () => {
    const content = buildGroupStatusContent('halo')
    expect(statusOf(content).text).toBe('halo')
  })

  it('marks the content as group-only', () => {
    const content = buildGroupStatusContent('halo') as unknown as Record<string, unknown>
    expect(content[RELAY_REQUIRE_GROUP_KEY]).toBe('groupStatus()')
  })

  it('omits backgroundArgb and font entirely when no options are given', () => {
    const node = statusOf(buildGroupStatusContent('halo'))
    expect('backgroundArgb' in node).toBe(false)
    expect('font' in node).toBe(false)
  })

  it('applies backgroundColor and font when given', () => {
    const node = statusOf(buildGroupStatusContent('halo', { backgroundColor: '#25D366', font: 'calistoga' }))
    expect(node.backgroundArgb).toBe(0xff25d366)
    expect(node.font).toBe(8)
  })

  it('emits backgroundArgb 0 and font 0 rather than dropping them', () => {
    const node = statusOf(buildGroupStatusContent('halo', { backgroundColor: 0, font: 'system' }))
    expect(node.backgroundArgb).toBe(0)
    expect(node.font).toBe(0)
  })

  it('rejects blank or non-string text', () => {
    expectError(() => buildGroupStatusContent(''), 'EMPTY_CONTENT')
    expectError(() => buildGroupStatusContent('   '), 'EMPTY_CONTENT')
    expectError(() => buildGroupStatusContent(undefined as unknown as string), 'EMPTY_CONTENT')
  })
})

const MEDIA_KEY = Buffer.alloc(32, 7)
const FILE_ENC_SHA = Buffer.alloc(32, 2)

const msg = (content: Record<string, unknown>): WAMessage =>
  ({ key: { id: 'SRC1', remoteJid: '1@s.whatsapp.net', fromMe: false }, message: content }) as unknown as WAMessage

const imageSource = (extra: Record<string, unknown> = {}): WAMessage =>
  msg({
    imageMessage: {
      url: 'https://mmg.whatsapp.net/v/t62/abc',
      directPath: '/v/t62/abc',
      mediaKey: MEDIA_KEY,
      fileEncSha256: FILE_ENC_SHA,
      fileLength: 12345,
      mimetype: 'image/jpeg',
      caption: 'asli',
      ...extra,
    },
  })

describe('buildGroupStatusRepost', () => {
  it('copies the media pointers byte-identically without re-upload', () => {
    const node = innerOf(buildGroupStatusRepost(imageSource()))['imageMessage']!
    expect(node['directPath']).toBe('/v/t62/abc')
    expect(node['url']).toBe('https://mmg.whatsapp.net/v/t62/abc')
    expect(Buffer.from(node['mediaKey'] as Uint8Array)).toEqual(MEDIA_KEY)
    expect(Buffer.from(node['fileEncSha256'] as Uint8Array)).toEqual(FILE_ENC_SHA)
  })

  it('marks the reposted content as group-only', () => {
    const content = buildGroupStatusRepost(imageSource()) as unknown as Record<string, unknown>
    expect(content[RELAY_REQUIRE_GROUP_KEY]).toBe('groupStatus()')
  })

  it('strips viewOnce from the copy', () => {
    const node = innerOf(buildGroupStatusRepost(imageSource({ viewOnce: true })))['imageMessage']!
    expect(node['viewOnce']).toBeFalsy()
  })

  it('resets inherited contextInfo so quote chains do not leak', () => {
    const source = imageSource({
      contextInfo: { stanzaId: 'QUOTED1', forwardingScore: 4, isForwarded: true },
    })
    const node = innerOf(buildGroupStatusRepost(source))['imageMessage']!
    const ctx = node['contextInfo'] as Record<string, unknown> | undefined
    expect(ctx?.['stanzaId']).toBeFalsy()
    expect(ctx?.['forwardingScore']).toBeFalsy()
    expect(ctx?.['isForwarded']).toBeFalsy()
  })

  it('does not mutate the source message', () => {
    const source = imageSource({ viewOnce: true })
    buildGroupStatusRepost(source)
    const original = (source.message as unknown as Record<string, Record<string, unknown>>)['imageMessage']!
    expect(original['viewOnce']).toBe(true)
    expect(original['caption']).toBe('asli')
  })

  it('overrides the caption when asked', () => {
    const node = innerOf(buildGroupStatusRepost(imageSource(), { caption: 'baru' }))['imageMessage']!
    expect(node['caption']).toBe('baru')
  })

  it('normalises a plain conversation into extendedTextMessage', () => {
    const node = innerOf(buildGroupStatusRepost(msg({ conversation: 'halo' })))
    expect((node['extendedTextMessage'] as Record<string, unknown>)['text']).toBe('halo')
    expect(node['conversation']).toBeUndefined()
  })

  it('accepts video and voice notes', () => {
    const video = innerOf(buildGroupStatusRepost(msg({ videoMessage: { directPath: '/v', mimetype: 'video/mp4' } })))
    expect(video['videoMessage']).toBeDefined()
    const voice = innerOf(buildGroupStatusRepost(msg({ audioMessage: { directPath: '/a', ptt: true } })))
    expect((voice['audioMessage'] as Record<string, unknown>)['ptt']).toBe(true)
  })

  it('unwraps a source that is already a group status instead of double nesting', () => {
    const source = msg({ groupStatusMessageV2: { message: { conversation: 'halo' } } })
    const node = innerOf(buildGroupStatusRepost(source))
    expect(node['groupStatusMessageV2']).toBeUndefined()
    expect((node['extendedTextMessage'] as Record<string, unknown>)['text']).toBe('halo')
  })

  it('unwraps a viewOnce envelope', () => {
    const source = msg({ viewOnceMessageV2: { message: { imageMessage: { directPath: '/v', viewOnce: true } } } })
    const node = innerOf(buildGroupStatusRepost(source))['imageMessage']!
    expect(node['directPath']).toBe('/v')
    expect(node['viewOnce']).toBeFalsy()
  })

  it('accepts a MessageContext-shaped source via message()', () => {
    const source = imageSource()
    const ctxLike = { message: () => source }
    const node = innerOf(buildGroupStatusRepost(ctxLike))['imageMessage']!
    expect(node['directPath']).toBe('/v/t62/abc')
  })

  it('rejects content types a status cannot carry', () => {
    expectError(() => buildGroupStatusRepost(msg({ stickerMessage: { directPath: '/s' } })), 'INVALID_OPTIONS')
    expectError(() => buildGroupStatusRepost(msg({ documentMessage: { directPath: '/d' } })), 'INVALID_OPTIONS')
    expectError(() => buildGroupStatusRepost(msg({ locationMessage: { degreesLatitude: 1 } })), 'INVALID_OPTIONS')
  })

  it('rejects a source with no usable content', () => {
    expectError(() => buildGroupStatusRepost(msg({})), 'EMPTY_CONTENT')
    expectError(() => buildGroupStatusRepost({ key: {}, message: null } as unknown as WAMessage), 'EMPTY_CONTENT')
  })
})

const GROUP = '120363000000000000@g.us'
const DM = '628999@s.whatsapp.net'
const SENT_KEY: WAMessageKey = { remoteJid: GROUP, fromMe: true, id: 'MSG1' }

const makeSocket = () => {
  const sendMessage = vi.fn(async () => ({ key: SENT_KEY }) as WAMessage)
  const relayMessage = vi.fn(async () => 'RELAY1')
  const socket: BuilderSocketLike = { sendMessage, relayMessage, user: { id: '9@s.whatsapp.net' } }
  return { socket, sendMessage, relayMessage }
}

type Relayed = Record<string, Record<string, unknown>> & {
  messageContextInfo?: { messageSecret?: Uint8Array }
  groupStatusMessageV2?: { message: Record<string, Record<string, unknown>> }
}

const relayedOf = (relayMessage: ReturnType<typeof makeSocket>['relayMessage']): Relayed =>
  relayMessage.mock.calls[0]![1] as unknown as Relayed

const expectRejects = async (p: Promise<unknown>, code: string) => {
  await expect(p).rejects.toMatchObject({ name: 'ZaileysBuilderError', code })
}

describe('MessageBuilder.groupStatus()', () => {
  it('relays to a group and never calls sendMessage', async () => {
    const { socket, sendMessage, relayMessage } = makeSocket()
    const key = await MessageBuilder.create(socket, GROUP).groupStatus('halo')
    expect(sendMessage).not.toHaveBeenCalled()
    expect(relayMessage).toHaveBeenCalledOnce()
    const [jid, , options] = relayMessage.mock.calls[0]! as [string, unknown, { messageId: string }]
    expect(jid).toBe(GROUP)
    expect(options.messageId).toBe(key.id)
  })

  it('sends without additionalNodes because it is not interactive', async () => {
    const { socket, relayMessage } = makeSocket()
    await MessageBuilder.create(socket, GROUP).groupStatus('halo')
    const options = relayMessage.mock.calls[0]![2] as Record<string, unknown>
    expect(Object.keys(options)).toEqual(['messageId'])
  })

  it('carries the text through to the relayed envelope', async () => {
    const { socket, relayMessage } = makeSocket()
    await MessageBuilder.create(socket, GROUP).groupStatus('halo', { backgroundColor: '#25D366' })
    const node = relayedOf(relayMessage).groupStatusMessageV2!.message['extendedTextMessage']!
    expect(node['text']).toBe('halo')
    expect(node['backgroundArgb']).toBe(0xff25d366)
  })

  it('rejects non-group recipients', async () => {
    for (const jid of [DM, 'x@lid', 'status@broadcast']) {
      const { socket, relayMessage } = makeSocket()
      await expectRejects(MessageBuilder.create(socket, jid).groupStatus('halo'), 'INVALID_RECIPIENT')
      expect(relayMessage).not.toHaveBeenCalled()
    }
  })

  it('validates the recipient after username resolution, not before', async () => {
    const { socket, relayMessage } = makeSocket()
    const key = await MessageBuilder.create(socket, 'namagrup', async () => GROUP).groupStatus('halo')
    expect(key.id).toBeDefined()
    expect(relayMessage).toHaveBeenCalledOnce()
  })

  it('puts messageSecret at the top level and not inside the envelope', async () => {
    const { socket, relayMessage } = makeSocket()
    await MessageBuilder.create(socket, GROUP).groupStatus('halo')
    const relayed = relayedOf(relayMessage)
    expect(relayed.messageContextInfo?.messageSecret?.length).toBe(32)
    expect(relayed.groupStatusMessageV2!.message['messageContextInfo']).toBeUndefined()
  })

  it('applies mentions and disappearing to the inner node', async () => {
    const { socket, relayMessage } = makeSocket()
    await MessageBuilder.create(socket, GROUP)
      .groupStatus('halo')
      .mentions(['628111@s.whatsapp.net'])
      .disappearing(60)
    const ctx = relayedOf(relayMessage).groupStatusMessageV2!.message['extendedTextMessage']![
      'contextInfo'
    ] as Record<string, unknown>
    expect(ctx['mentionedJid']).toEqual(['628111@s.whatsapp.net'])
    expect(ctx['expiration']).toBe(60)
  })

  it('reposts a message through the same method', async () => {
    const { socket, relayMessage } = makeSocket()
    await MessageBuilder.create(socket, GROUP).groupStatus(imageSource())
    const node = relayedOf(relayMessage).groupStatusMessageV2!.message['imageMessage']!
    expect(node['directPath']).toBe('/v/t62/abc')
    expect(Buffer.from(node['mediaKey'] as Uint8Array)).toEqual(MEDIA_KEY)
  })

  it('reposts from a MessageContext-shaped source', async () => {
    const { socket, relayMessage } = makeSocket()
    const source = imageSource()
    await MessageBuilder.create(socket, GROUP).groupStatus({ message: () => source })
    expect(relayedOf(relayMessage).groupStatusMessageV2!.message['imageMessage']).toBeDefined()
  })

  it('records the sent message', async () => {
    const { socket } = makeSocket()
    const recordSent = vi.fn()
    await MessageBuilder.create(socket, GROUP, undefined, recordSent).groupStatus('halo')
    expect(recordSent).toHaveBeenCalledOnce()
  })

  it('fails when the socket cannot relay', async () => {
    const socket: BuilderSocketLike = { sendMessage: async () => undefined }
    await expectRejects(MessageBuilder.create(socket, GROUP).groupStatus('halo'), 'SEND_FAILED')
  })

  it('wraps a relay rejection as SEND_FAILED with the cause', async () => {
    const boom = new Error('boom')
    const socket: BuilderSocketLike = {
      sendMessage: async () => undefined,
      relayMessage: async () => {
        throw boom
      },
      user: { id: '9@s.whatsapp.net' },
    }
    const err = await MessageBuilder.create(socket, GROUP)
      .groupStatus('halo')
      .then(
        () => null,
        (e: unknown) => e,
      )
    expect((err as { cause?: unknown }).cause).toBe(boom)
  })

  it('transitions the builder into the content-set state', () => {
    const { socket } = makeSocket()
    const set = MessageBuilder.create(socket, GROUP).groupStatus('halo')
    expectTypeOf(set).toMatchTypeOf<MessageBuilder<'content-set'>>()
    // @ts-expect-error content can only be set once
    set.groupStatus('lagi')
  })
})
