import type { WAMessage, WAMessageKey } from 'baileys'
import { describe, expect, it, vi } from 'vitest'
import { MessageBuilder, type BuilderSocketLike } from '../../src/builder/builder.js'
import { buildButtonsContent, type ButtonsContent } from '../../src/builder/content/buttons.js'
import { ZaileysBuilderError } from '../../src/builder/errors.js'
import { decodeButtonClick } from '../../src/events/decoders/interactive.js'
import type { ButtonDef } from '../../src/builder/types.js'

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

const asButtons = (content: unknown): ButtonsContent => content as ButtonsContent

describe('buildButtonsContent helper', () => {
  it('maps 3 buttons to indexed quickReplyButton entries', () => {
    const defs: ButtonDef[] = [
      { id: 'b1', text: 'One' },
      { id: 'b2', text: 'Two' },
      { id: 'b3', text: 'Three' },
    ]
    const content = asButtons(buildButtonsContent(defs))
    expect(content.templateButtons).toHaveLength(3)
    expect(content.templateButtons[0]).toEqual({ index: 1, quickReplyButton: { displayText: 'One', id: 'b1' } })
    expect(content.templateButtons[2]).toEqual({ index: 3, quickReplyButton: { displayText: 'Three', id: 'b3' } })
  })

  it('propagates text and footer when provided', () => {
    const content = asButtons(
      buildButtonsContent([{ id: 'b1', text: 'Go' }], { text: 'Pick one', footer: 'fine print' }),
    )
    expect(content.text).toBe('Pick one')
    expect(content.footer).toBe('fine print')
  })

  it('omits footer when not provided', () => {
    const content = asButtons(buildButtonsContent([{ id: 'b1', text: 'Go' }]))
    expect('footer' in content).toBe(false)
  })

  it('falls back to a placeholder body when text is absent', () => {
    const content = asButtons(buildButtonsContent([{ id: 'b1', text: 'Go' }]))
    expect(typeof content.text).toBe('string')
    expect(content.text.length).toBeGreaterThan(0)
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

  it('round-trips button id through Phase 4 decodeButtonClick (EVT-11)', () => {
    const content = asButtons(buildButtonsContent([{ id: 'order_now', text: 'Order' }]))
    const sentId = content.templateButtons[0]!.quickReplyButton.id
    const reply: WAMessage = {
      key: { remoteJid: RECIPIENT, fromMe: false, id: 'R1', participant: '2@s.whatsapp.net' },
      pushName: 'Buyer',
      messageTimestamp: 123,
      message: {
        buttonsResponseMessage: { selectedButtonId: sentId, selectedDisplayText: 'Order' },
      },
    } as unknown as WAMessage
    const decoded = decodeButtonClick(reply, { selfJid: RECIPIENT })
    expect(decoded?.buttonId).toBe('order_now')
    expect(decoded?.buttonId).toBe(sentId)
  })
})

describe('MessageBuilder.buttons()', () => {
  it('sends button content and resolves with the key', async () => {
    const { socket, sendMessage } = makeSocket()
    const key = await MessageBuilder.create(socket, RECIPIENT).buttons([{ id: 'b1', text: 'Go' }])
    expect(key).toEqual(SENT_KEY)
    const [, content] = sendMessage.mock.calls[0]!
    expect(asButtons(content).templateButtons[0]!.quickReplyButton.id).toBe('b1')
  })

  it('does not call socket when buttons() throws', () => {
    const { socket, sendMessage } = makeSocket()
    expectError(() => MessageBuilder.create(socket, RECIPIENT).buttons([]), 'INVALID_OPTIONS')
    expect(sendMessage).not.toHaveBeenCalled()
  })

  it('chains .buttons(...).reply(quoted) preserving the quote', async () => {
    const { socket, sendMessage } = makeSocket()
    const quoted = { key: SENT_KEY } as WAMessage
    await MessageBuilder.create(socket, RECIPIENT).buttons([{ id: 'b1', text: 'Go' }]).reply(quoted)
    const [, , opts] = sendMessage.mock.calls[0]!
    expect((opts as { quoted?: unknown }).quoted).toBe(quoted)
  })

  it('merges mentions into button content before dispatch', async () => {
    const { socket, sendMessage } = makeSocket()
    await MessageBuilder.create(socket, RECIPIENT)
      .buttons([{ id: 'b1', text: 'Go' }])
      .mentions(['a@s.whatsapp.net'])
    const [, content] = sendMessage.mock.calls[0]!
    expect((content as { mentions?: string[] }).mentions).toEqual(['a@s.whatsapp.net'])
  })
})
