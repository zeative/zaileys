import type { WAMessage, WAMessageKey } from 'baileys'
import { describe, expect, it, vi } from 'vitest'
import { MessageBuilder, type BuilderSocketLike } from '../../src/builder/builder.js'
import { ZaileysBuilderError } from '../../src/builder/errors.js'
import { createInternalState, type BuilderInternalState } from '../../src/builder/state.js'

const RECIPIENT = '1@s.whatsapp.net'
const SENT_KEY: WAMessageKey = { remoteJid: RECIPIENT, fromMe: true, id: 'MSG1' }

const makeSocket = () => {
  const sendMessage = vi.fn(async () => ({ key: SENT_KEY }) as WAMessage)
  const socket: BuilderSocketLike = { sendMessage }
  return { socket, sendMessage }
}

const internalOf = (b: MessageBuilder<'init'>): BuilderInternalState =>
  (b as unknown as { internal: BuilderInternalState }).internal

describe('MessageBuilder.create', () => {
  it('returns a MessageBuilder instance', () => {
    const { socket } = makeSocket()
    const b = MessageBuilder.create(socket, RECIPIENT)
    expect(b).toBeInstanceOf(MessageBuilder)
  })

  it('seeds internal state with the recipient', () => {
    const { socket } = makeSocket()
    const b = MessageBuilder.create(socket, RECIPIENT)
    expect(internalOf(b).recipient).toBe(RECIPIENT)
  })

  it('createInternalState factory only sets recipient', () => {
    const st = createInternalState(RECIPIENT)
    expect(st).toEqual({ recipient: RECIPIENT })
  })
})

describe('context modifiers', () => {
  it('mentions sets the jid list', () => {
    const { socket } = makeSocket()
    const b = MessageBuilder.create(socket, RECIPIENT)
    b.mentions(['a@s.whatsapp.net', 'b@s.whatsapp.net'])
    expect(internalOf(b).mentions).toEqual(['a@s.whatsapp.net', 'b@s.whatsapp.net'])
  })

  it('mentions rejects an empty list', () => {
    const { socket } = makeSocket()
    const b = MessageBuilder.create(socket, RECIPIENT)
    expect(() => b.mentions([])).toThrow(ZaileysBuilderError)
    try {
      b.mentions([])
    } catch (e) {
      expect((e as ZaileysBuilderError).code).toBe('INVALID_OPTIONS')
    }
  })

  it('mentionAll sets the flag', () => {
    const { socket } = makeSocket()
    const b = MessageBuilder.create(socket, RECIPIENT)
    b.mentionAll()
    expect(internalOf(b).mentionAll).toBe(true)
  })

  it('disappearing sets the duration', () => {
    const { socket } = makeSocket()
    const b = MessageBuilder.create(socket, RECIPIENT)
    b.disappearing(86400)
    expect(internalOf(b).disappearingSeconds).toBe(86400)
  })

  it('disappearing rejects zero', () => {
    const { socket } = makeSocket()
    const b = MessageBuilder.create(socket, RECIPIENT)
    expect(() => b.disappearing(0)).toThrow(ZaileysBuilderError)
  })

  it('disappearing rejects negatives', () => {
    const { socket } = makeSocket()
    const b = MessageBuilder.create(socket, RECIPIENT)
    expect(() => b.disappearing(-1)).toThrow(ZaileysBuilderError)
  })

  it('reply sets the quoted reference', () => {
    const { socket } = makeSocket()
    const b = MessageBuilder.create(socket, RECIPIENT)
    const quoted: WAMessageKey = { remoteJid: RECIPIENT, fromMe: false, id: 'SRC' }
    b.reply(quoted)
    expect(internalOf(b).quoted).toBe(quoted)
  })

  it('context modifiers are chainable', () => {
    const { socket } = makeSocket()
    const b = MessageBuilder.create(socket, RECIPIENT)
    const result = b.mentionAll().disappearing(60).mentions(['x@s.whatsapp.net'])
    expect(result).toBeInstanceOf(MessageBuilder)
    expect(internalOf(b).mentionAll).toBe(true)
    expect(internalOf(b).disappearingSeconds).toBe(60)
  })
})

describe('content method skeletons', () => {
  it('text sets content and transitions to content-set', () => {
    const { socket } = makeSocket()
    const b = MessageBuilder.create(socket, RECIPIENT)
    const set = b.text('hi')
    expect(set).toBeInstanceOf(MessageBuilder)
    expect(internalOf(b).content).toEqual({ text: 'hi' })
  })

  it('image sets pending content and transitions to content-set', async () => {
    const { socket } = makeSocket()
    const b = MessageBuilder.create(socket, RECIPIENT)
    const set = b.image(Buffer.from([1, 2, 3]))
    expect(set).toBeInstanceOf(MessageBuilder)
    const pending = internalOf(b).pendingContent
    expect(pending).toBeInstanceOf(Promise)
    await pending
  })
})

describe('then() terminal action', () => {
  it('sends content and resolves with the key', async () => {
    const { socket, sendMessage } = makeSocket()
    const internal = createInternalState(RECIPIENT)
    internal.content = { text: 'hi' }
    const b = new MessageBuilder<'content-set'>(socket, internal)
    const key = await b
    expect(key).toEqual(SENT_KEY)
    expect(sendMessage).toHaveBeenCalledTimes(1)
    expect(sendMessage).toHaveBeenCalledWith(RECIPIENT, { text: 'hi' }, {})
  })

  it('passes quoted + ephemeralExpiration as options', async () => {
    const { socket, sendMessage } = makeSocket()
    const internal = createInternalState(RECIPIENT)
    internal.content = { text: 'hi' }
    internal.quoted = { key: SENT_KEY } as WAMessage
    internal.disappearingSeconds = 3600
    const b = new MessageBuilder<'content-set'>(socket, internal)
    await b
    expect(sendMessage).toHaveBeenCalledWith(RECIPIENT, { text: 'hi' }, {
      quoted: internal.quoted,
      ephemeralExpiration: 3600,
    })
  })

  it('throws EMPTY_CONTENT when no content set', async () => {
    const { socket } = makeSocket()
    const internal = createInternalState(RECIPIENT)
    const b = new MessageBuilder<'content-set'>(socket, internal)
    await expect(Promise.resolve(b)).rejects.toMatchObject({ code: 'EMPTY_CONTENT' })
  })

  it('wraps socket rejection as SEND_FAILED', async () => {
    const sendMessage = vi.fn(async () => {
      throw new Error('network down')
    })
    const socket: BuilderSocketLike = { sendMessage }
    const internal = createInternalState(RECIPIENT)
    internal.content = { text: 'hi' }
    const b = new MessageBuilder<'content-set'>(socket, internal)
    await expect(Promise.resolve(b)).rejects.toMatchObject({ code: 'SEND_FAILED' })
  })

  it('throws SEND_FAILED when socket returns no key', async () => {
    const sendMessage = vi.fn(async () => undefined)
    const socket: BuilderSocketLike = { sendMessage }
    const internal = createInternalState(RECIPIENT)
    internal.content = { text: 'hi' }
    const b = new MessageBuilder<'content-set'>(socket, internal)
    await expect(Promise.resolve(b)).rejects.toMatchObject({ code: 'SEND_FAILED' })
  })
})

describe('state-set sanity', () => {
  it('init builder reports its constructor', () => {
    const { socket } = makeSocket()
    const b = MessageBuilder.create(socket, RECIPIENT)
    expect(b.constructor.name).toBe('MessageBuilder')
  })
})
