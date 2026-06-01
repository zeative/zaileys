import type { WAMessage, WAMessageKey } from 'baileys'
import { describe, expect, it, vi } from 'vitest'
import { MessageBuilder, type BuilderSocketLike } from '../../src/builder/builder.js'
import { buildButtonsContent, RELAY_CONTENT_KEY } from '../../src/builder/content/buttons.js'
import { ZaileysBuilderError } from '../../src/builder/errors.js'
import { decodeButtonClick } from '../../src/events/decoders/interactive.js'
import type { ButtonDef } from '../../src/builder/types.js'

const RECIPIENT = '1@s.whatsapp.net'
const SENT_KEY: WAMessageKey = { remoteJid: RECIPIENT, fromMe: true, id: 'MSG1' }

type NativeButton = { name: string; buttonParamsJson: string }
type Interactive = {
  body: { text: string }
  footer?: { text: string }
  nativeFlowMessage: { buttons: NativeButton[]; messageParamsJson?: string }
  contextInfo?: { stanzaId?: string; quotedMessage?: unknown }
}
type RelayMessage = { interactiveMessage: Interactive }

const interactiveOf = (content: unknown): Interactive =>
  (content as Record<string, RelayMessage>)[RELAY_CONTENT_KEY]!.interactiveMessage
const buttonsOf = (content: unknown): NativeButton[] => interactiveOf(content).nativeFlowMessage.buttons
const paramsOf = (b: NativeButton): { display_text: string; id: string } => JSON.parse(b.buttonParamsJson)

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

const inboundResponse = (id: string, name = 'quick_reply'): WAMessage =>
  ({
    key: { remoteJid: RECIPIENT, fromMe: false, id: 'R1', participant: '2@s.whatsapp.net' },
    pushName: 'Buyer',
    messageTimestamp: 1700,
    message: {
      interactiveResponseMessage: {
        nativeFlowResponseMessage: { name, paramsJson: JSON.stringify({ id }) },
      },
    },
  }) as unknown as WAMessage

describe('buildButtonsContent — nativeFlow content shape', () => {
  it('wraps the message in a relay sentinel carrying an interactiveMessage', () => {
    const content = buildButtonsContent([{ id: 'b1', text: 'Go' }]) as unknown as Record<string, unknown>
    expect(RELAY_CONTENT_KEY in content).toBe(true)
    expect((content[RELAY_CONTENT_KEY] as RelayMessage).interactiveMessage).toBeDefined()
  })

  it('maps a single button to one quick_reply entry', () => {
    const buttons = buttonsOf(buildButtonsContent([{ id: 'only', text: 'Tap' }]))
    expect(buttons).toHaveLength(1)
    expect(buttons[0]!.name).toBe('quick_reply')
    expect(paramsOf(buttons[0]!)).toEqual({ display_text: 'Tap', id: 'only' })
  })

  it('maps two buttons preserving order and ids', () => {
    const buttons = buttonsOf(buildButtonsContent([
      { id: 'yes', text: 'Yes' },
      { id: 'no', text: 'No' },
    ]))
    expect(buttons).toHaveLength(2)
    expect(paramsOf(buttons[0]!)).toEqual({ display_text: 'Yes', id: 'yes' })
    expect(paramsOf(buttons[1]!)).toEqual({ display_text: 'No', id: 'no' })
  })

  it('maps the maximum three buttons', () => {
    const defs: ButtonDef[] = [
      { id: 'a', text: 'A' },
      { id: 'b', text: 'B' },
      { id: 'c', text: 'C' },
    ]
    const buttons = buttonsOf(buildButtonsContent(defs))
    expect(buttons.map((b) => paramsOf(b).id)).toEqual(['a', 'b', 'c'])
    expect(buttons.every((b) => b.name === 'quick_reply')).toBe(true)
  })

  it('every buttonParamsJson is valid JSON with exactly display_text and id', () => {
    const buttons = buttonsOf(buildButtonsContent([{ id: 'x', text: 'Label X' }]))
    const parsed = paramsOf(buttons[0]!)
    expect(Object.keys(parsed).sort()).toEqual(['display_text', 'id'])
    expect(parsed.display_text).toBe('Label X')
    expect(parsed.id).toBe('x')
  })

  it('sets the body text when provided', () => {
    expect(interactiveOf(buildButtonsContent([{ id: 'b1', text: 'Go' }], { text: 'Choose:' })).body.text).toBe('Choose:')
  })

  it('falls back to a non-empty placeholder body when text is absent', () => {
    const body = interactiveOf(buildButtonsContent([{ id: 'b1', text: 'Go' }])).body
    expect(typeof body.text).toBe('string')
    expect(body.text.length).toBeGreaterThan(0)
  })

  it('sets the footer when provided and omits it otherwise', () => {
    expect(interactiveOf(buildButtonsContent([{ id: 'b1', text: 'Go' }], { footer: 'fine print' })).footer?.text).toBe('fine print')
    expect(interactiveOf(buildButtonsContent([{ id: 'b1', text: 'Go' }])).footer).toBeUndefined()
  })

  it('includes a messageParamsJson string on the nativeFlowMessage', () => {
    expect(typeof interactiveOf(buildButtonsContent([{ id: 'b1', text: 'Go' }])).nativeFlowMessage.messageParamsJson).toBe('string')
  })
})

