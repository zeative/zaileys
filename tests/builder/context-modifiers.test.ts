import type { WAMessage, WAMessageKey } from 'baileys'
import { describe, expect, it, vi } from 'vitest'
import { MessageBuilder, type BuilderSocketLike } from '../../src/builder/builder.js'
import { ZaileysBuilderError } from '../../src/builder/errors.js'
import type { BuilderInternalState } from '../../src/builder/state.js'

const RECIPIENT = '1@s.whatsapp.net'
const SENT_KEY: WAMessageKey = { remoteJid: RECIPIENT, fromMe: true, id: 'MSG1' }

const makeSocket = () => {
  const sendMessage = vi.fn(async () => ({ key: SENT_KEY }) as WAMessage)
  const socket: BuilderSocketLike = { sendMessage }
  return { socket, sendMessage }
}

const builder = () => MessageBuilder.create(makeSocket().socket, RECIPIENT)

const internalOf = (b: MessageBuilder<'init'>): BuilderInternalState =>
  (b as unknown as { internal: BuilderInternalState }).internal

const expectError = (fn: () => unknown, code: string, messageSubstr?: string) => {
  try {
    fn()
    expect.unreachable('expected throw')
  } catch (e) {
    expect(e).toBeInstanceOf(ZaileysBuilderError)
    expect((e as ZaileysBuilderError).code).toBe(code)
    if (messageSubstr) {
      expect((e as ZaileysBuilderError).message).toContain(messageSubstr)
    }
  }
}

describe('reply modifier', () => {
  it('stores a WAMessage quoted reference', () => {
    const b = builder()
    const quoted = { key: SENT_KEY, message: {} } as WAMessage
    b.reply(quoted)
    expect(internalOf(b).quoted).toBe(quoted)
  })

  it('stores a WAMessageKey quoted reference', () => {
    const b = builder()
    const quoted: WAMessageKey = { remoteJid: RECIPIENT, fromMe: false, id: 'SRC' }
    b.reply(quoted)
    expect(internalOf(b).quoted).toBe(quoted)
  })

  it('propagates quoted to options regardless of chain order: reply then text', async () => {
    const { socket, sendMessage } = makeSocket()
    const quoted = { key: SENT_KEY } as WAMessage
    await MessageBuilder.create(socket, RECIPIENT).reply(quoted).text('hi')
    const [, , opts] = sendMessage.mock.calls[0]!
    expect((opts as { quoted?: unknown }).quoted).toBe(quoted)
  })

  it('propagates quoted to options regardless of chain order: text then reply', async () => {
    const { socket, sendMessage } = makeSocket()
    const quoted = { key: SENT_KEY } as WAMessage
    await MessageBuilder.create(socket, RECIPIENT).text('hi').reply(quoted)
    const [, , opts] = sendMessage.mock.calls[0]!
    expect((opts as { quoted?: unknown }).quoted).toBe(quoted)
  })

  it('rejects undefined quoted with INVALID_OPTIONS', () => {
    const b = builder()
    expectError(() => b.reply(undefined as unknown as WAMessageKey), 'INVALID_OPTIONS')
  })

  it('rejects null quoted with INVALID_OPTIONS', () => {
    const b = builder()
    expectError(() => b.reply(null as unknown as WAMessageKey), 'INVALID_OPTIONS')
  })

  it('last reply wins when called twice', () => {
    const b = builder()
    const first = { key: SENT_KEY, message: {} } as WAMessage
    const second = { key: { ...SENT_KEY, id: 'OTHER' }, message: {} } as WAMessage
    b.reply(first).reply(second)
    expect(internalOf(b).quoted).toBe(second)
  })
})

describe('mentions modifier', () => {
  it('stores a single jid', () => {
    const b = builder()
    b.mentions(['a@s.whatsapp.net'])
    expect(internalOf(b).mentions).toEqual(['a@s.whatsapp.net'])
  })

  it('stores multiple jids across jid hosts', () => {
    const b = builder()
    b.mentions(['a@s.whatsapp.net', 'b@g.us'])
    expect(internalOf(b).mentions).toEqual(['a@s.whatsapp.net', 'b@g.us'])
  })

  it('rejects an empty array with INVALID_OPTIONS', () => {
    expectError(() => builder().mentions([]), 'INVALID_OPTIONS')
  })

  it('rejects a jid with no @ host', () => {
    expectError(() => builder().mentions(['notajid']), 'INVALID_OPTIONS', 'invalid jid: notajid')
  })

  it('rejects when any jid in the list is invalid', () => {
    expectError(
      () => builder().mentions(['a@s.whatsapp.net', 'bad']),
      'INVALID_OPTIONS',
      'invalid jid: bad',
    )
  })

  it('merges and dedupes across two calls', () => {
    const b = builder()
    b.mentions(['a@s.whatsapp.net']).mentions(['a@s.whatsapp.net', 'b@s.whatsapp.net'])
    expect(internalOf(b).mentions).toEqual(['a@s.whatsapp.net', 'b@s.whatsapp.net'])
  })

  it('does not overwrite previous mentions on a second call', () => {
    const b = builder()
    b.mentions(['a@s.whatsapp.net']).mentions(['c@s.whatsapp.net'])
    expect(internalOf(b).mentions).toEqual(['a@s.whatsapp.net', 'c@s.whatsapp.net'])
  })

  it('persists mentions into outgoing content', async () => {
    const { socket, sendMessage } = makeSocket()
    await MessageBuilder.create(socket, RECIPIENT).mentions(['a@s.whatsapp.net']).text('hi')
    const [, content] = sendMessage.mock.calls[0]!
    expect((content as { mentions?: unknown }).mentions).toEqual(['a@s.whatsapp.net'])
  })

  it('accepts lid and newsletter hosts', () => {
    const b = builder()
    b.mentions(['a@lid', 'b@newsletter'])
    expect(internalOf(b).mentions).toEqual(['a@lid', 'b@newsletter'])
  })
})

