import type { WAMessage, WAMessageKey } from 'baileys'
import { describe, expect, it, vi } from 'vitest'
import { MessageBuilder, type BuilderSocketLike } from '../../src/builder/builder.js'
import { buildListContent } from '../../src/builder/content/list.js'
import { RELAY_CONTENT_KEY } from '../../src/builder/content/buttons.js'
import { ZaileysBuilderError } from '../../src/builder/errors.js'
import { decodeListSelect } from '../../src/events/decoders/interactive.js'
import type { ListOptions } from '../../src/builder/types.js'

const RECIPIENT = '1@s.whatsapp.net'

type SelectSection = { title: string; highlight_label: string; rows: Array<{ header: string; title: string; description: string; id: string }> }
type SelectParams = { title: string; sections: SelectSection[] }

const selectButtonOf = (content: unknown): { name: string; params: SelectParams } => {
  const inner = (content as Record<string, { interactiveMessage?: { nativeFlowMessage?: { buttons?: Array<{ name: string; buttonParamsJson: string }> } } }>)[RELAY_CONTENT_KEY]!
  const button = inner.interactiveMessage!.nativeFlowMessage!.buttons![0]!
  return { name: button.name, params: JSON.parse(button.buttonParamsJson) as SelectParams }
}
const headerOf = (content: unknown): { footer?: { text: string }; header?: { title: string }; body?: { text: string } } =>
  (content as Record<string, { interactiveMessage: { footer?: { text: string }; header?: { title: string }; body?: { text: string } } }>)[RELAY_CONTENT_KEY]!.interactiveMessage

const expectError = (fn: () => unknown, code: string) => {
  try {
    fn()
    expect.unreachable('expected throw')
  } catch (e) {
    expect(e).toBeInstanceOf(ZaileysBuilderError)
    expect((e as ZaileysBuilderError).code).toBe(code)
  }
}

const simple = (): ListOptions => ({
  buttonText: 'Menu',
  sections: [
    {
      title: 'Drinks',
      rows: [
        { id: 'coffee', title: 'Coffee' },
        { id: 'tea', title: 'Tea', description: 'green' },
      ],
    },
  ],
})

describe('buildListContent helper', () => {
  it('emits a single_select nativeFlow button titled by buttonText', () => {
    const { name, params } = selectButtonOf(buildListContent(simple()))
    expect(name).toBe('single_select')
    expect(params.title).toBe('Menu')
    expect(params.sections).toHaveLength(1)
    expect(params.sections[0]!.rows).toHaveLength(2)
    expect(params.sections[0]!.rows[0]).toEqual({ header: '', title: 'Coffee', description: '', id: 'coffee' })
    expect(params.sections[0]!.rows[1]).toEqual({ header: '', title: 'Tea', description: 'green', id: 'tea' })
  })

  it('propagates title (header), description (body), and footer', () => {
    const im = headerOf(buildListContent({ ...simple(), title: 'Order', description: 'Choose', footerText: 'thanks' }))
    expect(im.header?.title).toBe('Order')
    expect(im.body?.text).toBe('Choose')
    expect(im.footer?.text).toBe('thanks')
  })

  it('omits header and footer when not provided', () => {
    const im = headerOf(buildListContent(simple()))
    expect(im.header).toBeUndefined()
    expect(im.footer).toBeUndefined()
  })

  it('falls back to a placeholder body when description is absent', () => {
    const im = headerOf(buildListContent(simple()))
    expect(typeof im.body?.text).toBe('string')
    expect((im.body?.text ?? '').length).toBeGreaterThan(0)
  })

  it('rejects a blank buttonText', () => {
    expectError(() => buildListContent({ ...simple(), buttonText: '  ' }), 'INVALID_OPTIONS')
  })

  it('rejects zero sections', () => {
    expectError(() => buildListContent({ buttonText: 'Menu', sections: [] }), 'INVALID_OPTIONS')
  })

  it('rejects a section with 0 rows', () => {
    expectError(
      () => buildListContent({ buttonText: 'Menu', sections: [{ title: 'Empty', rows: [] }] }),
      'INVALID_OPTIONS',
    )
  })

  it('rejects more than 10 total rows', () => {
    const rows = Array.from({ length: 11 }, (_, i) => ({ id: `r${i}`, title: `Row ${i}` }))
    expectError(
      () => buildListContent({ buttonText: 'Menu', sections: [{ title: 'Big', rows }] }),
      'INVALID_OPTIONS',
    )
  })

  it('rejects a blank row id', () => {
    expectError(
      () => buildListContent({ buttonText: 'Menu', sections: [{ title: 'S', rows: [{ id: '', title: 'X' }] }] }),
      'INVALID_OPTIONS',
    )
  })

  it('rejects duplicate row ids across sections', () => {
    expectError(
      () =>
        buildListContent({
          buttonText: 'Menu',
          sections: [
            { title: 'A', rows: [{ id: 'dup', title: 'X' }] },
            { title: 'B', rows: [{ id: 'dup', title: 'Y' }] },
          ],
        }),
      'INVALID_OPTIONS',
    )
  })

  it('round-trips row id through decodeListSelect (nativeFlow single_select reply)', () => {
    const { params } = selectButtonOf(buildListContent(simple()))
    const sentRowId = params.sections[0]!.rows[1]!.id
    const reply: WAMessage = {
      key: { remoteJid: RECIPIENT, fromMe: false, id: 'R1', participant: '2@s.whatsapp.net' },
      pushName: 'Buyer',
      messageTimestamp: 123,
      message: {
        interactiveResponseMessage: {
          nativeFlowResponseMessage: { name: 'single_select', paramsJson: JSON.stringify({ id: sentRowId }) },
        },
      },
    } as unknown as WAMessage
    const decoded = decodeListSelect(reply, { selfJid: RECIPIENT })
    expect(decoded?.rowId).toBe('tea')
    expect(decoded?.rowId).toBe(sentRowId)
  })
})

describe('MessageBuilder.list()', () => {
  it('relays list content (with the interactive node) and resolves with the key', async () => {
    const relayMessage = vi.fn(async () => 'R1')
    const sendMessage = vi.fn(async () => ({ key: { id: 'X' } as WAMessageKey }) as WAMessage)
    const socket: BuilderSocketLike = { sendMessage, relayMessage, user: { id: '9@s.whatsapp.net' } }
    const key = await MessageBuilder.create(socket, RECIPIENT).list(simple())
    expect(typeof key.id).toBe('string')
    expect(sendMessage).not.toHaveBeenCalled()
    expect(relayMessage).toHaveBeenCalledOnce()
    const [, , opts] = relayMessage.mock.calls[0]! as [string, unknown, { additionalNodes?: unknown[] }]
    expect(opts.additionalNodes).toBeDefined()
  })

  it('does not call socket when list() throws', () => {
    const relayMessage = vi.fn(async () => 'R1')
    const sendMessage = vi.fn(async () => ({ key: { id: 'X' } as WAMessageKey }) as WAMessage)
    const socket: BuilderSocketLike = { sendMessage, relayMessage, user: { id: '9@s.whatsapp.net' } }
    expectError(() => MessageBuilder.create(socket, RECIPIENT).list({ buttonText: '', sections: [] }), 'INVALID_OPTIONS')
    expect(relayMessage).not.toHaveBeenCalled()
    expect(sendMessage).not.toHaveBeenCalled()
  })
})
