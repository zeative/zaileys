import type { WAMessage, WAMessageKey } from 'baileys'
import { describe, expect, it, vi } from 'vitest'
import { MessageBuilder, type BuilderSocketLike } from '../../src/builder/builder.js'
import { AI_RICH_HTML_PRIMITIVE } from '../../src/builder/content/airich.js'
import { RELAY_CONTENT_KEY } from '../../src/builder/content/buttons.js'
import { buildHtmlAppContent, HTML_APP_MAX_BYTES } from '../../src/builder/content/html-app.js'
import { ZaileysBuilderError } from '../../src/builder/errors.js'
import { html } from '../../src/builder/html.js'

const RECIPIENT = '1@s.whatsapp.net'
const PAGE = '<div id="app">hi</div>'

type Inner = {
  messageContextInfo: { botMetadata: { messageDisclaimerText: string } }
  botForwardedMessage: {
    message: { richResponseMessage: { submessages: unknown[]; unifiedResponse: { data: string } } }
  }
}

const innerOf = (content: unknown): Inner => (content as Record<string, Inner>)[RELAY_CONTENT_KEY]!
const primitivesOf = (content: unknown): Array<Record<string, unknown>> => {
  const data = innerOf(content).botForwardedMessage.message.richResponseMessage.unifiedResponse.data
  const decoded = JSON.parse(Buffer.from(data, 'base64').toString('utf8')) as {
    sections: Array<{ view_model: { primitive: Record<string, unknown> } }>
  }
  return decoded.sections.map((s) => s.view_model.primitive)
}

const codeOf = (fn: () => unknown): string | undefined => {
  try {
    fn()
  } catch (err) {
    if (err instanceof ZaileysBuilderError) return err.code
    throw err
  }
  return undefined
}

describe('buildHtmlAppContent card', () => {
  it('emits a single HTML primitive carrying the markup verbatim', () => {
    const primitives = primitivesOf(buildHtmlAppContent(PAGE))
    expect(primitives).toHaveLength(1)
    expect(primitives[0]).toMatchObject({ __typename: AI_RICH_HTML_PRIMITIVE, payload: PAGE, trusted_sources: [] })
  })

  it('adds no text section, so clients without an HTML renderer get nothing readable', () => {
    const content = buildHtmlAppContent(PAGE)
    expect(innerOf(content).botForwardedMessage.message.richResponseMessage.submessages).toEqual([])
  })

  it('prepends a height lock when height is set', () => {
    const payload = primitivesOf(buildHtmlAppContent(PAGE, { height: 180 }))[0]!['payload'] as string
    const lock = '<style>html,body{margin:0;height:180px;max-height:180px;overflow:hidden}</style>'
    expect(payload.startsWith(lock)).toBe(true)
    expect(payload.endsWith(PAGE)).toBe(true)
  })

  it('puts title in the disclaimer label', () => {
    const content = buildHtmlAppContent(PAGE, { title: 'Struk #A-2291' })
    expect(innerOf(content).messageContextInfo.botMetadata.messageDisclaimerText).toBe('Struk #A-2291')
  })

  it('accepts SafeHtml from the html tag', () => {
    const payload = primitivesOf(buildHtmlAppContent(html`<b>${'<i>'}</b>`))[0]!['payload']
    expect(payload).toBe('<b>&lt;i&gt;</b>')
  })

  it('renders for an android device', () => {
    expect(primitivesOf(buildHtmlAppContent(PAGE, { device: 'android' }))).toHaveLength(1)
  })
})

describe('buildHtmlAppContent devices', () => {
  it.each(['ios', 'web', 'desktop', 'unknown'])('sends fallback text to %s', (device) => {
    expect(buildHtmlAppContent(PAGE, { device, fallback: 'Total Rp54.000' })).toEqual({ text: 'Total Rp54.000' })
  })

  it('throws INVALID_RECIPIENT for a non-android device without fallback', () => {
    expect(codeOf(() => buildHtmlAppContent(PAGE, { device: 'ios' }))).toBe('INVALID_RECIPIENT')
  })

  it('ignores fallback when the device is android', () => {
    expect(primitivesOf(buildHtmlAppContent(PAGE, { device: 'android', fallback: 'x' }))).toHaveLength(1)
  })
})

describe('buildHtmlAppContent validation', () => {
  it('throws EMPTY_CONTENT for blank markup', () => {
    expect(codeOf(() => buildHtmlAppContent('   '))).toBe('EMPTY_CONTENT')
  })

  it.each([0, -1, 1.5, 4097])('throws INVALID_OPTIONS for height %s', (height) => {
    expect(codeOf(() => buildHtmlAppContent(PAGE, { height }))).toBe('INVALID_OPTIONS')
  })

  it('throws INVALID_OPTIONS for a blank fallback', () => {
    expect(codeOf(() => buildHtmlAppContent(PAGE, { device: 'ios', fallback: ' ' }))).toBe('INVALID_OPTIONS')
  })

  it('rejects markup over the default 256 KB limit', () => {
    expect(codeOf(() => buildHtmlAppContent('a'.repeat(HTML_APP_MAX_BYTES + 1)))).toBe('INVALID_OPTIONS')
  })

  it('counts UTF-8 bytes, not characters, against maxBytes', () => {
    expect(codeOf(() => buildHtmlAppContent('é'.repeat(6), { maxBytes: 10 }))).toBe('INVALID_OPTIONS')
    expect(codeOf(() => buildHtmlAppContent('é'.repeat(5), { maxBytes: 10 }))).toBeUndefined()
  })

  it('throws INVALID_OPTIONS for a non-integer maxBytes', () => {
    expect(codeOf(() => buildHtmlAppContent(PAGE, { maxBytes: 0 }))).toBe('INVALID_OPTIONS')
  })
})

describe('MessageBuilder.htmlApp', () => {
  const makeSocket = () => {
    const relayMessage = vi.fn(async () => 'R1')
    const sendMessage = vi.fn(async () => ({ key: { id: 'X' } as WAMessageKey }) as WAMessage)
    const socket: BuilderSocketLike = { sendMessage, relayMessage, user: { id: '9@s.whatsapp.net' } }
    return { socket, relayMessage, sendMessage }
  }

  it('relays the card without the interactive node and with no follow-up edit', async () => {
    const { socket, relayMessage, sendMessage } = makeSocket()
    await MessageBuilder.create(socket, RECIPIENT).htmlApp(PAGE, { height: 120 })
    expect(sendMessage).not.toHaveBeenCalled()
    expect(relayMessage).toHaveBeenCalledOnce()
    type RelayCall = [string, { botForwardedMessage?: unknown }, { additionalNodes?: unknown[] }]
    const [, message, opts] = relayMessage.mock.calls[0]! as unknown as RelayCall
    expect(message.botForwardedMessage).toBeDefined()
    expect(opts.additionalNodes).toBeUndefined()
  })

  it('sends the fallback as plain text for a non-android device', async () => {
    const { socket, relayMessage, sendMessage } = makeSocket()
    await MessageBuilder.create(socket, RECIPIENT).htmlApp(PAGE, { device: 'ios', fallback: 'Total Rp54.000' })
    expect(relayMessage).not.toHaveBeenCalled()
    expect(sendMessage).toHaveBeenCalledOnce()
    const [jid, content] = sendMessage.mock.calls[0]! as unknown as [string, { text?: string }]
    expect(jid).toBe(RECIPIENT)
    expect(content.text).toBe('Total Rp54.000')
  })
})
