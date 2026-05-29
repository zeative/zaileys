import { describe, expect, it } from 'vitest'
import { buildTemplateContent } from '../../src/builder/content/template.js'
import { ZaileysBuilderError } from '../../src/builder/errors.js'
import { type BuilderSocketLike, MessageBuilder } from '../../src/builder/builder.js'
import type { TemplateQuickReplyButton } from '../../src/builder/content/buttons.js'

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
      return { key: { id: 'T1', remoteJid: jid, fromMe: true } } as never
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

const BTN = [{ id: 'b1', text: 'One' }]

const tpl = (c: Record<string, unknown>) =>
  c as { text: string; footer?: string; templateButtons: TemplateQuickReplyButton[] }

describe('buildTemplateContent', () => {
  it('maps body into text and buttons into templateButtons', () => {
    const content = buildTemplateContent({ body: 'Hello', buttons: BTN }) as unknown as Record<string, unknown>
    expect(tpl(content).text).toBe('Hello')
    expect(tpl(content).templateButtons).toHaveLength(1)
    expect(tpl(content).templateButtons[0]?.quickReplyButton.id).toBe('b1')
  })

  it('prepends header as bold text', () => {
    const content = buildTemplateContent({ header: 'Title', body: 'Body', buttons: BTN }) as unknown as Record<string, unknown>
    expect(tpl(content).text).toBe('*Title*\n\nBody')
  })

  it('carries footer', () => {
    const content = buildTemplateContent({ body: 'Body', footer: 'Foot', buttons: BTN }) as unknown as Record<string, unknown>
    expect(tpl(content).footer).toBe('Foot')
  })

  it('accepts three buttons', () => {
    const buttons = [
      { id: 'a', text: 'A' },
      { id: 'b', text: 'B' },
      { id: 'c', text: 'C' },
    ]
    const content = buildTemplateContent({ body: 'x', buttons }) as unknown as Record<string, unknown>
    expect(tpl(content).templateButtons).toHaveLength(3)
  })

  it('throws on empty body', () => {
    expect(() => buildTemplateContent({ body: '   ', buttons: BTN })).toThrow(ZaileysBuilderError)
  })

  it('throws on zero buttons', () => {
    expect(() => buildTemplateContent({ body: 'x', buttons: [] })).toThrow(ZaileysBuilderError)
  })

  it('throws on more than three buttons', () => {
    const buttons = [
      { id: 'a', text: 'A' },
      { id: 'b', text: 'B' },
      { id: 'c', text: 'C' },
      { id: 'd', text: 'D' },
    ]
    try {
      buildTemplateContent({ body: 'x', buttons })
      expect.unreachable()
    } catch (err) {
      expect((err as ZaileysBuilderError).code).toBe('INVALID_OPTIONS')
    }
  })

  it('sends template through builder terminal', async () => {
    const { socket, captured } = makeSocket()
    const key = await MessageBuilder.create(socket, '62811@s.whatsapp.net').template({ body: 'Hi', buttons: BTN })
    expect(key.id).toBe('T1')
    expect(tpl(captured().content).text).toBe('Hi')
  })

  it('chains with reply and mentions', async () => {
    const { socket, captured } = makeSocket()
    await MessageBuilder.create(socket, '62811@s.whatsapp.net')
      .template({ body: 'Hi', buttons: BTN })
      .reply({ id: 'Q', remoteJid: 'r', fromMe: false })
      .mentions(['62822@s.whatsapp.net'])
    expect(captured().options.quoted).toBeDefined()
    expect((captured().content.mentions as string[]).length).toBe(1)
  })
})
