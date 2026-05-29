import type { WAMessage } from 'baileys'
import { describe, expect, it, vi } from 'vitest'
import { decodeButtonClick, decodeListSelect } from '../../../src/events/decoders/interactive.js'

const SELF = '628000@s.whatsapp.net'
const DM_KEY = { remoteJid: '628111@s.whatsapp.net', fromMe: false, id: 'MSG1' }
const GROUP_KEY = {
  remoteJid: '123-456@g.us',
  participant: '628222@s.whatsapp.net',
  fromMe: false,
  id: 'MSG2',
}

const ctx = { selfJid: SELF }

const baseMsg = (message: WAMessage['message'], key = DM_KEY): WAMessage =>
  ({ key, message, messageTimestamp: 1700000000 }) as WAMessage

describe('decodeButtonClick', () => {
  it('decodes buttonsResponseMessage happy path', () => {
    const msg = baseMsg({
      buttonsResponseMessage: {
        selectedButtonId: 'btn_yes',
        selectedDisplayText: 'Yes',
      },
    })
    const out = decodeButtonClick(msg, ctx)
    expect(out).not.toBeNull()
    expect(out?.buttonId).toBe('btn_yes')
    expect(out?.buttonText).toBe('Yes')
    expect(out?.key.id).toBe('MSG1')
    expect(out?.timestamp).toBe(1700000000)
  })

  it('decodes templateButtonReplyMessage happy path', () => {
    const msg = baseMsg({
      templateButtonReplyMessage: {
        selectedId: 'tpl_1',
        selectedDisplayText: 'Option One',
        selectedIndex: 0,
      },
    })
    const out = decodeButtonClick(msg, ctx)
    expect(out?.buttonId).toBe('tpl_1')
    expect(out?.buttonText).toBe('Option One')
  })

  it('decodes interactiveResponseMessage with valid paramsJson (quick_reply)', () => {
    const msg = baseMsg({
      interactiveResponseMessage: {
        nativeFlowResponseMessage: {
          name: 'quick_reply',
          paramsJson: JSON.stringify({ id: 'qr_1', display_text: 'Quick' }),
          version: 3,
        },
      },
    })
    const out = decodeButtonClick(msg, ctx)
    expect(out?.buttonId).toBe('qr_1')
    expect(out?.buttonText).toBe('Quick')
  })

  it('decodes interactiveResponseMessage with button_id fallback key', () => {
    const msg = baseMsg({
      interactiveResponseMessage: {
        nativeFlowResponseMessage: {
          name: 'button_click',
          paramsJson: JSON.stringify({ button_id: 'b2' }),
        },
      },
    })
    const out = decodeButtonClick(msg, ctx)
    expect(out?.buttonId).toBe('b2')
    expect(out?.buttonText).toBeUndefined()
  })

  it('returns null and logs debug on malformed paramsJson', () => {
    const logger = {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      fatal: vi.fn(),
    }
    const msg = baseMsg({
      interactiveResponseMessage: {
        nativeFlowResponseMessage: { name: 'quick_reply', paramsJson: '{not-json' },
      },
    })
    const out = decodeButtonClick(msg, { selfJid: SELF, logger })
    expect(out).toBeNull()
    expect(logger.debug).toHaveBeenCalled()
  })

  it('returns null when interactive flow name is not a button flow', () => {
    const msg = baseMsg({
      interactiveResponseMessage: {
        nativeFlowResponseMessage: {
          name: 'list_select',
          paramsJson: JSON.stringify({ id: 'x' }),
        },
      },
    })
    expect(decodeButtonClick(msg, ctx)).toBeNull()
  })

  it('returns null when none of the 3 shapes present', () => {
    const msg = baseMsg({ conversation: 'plain text' })
    expect(decodeButtonClick(msg, ctx)).toBeNull()
  })

  it('returns null when message is absent', () => {
    expect(decodeButtonClick(baseMsg(null), ctx)).toBeNull()
    expect(decodeButtonClick(baseMsg(undefined), ctx)).toBeNull()
  })

  it('returns null when buttonsResponse has no selectedButtonId', () => {
    const msg = baseMsg({ buttonsResponseMessage: { selectedDisplayText: 'x' } })
    expect(decodeButtonClick(msg, ctx)).toBeNull()
  })

  it('resolves group sender from participant', () => {
    const msg = baseMsg(
      { buttonsResponseMessage: { selectedButtonId: 'g1' } },
      GROUP_KEY,
    )
    const out = decodeButtonClick(msg, ctx)
    expect(out?.sender.jid).toBe('628222@s.whatsapp.net')
  })

  it('propagates pushName into sender', () => {
    const msg = {
      key: DM_KEY,
      message: { buttonsResponseMessage: { selectedButtonId: 'p1' } },
      messageTimestamp: 1700000001,
      pushName: 'Alice',
    } as WAMessage
    const out = decodeButtonClick(msg, ctx)
    expect(out?.sender.pushName).toBe('Alice')
  })
})

