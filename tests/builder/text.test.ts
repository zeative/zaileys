import type { WAMessage, WAMessageKey } from 'baileys'
import { describe, expect, it, vi } from 'vitest'
import { MessageBuilder, type BuilderSocketLike } from '../../src/builder/builder.js'
import { buildTextContent } from '../../src/builder/content/text.js'
import { ZaileysBuilderError } from '../../src/builder/errors.js'

const RECIPIENT = '1@s.whatsapp.net'
const SENT_KEY: WAMessageKey = { remoteJid: RECIPIENT, fromMe: true, id: 'MSG1' }

const makeSocket = () => {
  const sendMessage = vi.fn(async () => ({ key: SENT_KEY }) as WAMessage)
  const socket: BuilderSocketLike = { sendMessage }
  return { socket, sendMessage }
}

const expectError = (fn: () => unknown, code: string) => {
  try {
    fn()
    expect.unreachable('expected throw')
  } catch (e) {
    expect(e).toBeInstanceOf(ZaileysBuilderError)
    expect((e as ZaileysBuilderError).code).toBe(code)
  }
}

describe('buildTextContent helper', () => {
  it('wraps a string into { text }', () => {
    expect(buildTextContent('hello')).toEqual({ text: 'hello' })
  })

  it('preserves whitespace inside non-empty text', () => {
    expect(buildTextContent('  hi there  ')).toEqual({ text: '  hi there  ' })
  })

  it('preserves unicode and emoji', () => {
    expect(buildTextContent('halo 👋 dunia')).toEqual({ text: 'halo 👋 dunia' })
  })

  it('rejects empty string with EMPTY_CONTENT', () => {
    expectError(() => buildTextContent(''), 'EMPTY_CONTENT')
  })

  it('rejects whitespace-only string with EMPTY_CONTENT', () => {
    expectError(() => buildTextContent('   '), 'EMPTY_CONTENT')
  })

  it('rejects tab/newline-only string with EMPTY_CONTENT', () => {
    expectError(() => buildTextContent('\t\n  '), 'EMPTY_CONTENT')
  })
})

describe('MessageBuilder.text()', () => {
  it('sends plain text and resolves with the key', async () => {
    const { socket, sendMessage } = makeSocket()
    const key = await MessageBuilder.create(socket, RECIPIENT).text('hello')
    expect(key).toEqual(SENT_KEY)
    expect(sendMessage).toHaveBeenCalledTimes(1)
    expect(sendMessage).toHaveBeenCalledWith(RECIPIENT, { text: 'hello' }, {})
  })

  it('throws EMPTY_CONTENT for empty string', () => {
    const { socket } = makeSocket()
    expectError(() => MessageBuilder.create(socket, RECIPIENT).text(''), 'EMPTY_CONTENT')
  })

  it('throws EMPTY_CONTENT for whitespace-only string', () => {
    const { socket } = makeSocket()
    expectError(() => MessageBuilder.create(socket, RECIPIENT).text('   '), 'EMPTY_CONTENT')
  })

  it('does not call socket when text() throws', () => {
    const { socket, sendMessage } = makeSocket()
    expectError(() => MessageBuilder.create(socket, RECIPIENT).text(''), 'EMPTY_CONTENT')
    expect(sendMessage).not.toHaveBeenCalled()
  })

  it('merges mentions set before text() into content', async () => {
    const { socket, sendMessage } = makeSocket()
    await MessageBuilder.create(socket, RECIPIENT).mentions(['a@s.whatsapp.net']).text('hi @a')
    expect(sendMessage).toHaveBeenCalledWith(
      RECIPIENT,
      { text: 'hi @a', mentions: ['a@s.whatsapp.net'] },
      {},
    )
  })

  it('merges mentions set after text() into content before dispatch', async () => {
    const { socket, sendMessage } = makeSocket()
    await MessageBuilder.create(socket, RECIPIENT).text('hi @a').mentions(['a@s.whatsapp.net'])
    expect(sendMessage).toHaveBeenCalledWith(
      RECIPIENT,
      { text: 'hi @a', mentions: ['a@s.whatsapp.net'] },
      {},
    )
  })

  it('merges mentionAll flag into content', async () => {
    const { socket, sendMessage } = makeSocket()
    await MessageBuilder.create(socket, RECIPIENT).mentionAll().text('hi all')
    expect(sendMessage).toHaveBeenCalledWith(RECIPIENT, { text: 'hi all', mentionAll: true }, {})
  })

  it('merges both mentions and mentionAll into content', async () => {
    const { socket, sendMessage } = makeSocket()
    await MessageBuilder.create(socket, RECIPIENT)
      .mentions(['a@s.whatsapp.net'])
      .mentionAll()
      .text('hi')
    expect(sendMessage).toHaveBeenCalledWith(
      RECIPIENT,
      { text: 'hi', mentions: ['a@s.whatsapp.net'], mentionAll: true },
      {},
    )
  })

  it('omits mentions/mentionAll when none set', async () => {
    const { socket, sendMessage } = makeSocket()
    await MessageBuilder.create(socket, RECIPIENT).text('plain')
    const [, content] = sendMessage.mock.calls[0]!
    expect(content).toEqual({ text: 'plain' })
    expect('mentions' in (content as object)).toBe(false)
    expect('mentionAll' in (content as object)).toBe(false)
  })

  it('propagates reply quoted into options', async () => {
    const { socket, sendMessage } = makeSocket()
    const quoted = { key: SENT_KEY } as WAMessage
    await MessageBuilder.create(socket, RECIPIENT).reply(quoted).text('re')
    const [, , opts] = sendMessage.mock.calls[0]!
    expect((opts as { quoted?: unknown }).quoted).toBe(quoted)
  })

  it('full chain text+reply+mentions resolves to key', async () => {
    const { socket, sendMessage } = makeSocket()
    const quoted = { key: SENT_KEY } as WAMessage
    const key = await MessageBuilder.create(socket, RECIPIENT)
      .text('hi')
      .reply(quoted)
      .mentions(['x@s.whatsapp.net'])
    expect(key).toEqual(SENT_KEY)
    expect(sendMessage).toHaveBeenCalledWith(
      RECIPIENT,
      { text: 'hi', mentions: ['x@s.whatsapp.net'] },
      { quoted },
    )
  })
})
