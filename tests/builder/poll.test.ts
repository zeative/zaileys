import type { WAMessage, WAMessageKey } from 'baileys'
import { describe, expect, expectTypeOf, it, vi } from 'vitest'
import { MessageBuilder, type BuilderSocketLike } from '../../src/builder/builder.js'
import { buildPollContent, type PollContent } from '../../src/builder/content/poll.js'
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

const asPoll = (content: unknown): PollContent => content as PollContent

describe('buildPollContent helper', () => {
  it('builds a single-select poll by default', () => {
    const content = asPoll(buildPollContent('Fav?', ['a', 'b', 'c', 'd']))
    expect(content.poll.name).toBe('Fav?')
    expect(content.poll.values).toEqual(['a', 'b', 'c', 'd'])
    expect(content.poll.selectableCount).toBe(1)
  })

  it('sets selectableCount to option count when multipleChoice is true', () => {
    const content = asPoll(buildPollContent('Fav?', ['a', 'b', 'c', 'd'], { multipleChoice: true }))
    expect(content.poll.selectableCount).toBe(4)
  })

  it('keeps selectableCount at 1 when multipleChoice is false', () => {
    const content = asPoll(buildPollContent('Fav?', ['a', 'b'], { multipleChoice: false }))
    expect(content.poll.selectableCount).toBe(1)
  })

  it('accepts the minimum of 2 options', () => {
    const content = asPoll(buildPollContent('Q', ['a', 'b']))
    expect(content.poll.values).toHaveLength(2)
  })

  it('accepts the maximum of 12 options', () => {
    const opts = Array.from({ length: 12 }, (_, i) => `o${i}`)
    const content = asPoll(buildPollContent('Q', opts))
    expect(content.poll.values).toHaveLength(12)
  })

  it('rejects a single option with INVALID_OPTIONS', () => {
    expectError(() => buildPollContent('Q', ['only']), 'INVALID_OPTIONS')
  })

  it('rejects 13 options with INVALID_OPTIONS', () => {
    const opts = Array.from({ length: 13 }, (_, i) => `o${i}`)
    expectError(() => buildPollContent('Q', opts), 'INVALID_OPTIONS')
  })

  it('rejects duplicate options with INVALID_OPTIONS', () => {
    expectError(() => buildPollContent('Q', ['a', 'a', 'b']), 'INVALID_OPTIONS')
  })

  it('rejects a blank option with INVALID_OPTIONS', () => {
    expectError(() => buildPollContent('Q', ['a', '   ']), 'INVALID_OPTIONS')
  })

  it('rejects an empty question with EMPTY_CONTENT', () => {
    expectError(() => buildPollContent('', ['a', 'b']), 'EMPTY_CONTENT')
  })

  it('rejects a whitespace-only question with EMPTY_CONTENT', () => {
    expectError(() => buildPollContent('   ', ['a', 'b']), 'EMPTY_CONTENT')
  })
})

describe('MessageBuilder.poll()', () => {
  it('sends poll content and resolves with the key', async () => {
    const { socket, sendMessage } = makeSocket()
    const key = await MessageBuilder.create(socket, RECIPIENT).poll('Q', ['a', 'b'])
    expect(key).toEqual(SENT_KEY)
    const [, content] = sendMessage.mock.calls[0]!
    expect(asPoll(content).poll).toEqual({ name: 'Q', values: ['a', 'b'], selectableCount: 1 })
  })

  it('does not call socket when poll() throws', () => {
    const { socket, sendMessage } = makeSocket()
    expectError(() => MessageBuilder.create(socket, RECIPIENT).poll('Q', ['only']), 'INVALID_OPTIONS')
    expect(sendMessage).not.toHaveBeenCalled()
  })

  it('preserves quoted and mentions through the chain', async () => {
    const { socket, sendMessage } = makeSocket()
    const quoted = { key: SENT_KEY } as WAMessage
    await MessageBuilder.create(socket, RECIPIENT)
      .poll('Q', ['a', 'b'])
      .reply(quoted)
      .mentions(['x@s.whatsapp.net'])
    const [, content, opts] = sendMessage.mock.calls[0]!
    expect((content as { mentions?: string[] }).mentions).toEqual(['x@s.whatsapp.net'])
    expect((opts as { quoted?: unknown }).quoted).toBe(quoted)
  })

  it('returns a content-set builder type', () => {
    const { socket } = makeSocket()
    const builder = MessageBuilder.create(socket, RECIPIENT).poll('Q', ['a', 'b'])
    expectTypeOf(builder).toMatchTypeOf<MessageBuilder<'content-set'>>()
  })
})
