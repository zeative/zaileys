import type { WAMessage, WAMessageKey } from 'baileys'
import { describe, expect, it, vi } from 'vitest'
import { MessageBuilder, type BuilderSocketLike } from '../../src/builder/builder.js'
import { RELAY_CONTENT_KEY } from '../../src/builder/content/buttons.js'
import { buildAIRichContent } from '../../src/builder/content/airich.js'
import { ZaileysBuilderError } from '../../src/builder/errors.js'

const RECIPIENT = '1@s.whatsapp.net'

type Section = { view_model: { primitive: Record<string, unknown>; __typename: string } }
type Inner = {
  messageContextInfo: { botMetadata: { messageDisclaimerText: string } }
  botForwardedMessage: { message: { richResponseMessage: { messageType: number; submessages: unknown[]; unifiedResponse: { data: string } } } }
}

const innerOf = (content: unknown): Inner => (content as Record<string, Inner>)[RELAY_CONTENT_KEY]!
const decodeSections = (content: unknown): { response_id: string; sections: Section[] } => {
  const data = innerOf(content).botForwardedMessage.message.richResponseMessage.unifiedResponse.data
  return JSON.parse(Buffer.from(data, 'base64').toString('utf8'))
}
const primitivesOf = (content: unknown): Array<Record<string, unknown>> =>
  decodeSections(content).sections.map((s) => s.view_model.primitive)

describe('buildAIRichContent', () => {
  it('wraps the payload in botForwardedMessage > richResponseMessage with base64 unified data', () => {
    const inner = innerOf(buildAIRichContent([{ type: 'text', text: 'hello' }]))
    expect(inner.botForwardedMessage.message.richResponseMessage.messageType).toBe(1)
    expect(typeof inner.botForwardedMessage.message.richResponseMessage.unifiedResponse.data).toBe('string')
  })

  it('marks the richResponseMessage as a forwarded AI-bot message (required to render)', () => {
    const ctx = (innerOf(buildAIRichContent([{ type: 'text', text: 'hi' }])).botForwardedMessage.message.richResponseMessage as {
      contextInfo?: { isForwarded?: boolean; forwardedAiBotMessageInfo?: { botJid?: string }; forwardOrigin?: number }
    }).contextInfo
    expect(ctx?.isForwarded).toBe(true)
    expect(ctx?.forwardedAiBotMessageInfo?.botJid).toBe('0@bot')
    expect(ctx?.forwardOrigin).toBe(4)
  })

  it('encodes a text section as a GenAIMarkdownTextUXPrimitive', () => {
    const prims = primitivesOf(buildAIRichContent([{ type: 'text', text: 'hi there' }]))
    expect(prims[0]).toMatchObject({ text: 'hi there', __typename: 'GenAIMarkdownTextUXPrimitive' })
  })

  it('extracts a [label](url) hyperlink into inline_entities + a tagged text', () => {
    const prims = primitivesOf(buildAIRichContent([{ type: 'text', text: 'see [GitHub](https://github.com/zeative/zaileys)' }]))
    const prim = prims[0] as { text: string; inline_entities: Array<{ key: string; metadata: Record<string, unknown> }> }
    expect(prim.text).toContain('{{zaileys_HYPERLINK_0}}')
    expect(prim.inline_entities[0]!.metadata).toMatchObject({ display_name: 'GitHub', url: 'https://github.com/zeative/zaileys', __typename: 'GenAIInlineLinkItem' })
  })

  it('extracts a []( ) citation into a GenAISearchCitationItem entity', () => {
    const prims = primitivesOf(buildAIRichContent([{ type: 'text', text: 'fact [](https://src.example)' }]))
    const prim = prims[0] as { inline_entities: Array<{ metadata: Record<string, unknown> }> }
    expect(prim.inline_entities[0]!.metadata).toMatchObject({ reference_url: 'https://src.example', __typename: 'GenAISearchCitationItem' })
  })

  it('encodes a code section as a GenAICodeUXPrimitive with code_blocks', () => {
    const prims = primitivesOf(buildAIRichContent([{ type: 'code', language: 'js', content: 'const x = 1' }]))
    expect(prims[0]).toMatchObject({ language: 'js', __typename: 'GenAICodeUXPrimitive' })
    expect((prims[0] as { code_blocks: Array<{ content: string }> }).code_blocks[0]!.content).toBe('const x = 1')
  })

  it('encodes a table section as a GenATableUXPrimitive with a header row', () => {
    const prims = primitivesOf(buildAIRichContent([{ type: 'table', rows: [['Feature', 'Status'], ['Button', 'Ready']] }]))
    const rows = (prims[0] as { rows: Array<{ is_header: boolean; cells: string[] }>; __typename: string })
    expect(rows.__typename).toBe('GenATableUXPrimitive')
    expect(rows.rows[0]).toMatchObject({ is_header: true, cells: ['Feature', 'Status'] })
    expect(rows.rows[1]).toMatchObject({ is_header: false, cells: ['Button', 'Ready'] })
  })

  it('sets the title as the bot disclaimer and appends the footer as a metadata section', () => {
    const content = buildAIRichContent([{ type: 'text', text: 'body' }], { title: 'My Bot', footer: '#tag' })
    expect(innerOf(content).messageContextInfo.botMetadata.messageDisclaimerText).toBe('My Bot')
    const prims = primitivesOf(content)
    expect(prims[prims.length - 1]).toMatchObject({ text: '#tag', __typename: 'GenAIMetadataTextPrimitive' })
  })

  it('rejects an empty parts list', () => {
    expect(() => buildAIRichContent([])).toThrow(ZaileysBuilderError)
  })

  it('rejects a malformed table', () => {
    expect(() => buildAIRichContent([{ type: 'table', rows: [] }])).toThrow(ZaileysBuilderError)
  })
})

describe('MessageBuilder.aiRich()', () => {
  it('relays the rich response without the biz/interactive node (bot AI format)', async () => {
    const relayMessage = vi.fn(async () => 'R1')
    const sendMessage = vi.fn(async () => ({ key: { id: 'X' } as WAMessageKey }) as WAMessage)
    const socket: BuilderSocketLike = { sendMessage, relayMessage, user: { id: '9@s.whatsapp.net' } }
    await MessageBuilder.create(socket, RECIPIENT).aiRich([{ type: 'text', text: 'hi' }])
    expect(sendMessage).not.toHaveBeenCalled()
    expect(relayMessage).toHaveBeenCalledOnce()
    const [, message, opts] = relayMessage.mock.calls[0]! as [
      string,
      { botForwardedMessage?: unknown },
      { additionalNodes?: unknown[] },
    ]
    expect(message.botForwardedMessage).toBeDefined()
    expect(opts.additionalNodes).toBeUndefined()
  })
})
