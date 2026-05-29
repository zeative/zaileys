import type { WAMessage, WAMessageKey } from 'baileys'
import { describe, expect, it, vi } from 'vitest'
import { MessageBuilder, type BuilderSocketLike } from '../../src/builder/builder.js'
import { buildListContent, type ListContent } from '../../src/builder/content/list.js'
import { ZaileysBuilderError } from '../../src/builder/errors.js'
import { decodeListSelect } from '../../src/events/decoders/interactive.js'
import type { ListOptions } from '../../src/builder/types.js'

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

const asList = (content: unknown): ListContent => content as ListContent

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
  it('maps a simple section with 2 rows to rowId-keyed rows', () => {
    const content = asList(buildListContent(simple()))
    expect(content.buttonText).toBe('Menu')
    expect(content.sections).toHaveLength(1)
    expect(content.sections[0]!.rows).toHaveLength(2)
    expect(content.sections[0]!.rows[0]).toEqual({ rowId: 'coffee', title: 'Coffee' })
    expect(content.sections[0]!.rows[1]).toEqual({ rowId: 'tea', title: 'Tea', description: 'green' })
  })

  it('propagates title, description, and footer', () => {
    const content = asList(
      buildListContent({ ...simple(), title: 'Order', description: 'Choose', footerText: 'thanks' }),
    )
    expect(content.title).toBe('Order')
    expect(content.text).toBe('Choose')
    expect(content.footer).toBe('thanks')
  })

  it('omits title and footer when not provided', () => {
    const content = asList(buildListContent(simple()))
    expect('title' in content).toBe(false)
    expect('footer' in content).toBe(false)
  })

  it('falls back to a placeholder body when description is absent', () => {
    const content = asList(buildListContent(simple()))
    expect(typeof content.text).toBe('string')
    expect(content.text.length).toBeGreaterThan(0)
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

  it('round-trips row id through Phase 4 decodeListSelect (EVT-12)', () => {
    const content = asList(buildListContent(simple()))
    const sentRowId = content.sections[0]!.rows[1]!.rowId
    const reply: WAMessage = {
      key: { remoteJid: RECIPIENT, fromMe: false, id: 'R1', participant: '2@s.whatsapp.net' },
      pushName: 'Buyer',
      messageTimestamp: 123,
      message: {
        listResponseMessage: { title: 'Tea', singleSelectReply: { selectedRowId: sentRowId } },
      },
    } as unknown as WAMessage
    const decoded = decodeListSelect(reply, { selfJid: RECIPIENT })
    expect(decoded?.rowId).toBe('tea')
    expect(decoded?.rowId).toBe(sentRowId)
  })
})

describe('MessageBuilder.list()', () => {
  it('sends list content and resolves with the key', async () => {
    const { socket, sendMessage } = makeSocket()
    const key = await MessageBuilder.create(socket, RECIPIENT).list(simple())
    expect(key).toEqual(SENT_KEY)
    const [, content] = sendMessage.mock.calls[0]!
    expect(asList(content).sections[0]!.rows[0]!.rowId).toBe('coffee')
  })

  it('does not call socket when list() throws', () => {
    const { socket, sendMessage } = makeSocket()
    expectError(() => MessageBuilder.create(socket, RECIPIENT).list({ buttonText: '', sections: [] }), 'INVALID_OPTIONS')
    expect(sendMessage).not.toHaveBeenCalled()
  })
})
