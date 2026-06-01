import type { WAMessage, WAMessageKey } from 'baileys'
import { describe, expect, it, vi } from 'vitest'
import { MessageBuilder, type BuilderSocketLike } from '../../src/builder/builder.js'
import { buildButtonsContent, RELAY_CONTENT_KEY } from '../../src/builder/content/buttons.js'
import { ZaileysBuilderError } from '../../src/builder/errors.js'
import { decodeButtonClick } from '../../src/events/decoders/interactive.js'
import type { ButtonDef } from '../../src/builder/types.js'

const RECIPIENT = '1@s.whatsapp.net'
const SENT_KEY: WAMessageKey = { remoteJid: RECIPIENT, fromMe: true, id: 'MSG1' }

const makeSocket = () => {
  const sendMessage = vi.fn(async () => ({ key: SENT_KEY }) as WAMessage)
  const relayMessage = vi.fn(async () => 'RELAY1')
  const socket: BuilderSocketLike = { sendMessage, relayMessage, user: { id: '9@s.whatsapp.net' } }
  return { socket, sendMessage, relayMessage }
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

type NativeButton = { name: string; buttonParamsJson: string }
type Interactive = {
  body: { text: string }
  footer?: { text: string }
  nativeFlowMessage: { buttons: NativeButton[] }
}
const interactiveOf = (content: unknown): Interactive =>
  (content as Record<string, { interactiveMessage: Interactive }>)[RELAY_CONTENT_KEY]!.interactiveMessage
const buttonsOf = (content: unknown): NativeButton[] => interactiveOf(content).nativeFlowMessage.buttons
const paramsOf = (b: NativeButton): { display_text: string; id: string } => JSON.parse(b.buttonParamsJson)

describe('buildButtonsContent helper', () => {
  it('maps 3 buttons to nativeFlow quick_reply entries', () => {
    const defs: ButtonDef[] = [
      { id: 'b1', text: 'One' },
      { id: 'b2', text: 'Two' },
      { id: 'b3', text: 'Three' },
    ]
    const buttons = buttonsOf(buildButtonsContent(defs))
    expect(buttons).toHaveLength(3)
    expect(buttons[0]!.name).toBe('quick_reply')
    expect(paramsOf(buttons[0]!)).toEqual({ display_text: 'One', id: 'b1' })
    expect(paramsOf(buttons[2]!)).toEqual({ display_text: 'Three', id: 'b3' })
  })

  it('propagates text and footer when provided', () => {
    const interactive = interactiveOf(
      buildButtonsContent([{ id: 'b1', text: 'Go' }], { text: 'Pick one', footer: 'fine print' }),
    )
    expect(interactive.body.text).toBe('Pick one')
    expect(interactive.footer?.text).toBe('fine print')
  })

  it('omits footer when not provided', () => {
    const interactive = interactiveOf(buildButtonsContent([{ id: 'b1', text: 'Go' }]))
    expect(interactive.footer).toBeUndefined()
  })

  it('falls back to a placeholder body when text is absent', () => {
    const interactive = interactiveOf(buildButtonsContent([{ id: 'b1', text: 'Go' }]))
    expect(typeof interactive.body.text).toBe('string')
    expect(interactive.body.text.length).toBeGreaterThan(0)
  })

  it('rejects an empty array with INVALID_OPTIONS', () => {
    expectError(() => buildButtonsContent([]), 'INVALID_OPTIONS')
  })

  it('rejects more than 3 buttons with INVALID_OPTIONS', () => {
    const defs: ButtonDef[] = [
      { id: 'b1', text: 'One' },
      { id: 'b2', text: 'Two' },
      { id: 'b3', text: 'Three' },
      { id: 'b4', text: 'Four' },
    ]
    expectError(() => buildButtonsContent(defs), 'INVALID_OPTIONS')
  })

  it('rejects a blank button id', () => {
    expectError(() => buildButtonsContent([{ id: '', text: 'Go' }]), 'INVALID_OPTIONS')
  })

  it('rejects a blank button text', () => {
    expectError(() => buildButtonsContent([{ id: 'b1', text: '   ' }]), 'INVALID_OPTIONS')
  })

  it('rejects duplicate button ids', () => {
    expectError(
      () =>
        buildButtonsContent([
          { id: 'dup', text: 'One' },
          { id: 'dup', text: 'Two' },
        ]),
      'INVALID_OPTIONS',
    )
  })

  it('round-trips button id through Phase 4 decodeButtonClick via interactiveResponseMessage (EVT-11)', () => {
    const sentId = paramsOf(buttonsOf(buildButtonsContent([{ id: 'order_now', text: 'Order' }]))[0]!).id
    const reply: WAMessage = {
      key: { remoteJid: RECIPIENT, fromMe: false, id: 'R1', participant: '2@s.whatsapp.net' },
      pushName: 'Buyer',
      messageTimestamp: 123,
      message: {
        interactiveResponseMessage: {
          nativeFlowResponseMessage: { name: 'quick_reply', paramsJson: JSON.stringify({ id: sentId }) },
        },
      },
    } as unknown as WAMessage
    const decoded = decodeButtonClick(reply, { selfJid: RECIPIENT })
    expect(decoded?.buttonId).toBe('order_now')
    expect(decoded?.buttonId).toBe(sentId)
  })
})

describe('MessageBuilder.buttons()', () => {
  it('relays interactive button content and resolves with the generated key', async () => {
    const { socket, relayMessage, sendMessage } = makeSocket()
    const key = await MessageBuilder.create(socket, RECIPIENT).buttons([{ id: 'b1', text: 'Go' }])
    expect(typeof key.id).toBe('string')
    expect(sendMessage).not.toHaveBeenCalled()
    expect(relayMessage).toHaveBeenCalledOnce()
    const [, message] = relayMessage.mock.calls[0]! as [string, { interactiveMessage: Interactive }, unknown]
    const params = paramsOf(message.interactiveMessage.nativeFlowMessage.buttons[0]!)
    expect(params.id).toBe('b1')
  })

  it('does not call socket when buttons() throws', () => {
    const { socket, sendMessage, relayMessage } = makeSocket()
    expectError(() => MessageBuilder.create(socket, RECIPIENT).buttons([]), 'INVALID_OPTIONS')
    expect(sendMessage).not.toHaveBeenCalled()
    expect(relayMessage).not.toHaveBeenCalled()
  })

  it('throws SEND_FAILED when the socket cannot relay', async () => {
    const sendMessage = vi.fn(async () => ({ key: SENT_KEY }) as WAMessage)
    const socket: BuilderSocketLike = { sendMessage }
    await expect(
      MessageBuilder.create(socket, RECIPIENT).buttons([{ id: 'b1', text: 'Go' }]),
    ).rejects.toBeInstanceOf(ZaileysBuilderError)
  })
})
