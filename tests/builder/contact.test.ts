import { describe, expect, it } from 'vitest'
import { buildContactContent } from '../../src/builder/content/contact.js'
import { ZaileysBuilderError } from '../../src/builder/errors.js'
import { type BuilderSocketLike, MessageBuilder } from '../../src/builder/builder.js'

type Captured = { jid: string; content: Record<string, unknown>; options: Record<string, unknown> }

const makeSocket = (): { socket: BuilderSocketLike; captured: () => Captured } => {
  let last: Captured | undefined
  const socket: BuilderSocketLike = {
    sendMessage: async (jid, content, options) => {
      last = {
        jid,
        content: content as unknown as Record<string, unknown>,
        options: (options ?? {}) as Record<string, unknown>,
      }
      return { key: { id: 'C1', remoteJid: jid, fromMe: true } } as never
    },
  }
  return {
    socket,
    captured: () => {
      if (!last) throw new Error('sendMessage was not called')
      return last
    },
  }
}

const VCARD = 'BEGIN:VCARD\nVERSION:3.0\nFN:Tester\nTEL:+62811\nEND:VCARD'

const contacts = (c: Record<string, unknown>) =>
  (c.contacts as { displayName?: string; contacts: Array<{ vcard: string }> })

describe('buildContactContent', () => {
  it('wraps a minimal vcard into the contacts array', () => {
    const content = buildContactContent(VCARD) as unknown as Record<string, unknown>
    expect(contacts(content).contacts).toHaveLength(1)
    expect(contacts(content).contacts[0]?.vcard).toBe(VCARD)
  })

  it('propagates displayName option', () => {
    const content = buildContactContent(VCARD, { displayName: 'Tester' }) as unknown as Record<string, unknown>
    expect(contacts(content).displayName).toBe('Tester')
  })

  it('omits displayName when not given', () => {
    const content = buildContactContent(VCARD) as unknown as Record<string, unknown>
    expect('displayName' in contacts(content)).toBe(false)
  })

  it('accepts leading whitespace before BEGIN:VCARD', () => {
    expect(() => buildContactContent(`  ${VCARD}`)).not.toThrow()
  })

  it('throws on a vcard without BEGIN:VCARD', () => {
    expect(() => buildContactContent('FN:Tester')).toThrow(ZaileysBuilderError)
  })

  it('throws INVALID_OPTIONS code on empty string', () => {
    try {
      buildContactContent('')
      expect.unreachable()
    } catch (err) {
      expect((err as ZaileysBuilderError).code).toBe('INVALID_OPTIONS')
    }
  })

  it('sends contact through builder terminal', async () => {
    const { socket, captured } = makeSocket()
    const key = await MessageBuilder.create(socket, '62811@s.whatsapp.net').contact(VCARD)
    expect(key.id).toBe('C1')
    expect(contacts(captured().content).contacts[0]?.vcard).toBe(VCARD)
  })

  it('chains with mentions', async () => {
    const { socket, captured } = makeSocket()
    await MessageBuilder.create(socket, '62811@s.whatsapp.net')
      .contact(VCARD)
      .mentions(['62822@s.whatsapp.net'])
    expect((captured().content.mentions as string[]).length).toBe(1)
  })
})