describe('mentionAll modifier', () => {
  it('sets the flag', () => {
    const b = builder()
    b.mentionAll()
    expect(internalOf(b).mentionAll).toBe(true)
  })

  it('is idempotent across multiple calls', () => {
    const b = builder()
    b.mentionAll().mentionAll()
    expect(internalOf(b).mentionAll).toBe(true)
  })

  it('coexists with mentions', () => {
    const b = builder()
    b.mentions(['a@s.whatsapp.net']).mentionAll()
    expect(internalOf(b).mentions).toEqual(['a@s.whatsapp.net'])
    expect(internalOf(b).mentionAll).toBe(true)
  })

  it('persists into outgoing content', async () => {
    const { socket, sendMessage } = makeSocket()
    await MessageBuilder.create(socket, RECIPIENT).mentionAll().text('hi')
    const [, content] = sendMessage.mock.calls[0]!
    expect((content as { mentionAll?: unknown }).mentionAll).toBe(true)
  })
})

describe('disappearing modifier', () => {
  it('stores a valid positive duration', () => {
    const b = builder()
    b.disappearing(86400)
    expect(internalOf(b).disappearingSeconds).toBe(86400)
  })

  it('rejects zero with INVALID_OPTIONS', () => {
    expectError(() => builder().disappearing(0), 'INVALID_OPTIONS')
  })

  it('rejects negative values with INVALID_OPTIONS', () => {
    expectError(() => builder().disappearing(-60), 'INVALID_OPTIONS')
  })

  it('rejects non-integer values with INVALID_OPTIONS', () => {
    expectError(() => builder().disappearing(1.5), 'INVALID_OPTIONS')
  })

  it('rejects NaN with INVALID_OPTIONS', () => {
    expectError(() => builder().disappearing(Number.NaN), 'INVALID_OPTIONS')
  })

  it('rejects Infinity with INVALID_OPTIONS', () => {
    expectError(() => builder().disappearing(Number.POSITIVE_INFINITY), 'INVALID_OPTIONS')
  })

  it('accepts the 24h WhatsApp value', () => {
    expect(internalOf(builder().disappearing(86400)).disappearingSeconds).toBe(86400)
  })

  it('accepts the 7-day WhatsApp value', () => {
    expect(internalOf(builder().disappearing(604800)).disappearingSeconds).toBe(604800)
  })

  it('accepts the 90-day WhatsApp value', () => {
    expect(internalOf(builder().disappearing(7776000)).disappearingSeconds).toBe(7776000)
  })

  it('passes ephemeralExpiration into options', async () => {
    const { socket, sendMessage } = makeSocket()
    await MessageBuilder.create(socket, RECIPIENT).disappearing(86400).text('hi')
    const [, , opts] = sendMessage.mock.calls[0]!
    expect((opts as { ephemeralExpiration?: unknown }).ephemeralExpiration).toBe(86400)
  })
})

describe('combined modifier chains', () => {
  it('reply + mentions + disappearing all flow through one send', async () => {
    const { socket, sendMessage } = makeSocket()
    const quoted = { key: SENT_KEY } as WAMessage
    const key = await MessageBuilder.create(socket, RECIPIENT)
      .reply(quoted)
      .mentions(['x@s.whatsapp.net'])
      .disappearing(604800)
      .text('hey')
    expect(key).toEqual(SENT_KEY)
    const [jid, content, opts] = sendMessage.mock.calls[0]!
    expect(jid).toBe(RECIPIENT)
    expect(content).toEqual({ text: 'hey', mentions: ['x@s.whatsapp.net'] })
    expect(opts).toEqual({ quoted, ephemeralExpiration: 604800 })
  })

  it('mentionAll + disappearing + reply flow through one send', async () => {
    const { socket, sendMessage } = makeSocket()
    const quoted = { key: SENT_KEY } as WAMessage
    await MessageBuilder.create(socket, RECIPIENT)
      .mentionAll()
      .disappearing(86400)
      .reply(quoted)
      .text('all')
    const [, content, opts] = sendMessage.mock.calls[0]!
    expect(content).toEqual({ text: 'all', mentionAll: true })
    expect(opts).toEqual({ quoted, ephemeralExpiration: 86400 })
  })
})
