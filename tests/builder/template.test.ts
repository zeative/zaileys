import { describe, expect, it, vi } from 'vitest'
import { buildTemplateContent } from '../../src/builder/content/template.js'
import { ZaileysBuilderError } from '../../src/builder/errors.js'
import { type BuilderSocketLike, MessageBuilder } from '../../src/builder/builder.js'
import { RELAY_CONTENT_KEY } from '../../src/builder/content/buttons.js'

type NativeButton = { name: string; buttonParamsJson: string }
type Interactive = {
  body: { text: string }
  footer?: { text: string }
  nativeFlowMessage: { buttons: NativeButton[] }
}
const interactiveOf = (content: unknown): Interactive =>
  (content as Record<string, { interactiveMessage: Interactive }>)[RELAY_CONTENT_KEY]!.interactiveMessage
const paramsOf = (b: NativeButton): { display_text: string; id: string } => JSON.parse(b.buttonParamsJson)

const makeSocket = () => {
  const relayMessage = vi.fn(async () => 'R1')
  const sendMessage = vi.fn(async () => ({ key: { id: 'T1' } }) as never)
  const socket: BuilderSocketLike = { sendMessage, relayMessage, user: { id: '9@s.whatsapp.net' } }
  return { socket, relayMessage, sendMessage }
}

const BTN = [{ id: 'b1', text: 'One' }]

describe('buildTemplateContent', () => {
  it('maps body into interactive body and buttons into nativeFlow quick_reply', () => {
    const interactive = interactiveOf(buildTemplateContent({ body: 'Hello', buttons: BTN }))
    expect(interactive.body.text).toBe('Hello')
    expect(interactive.nativeFlowMessage.buttons).toHaveLength(1)
    expect(paramsOf(interactive.nativeFlowMessage.buttons[0]!).id).toBe('b1')
  })

  it('prepends header as bold text', () => {
    const interactive = interactiveOf(buildTemplateContent({ header: 'Title', body: 'Body', buttons: BTN }))
    expect(interactive.body.text).toBe('*Title*\n\nBody')
  })

  it('carries footer', () => {
    const interactive = interactiveOf(buildTemplateContent({ body: 'Body', footer: 'Foot', buttons: BTN }))
    expect(interactive.footer?.text).toBe('Foot')
  })

  it('accepts three buttons', () => {
    const buttons = [
      { id: 'a', text: 'A' },
      { id: 'b', text: 'B' },
      { id: 'c', text: 'C' },
    ]
    const interactive = interactiveOf(buildTemplateContent({ body: 'x', buttons }))
    expect(interactive.nativeFlowMessage.buttons).toHaveLength(3)
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

  it('relays template through builder terminal', async () => {
    const { socket, relayMessage } = makeSocket()
    const key = await MessageBuilder.create(socket, '62811@s.whatsapp.net').template({ body: 'Hi', buttons: BTN })
    expect(typeof key.id).toBe('string')
    expect(relayMessage).toHaveBeenCalledOnce()
    const [, message] = relayMessage.mock.calls[0]! as [string, { interactiveMessage: Interactive }, unknown]
    expect(message.interactiveMessage.body.text).toBe('Hi')
  })

  it('chains with reply without throwing', async () => {
    const { socket, relayMessage } = makeSocket()
    await MessageBuilder.create(socket, '62811@s.whatsapp.net')
      .template({ body: 'Hi', buttons: BTN })
      .reply({ id: 'Q', remoteJid: 'r@s.whatsapp.net', fromMe: false })
    expect(relayMessage).toHaveBeenCalledOnce()
  })
})