describe('decodeListSelect', () => {
  it('decodes listResponseMessage happy path', () => {
    const msg = baseMsg({
      listResponseMessage: {
        title: 'Pick one',
        singleSelectReply: { selectedRowId: 'row_1' },
      },
    })
    const out = decodeListSelect(msg, ctx)
    expect(out).not.toBeNull()
    expect(out?.rowId).toBe('row_1')
    expect(out?.title).toBe('Pick one')
    expect(out?.timestamp).toBe(1700000000)
  })

  it('decodes interactiveResponseMessage list_select happy path', () => {
    const msg = baseMsg({
      interactiveResponseMessage: {
        nativeFlowResponseMessage: {
          name: 'list_select',
          paramsJson: JSON.stringify({ row_id: 'r9', title: 'Nine' }),
        },
      },
    })
    const out = decodeListSelect(msg, ctx)
    expect(out?.rowId).toBe('r9')
    expect(out?.title).toBe('Nine')
  })

  it('decodes interactive single_select with id fallback key', () => {
    const msg = baseMsg({
      interactiveResponseMessage: {
        nativeFlowResponseMessage: {
          name: 'single_select',
          paramsJson: JSON.stringify({ id: 'r10' }),
        },
      },
    })
    const out = decodeListSelect(msg, ctx)
    expect(out?.rowId).toBe('r10')
    expect(out?.title).toBeUndefined()
  })

  it('returns null when singleSelectReply missing', () => {
    const msg = baseMsg({ listResponseMessage: { title: 'no reply' } })
    expect(decodeListSelect(msg, ctx)).toBeNull()
  })

  it('returns null when selectedRowId empty', () => {
    const msg = baseMsg({
      listResponseMessage: { singleSelectReply: { selectedRowId: '' } },
    })
    expect(decodeListSelect(msg, ctx)).toBeNull()
  })

  it('returns null and logs debug on malformed paramsJson', () => {
    const logger = {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      fatal: vi.fn(),
    }
    const msg = baseMsg({
      interactiveResponseMessage: {
        nativeFlowResponseMessage: { name: 'list_select', paramsJson: 'oops' },
      },
    })
    expect(decodeListSelect(msg, { selfJid: SELF, logger })).toBeNull()
    expect(logger.debug).toHaveBeenCalled()
  })

  it('returns null when interactive flow name is not a list flow', () => {
    const msg = baseMsg({
      interactiveResponseMessage: {
        nativeFlowResponseMessage: {
          name: 'quick_reply',
          paramsJson: JSON.stringify({ id: 'x' }),
        },
      },
    })
    expect(decodeListSelect(msg, ctx)).toBeNull()
  })

  it('returns null when none present', () => {
    expect(decodeListSelect(baseMsg({ conversation: 'hi' }), ctx)).toBeNull()
    expect(decodeListSelect(baseMsg(null), ctx)).toBeNull()
  })

  it('resolves group sender from participant', () => {
    const msg = baseMsg(
      {
        listResponseMessage: { singleSelectReply: { selectedRowId: 'gr' } },
      },
      GROUP_KEY,
    )
    const out = decodeListSelect(msg, ctx)
    expect(out?.sender.jid).toBe('628222@s.whatsapp.net')
  })
})