describe('buildButtonsContent — validation', () => {
  it('rejects an empty array', () => {
    expectError(() => buildButtonsContent([]), 'INVALID_OPTIONS')
  })

  it('rejects more than three buttons', () => {
    expectError(
      () =>
        buildButtonsContent([
          { id: 'a', text: 'A' },
          { id: 'b', text: 'B' },
          { id: 'c', text: 'C' },
          { id: 'd', text: 'D' },
        ]),
      'INVALID_OPTIONS',
    )
  })

  it('rejects a blank button id', () => {
    expectError(() => buildButtonsContent([{ id: '', text: 'Go' }]), 'INVALID_OPTIONS')
  })

  it('rejects whitespace-only button text', () => {
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
})

describe('MessageBuilder.buttons() — relay dispatch', () => {
  it('dispatches via relayMessage, never sendMessage', async () => {
    const { socket, sendMessage, relayMessage } = makeSocket()
    await MessageBuilder.create(socket, RECIPIENT).buttons([{ id: 'b1', text: 'Go' }])
    expect(sendMessage).not.toHaveBeenCalled()
    expect(relayMessage).toHaveBeenCalledOnce()
  })

  it('resolves with a generated key whose id matches the relay messageId', async () => {
    const { socket, relayMessage } = makeSocket()
    const key = await MessageBuilder.create(socket, RECIPIENT).buttons([{ id: 'b1', text: 'Go' }])
    expect(typeof key.id).toBe('string')
    const [jid, , opts] = relayMessage.mock.calls[0]! as [string, RelayMessage, { messageId: string }]
    expect(jid).toBe(RECIPIENT)
    expect(opts.messageId).toBe(key.id)
  })

  it('passes the biz/interactive native_flow additionalNodes so WhatsApp renders the buttons', async () => {
    const { socket, relayMessage } = makeSocket()
    await MessageBuilder.create(socket, RECIPIENT).buttons([{ id: 'b1', text: 'Go' }])
    const [, , opts] = relayMessage.mock.calls[0]! as [
      string,
      RelayMessage,
      { messageId: string; additionalNodes?: Array<{ tag: string; content?: Array<{ tag: string; attrs?: Record<string, string> }> }> },
    ]
    const biz = opts.additionalNodes?.find((n) => n.tag === 'biz')
    expect(biz).toBeDefined()
    const interactive = biz!.content?.find((n) => n.tag === 'interactive')
    expect(interactive?.attrs?.type).toBe('native_flow')
  })

  it('relays an interactiveMessage carrying the developer button ids', async () => {
    const { socket, relayMessage } = makeSocket()
    await MessageBuilder.create(socket, RECIPIENT).buttons([
      { id: 'accept', text: 'Accept' },
      { id: 'reject', text: 'Reject' },
    ])
    const [, message] = relayMessage.mock.calls[0]! as [string, RelayMessage, unknown]
    const ids = message.interactiveMessage.nativeFlowMessage.buttons.map((b) => paramsOf(b).id)
    expect(ids).toEqual(['accept', 'reject'])
  })

  it('does not touch the socket when validation fails', () => {
    const { socket, sendMessage, relayMessage } = makeSocket()
    expectError(() => MessageBuilder.create(socket, RECIPIENT).buttons([]), 'INVALID_OPTIONS')
    expect(sendMessage).not.toHaveBeenCalled()
    expect(relayMessage).not.toHaveBeenCalled()
  })

  it('throws SEND_FAILED when the socket cannot relay', async () => {
    const socket: BuilderSocketLike = { sendMessage: vi.fn(async () => ({ key: SENT_KEY }) as WAMessage) }
    await expect(
      MessageBuilder.create(socket, RECIPIENT).buttons([{ id: 'b1', text: 'Go' }]),
    ).rejects.toMatchObject({ code: 'SEND_FAILED' })
  })

  it('wraps a rejecting relayMessage as SEND_FAILED', async () => {
    const relayMessage = vi.fn(async () => {
      throw new Error('network down')
    })
    const socket: BuilderSocketLike = {
      sendMessage: vi.fn(async () => ({ key: SENT_KEY }) as WAMessage),
      relayMessage,
      user: { id: '9@s.whatsapp.net' },
    }
    await expect(
      MessageBuilder.create(socket, RECIPIENT).buttons([{ id: 'b1', text: 'Go' }]),
    ).rejects.toMatchObject({ code: 'SEND_FAILED' })
  })

  it('resolves a username recipient before relaying', async () => {
    const { socket, relayMessage } = makeSocket()
    const resolve = vi.fn(async () => RECIPIENT)
    await MessageBuilder.create(socket, 'someuser', resolve).buttons([{ id: 'b1', text: 'Go' }])
    expect(resolve).toHaveBeenCalledWith('someuser')
    expect(relayMessage.mock.calls[0]![0]).toBe(RECIPIENT)
  })

  it('applies a full-message quoted reply to the relayed interactiveMessage contextInfo', async () => {
    const { socket, relayMessage } = makeSocket()
    const quoted = {
      key: { remoteJid: RECIPIENT, fromMe: false, id: 'ORIG' },
      message: { conversation: 'original' },
    } as WAMessage
    await MessageBuilder.create(socket, RECIPIENT).buttons([{ id: 'b1', text: 'Go' }]).reply(quoted)
    const [, message] = relayMessage.mock.calls[0]! as [string, RelayMessage, unknown]
    expect(message.interactiveMessage.contextInfo?.stanzaId).toBe('ORIG')
  })

  it('does not throw when replying with a bare key (quote skipped, no content)', async () => {
    const { socket, relayMessage } = makeSocket()
    await MessageBuilder.create(socket, RECIPIENT)
      .buttons([{ id: 'b1', text: 'Go' }])
      .reply({ id: 'Q', remoteJid: 'r@s.whatsapp.net', fromMe: false })
    expect(relayMessage).toHaveBeenCalledOnce()
  })
})

describe('decodeButtonClick — inbound tap responses', () => {
  it('decodes a modern interactiveResponseMessage nativeFlow response', () => {
    const decoded = decodeButtonClick(inboundResponse('order_now'), { selfJid: RECIPIENT })
    expect(decoded?.buttonId).toBe('order_now')
  })

  it('reads the button_id key variant', () => {
    const msg = {
      key: { remoteJid: RECIPIENT, fromMe: false, id: 'R2', participant: '2@s.whatsapp.net' },
      messageTimestamp: 1,
      message: {
        interactiveResponseMessage: {
          nativeFlowResponseMessage: { name: 'quick_reply', paramsJson: JSON.stringify({ button_id: 'alt' }) },
        },
      },
    } as unknown as WAMessage
    expect(decodeButtonClick(msg, { selfJid: RECIPIENT })?.buttonId).toBe('alt')
  })

  it('still decodes legacy buttonsResponseMessage (backward compat)', () => {
    const msg = {
      key: { remoteJid: RECIPIENT, fromMe: false, id: 'R3', participant: '2@s.whatsapp.net' },
      messageTimestamp: 1,
      message: { buttonsResponseMessage: { selectedButtonId: 'legacy', selectedDisplayText: 'Legacy' } },
    } as unknown as WAMessage
    const decoded = decodeButtonClick(msg, { selfJid: RECIPIENT })
    expect(decoded?.buttonId).toBe('legacy')
    expect(decoded?.buttonText).toBe('Legacy')
  })

  it('still decodes legacy templateButtonReplyMessage', () => {
    const msg = {
      key: { remoteJid: RECIPIENT, fromMe: false, id: 'R4', participant: '2@s.whatsapp.net' },
      messageTimestamp: 1,
      message: { templateButtonReplyMessage: { selectedId: 'tmpl', selectedDisplayText: 'Tmpl' } },
    } as unknown as WAMessage
    expect(decodeButtonClick(msg, { selfJid: RECIPIENT })?.buttonId).toBe('tmpl')
  })

  it('returns null for a non-button message', () => {
    const msg = {
      key: { remoteJid: RECIPIENT, fromMe: false, id: 'R5' },
      message: { conversation: 'hi' },
    } as unknown as WAMessage
    expect(decodeButtonClick(msg, { selfJid: RECIPIENT })).toBeNull()
  })

  it('returns null when the flow name is not an allowlisted button flow', () => {
    const msg = {
      key: { remoteJid: RECIPIENT, fromMe: false, id: 'R6', participant: '2@s.whatsapp.net' },
      messageTimestamp: 1,
      message: {
        interactiveResponseMessage: {
          nativeFlowResponseMessage: { name: 'unknown_flow', paramsJson: JSON.stringify({ id: 'x' }) },
        },
      },
    } as unknown as WAMessage
    expect(decodeButtonClick(msg, { selfJid: RECIPIENT })).toBeNull()
  })

  it('returns null without throwing on malformed paramsJson', () => {
    const msg = {
      key: { remoteJid: RECIPIENT, fromMe: false, id: 'R7', participant: '2@s.whatsapp.net' },
      messageTimestamp: 1,
      message: {
        interactiveResponseMessage: {
          nativeFlowResponseMessage: { name: 'quick_reply', paramsJson: '{not valid json' },
        },
      },
    } as unknown as WAMessage
    expect(() => decodeButtonClick(msg, { selfJid: RECIPIENT })).not.toThrow()
    expect(decodeButtonClick(msg, { selfJid: RECIPIENT })).toBeNull()
  })
})

describe('buttons — full outbound→inbound round-trip', () => {
  it('preserves the developer id from buildButtonsContent through decodeButtonClick', () => {
    const sentId = paramsOf(buttonsOf(buildButtonsContent([{ id: 'checkout_42', text: 'Checkout' }]))[0]!).id
    expect(sentId).toBe('checkout_42')
    const decoded = decodeButtonClick(inboundResponse(sentId), { selfJid: RECIPIENT })
    expect(decoded?.buttonId).toBe('checkout_42')
    expect(decoded?.sender.jid).toBe('2@s.whatsapp.net')
  })

  it('round-trips every id when three buttons are sent and one is tapped', () => {
    const buttons = buttonsOf(buildButtonsContent([
      { id: 'one', text: '1' },
      { id: 'two', text: '2' },
      { id: 'three', text: '3' },
    ]))
    for (const b of buttons) {
      const id = paramsOf(b).id
      expect(decodeButtonClick(inboundResponse(id), { selfJid: RECIPIENT })?.buttonId).toBe(id)
    }
  })
})
