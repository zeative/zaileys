import type { WAMessage, WAMessageKey } from 'baileys'
import { describe, expect, it, vi } from 'vitest'
import { MessageBuilder, type BuilderSocketLike } from '../../src/builder/builder.js'
import { RELAY_CONTENT_KEY } from '../../src/builder/content/buttons.js'
import { buildAIRichContent } from '../../src/builder/content/airich.js'
import { ZaileysBuilderError } from '../../src/builder/errors.js'

const RECIPIENT = '1@s.whatsapp.net'

type Section = { view_model: { primitive?: Record<string, unknown>; primitives?: Array<Record<string, unknown>>; __typename: string } }
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
  decodeSections(content).sections.map((s) => s.view_model.primitive!)
const layoutsOf = (content: unknown): Section['view_model'][] => decodeSections(content).sections.map((s) => s.view_model)

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

  it('extracts a [expr|w|h]<url> LaTeX entity into a GenAILatexItem', () => {
    const prims = primitivesOf(buildAIRichContent([{ type: 'text', text: 'rumus [E=mc^2|120|40]<https://latex.test/e.png>' }]))
    const prim = prims[0] as { text: string; inline_entities: Array<{ key: string; metadata: Record<string, unknown> }> }
    expect(prim.text).toContain('{{zaileys_LATEX_0}}')
    expect(prim.inline_entities[0]!.metadata).toMatchObject({
      latex_expression: 'E=mc^2',
      latex_image: { url: 'https://latex.test/e.png', width: 120, height: 40 },
      __typename: 'GenAILatexItem',
    })
  })

  it('encodes a code section as a GenAICodeUXPrimitive with syntax-highlighted tokens', () => {
    const prims = primitivesOf(buildAIRichContent([{ type: 'code', language: 'js', content: 'const x = 1' }]))
    expect(prims[0]).toMatchObject({ language: 'js', __typename: 'GenAICodeUXPrimitive' })
    const blocks = (prims[0] as { code_blocks: Array<{ content: string; type: string }> }).code_blocks
    expect(blocks.map((b) => b.content).join('')).toBe('const x = 1')
    expect(blocks[0]).toMatchObject({ content: 'const', type: 'KEYWORD' })
    expect(blocks.some((b) => b.type === 'NUMBER' && b.content === '1')).toBe(true)
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

  it('encodes an image as a GenAIImaginePrimitive (IMAGE) carrying the url', () => {
    const prims = primitivesOf(buildAIRichContent([{ type: 'image', url: 'https://x.test/a.png' }]))
    expect(prims[0]).toMatchObject({ imagine_type: 'IMAGE', media: { url: 'https://x.test/a.png' }, __typename: 'GenAIImaginePrimitive' })
  })

  it('encodes a video as a GenAIImaginePrimitive (ANIMATE) with duration', () => {
    const prims = primitivesOf(buildAIRichContent([{ type: 'video', url: 'https://x.test/v.mp4', duration: 12 }]))
    expect(prims[0]).toMatchObject({ imagine_type: 'ANIMATE', media: { url: 'https://x.test/v.mp4', mime_type: 'video/mp4', duration: 12 } })
  })

  it('encodes a single product as a Single-layout GenAIProductItemCardPrimitive', () => {
    const layouts = layoutsOf(buildAIRichContent([{ type: 'product', products: { title: 'Pizza', price: '$7', salePrice: '$6', image: 'https://x.test/p.png' } }]))
    expect(layouts[0]!.__typename).toBe('GenAISingleLayoutViewModel')
    expect(layouts[0]!.primitive).toMatchObject({ title: 'Pizza', price: '$7', sale_price: '$6', image: { url: 'https://x.test/p.png' }, __typename: 'GenAIProductItemCardPrimitive' })
  })

  it('encodes a product list as an HScroll carousel of product cards', () => {
    const layouts = layoutsOf(buildAIRichContent([{ type: 'product', products: [{ title: 'Pizza', price: '$6' }, { title: 'Ramen', price: '$5' }] }]))
    expect(layouts[0]!.__typename).toBe('GenAIHScrollLayoutViewModel')
    expect(layouts[0]!.primitives).toHaveLength(2)
    expect(layouts[0]!.primitives![1]).toMatchObject({ title: 'Ramen', price: '$5' })
  })

  it('encodes suggestion pills as an ActionRow of follow-up prompts', () => {
    const layouts = layoutsOf(buildAIRichContent([{ type: 'suggest', prompts: ['testrich buttons', 'testrich carousel'] }]))
    expect(layouts[0]!.__typename).toBe('GenAIActionRowLayoutViewModel')
    expect(layouts[0]!.primitives![0]).toMatchObject({ prompt_text: 'testrich buttons', prompt_type: 'SUGGESTED_PROMPT', __typename: 'GenAIFollowUpSuggestionPillPrimitive' })
  })

  it('encodes a tip as a GenAIMetadataTextPrimitive', () => {
    const prims = primitivesOf(buildAIRichContent([{ type: 'tip', text: 'Gunakan testrich <mode>' }]))
    expect(prims[0]).toMatchObject({ text: 'Gunakan testrich <mode>', __typename: 'GenAIMetadataTextPrimitive' })
  })

  it('encodes reels as an HScroll of GenAIReelPrimitive', () => {
    const layouts = layoutsOf(buildAIRichContent([{ type: 'reels', reels: { username: 'zeative', url: 'https://x.test/r.mp4', verified: true } }]))
    expect(layouts[0]!.__typename).toBe('GenAIHScrollLayoutViewModel')
    expect(layouts[0]!.primitives![0]).toMatchObject({ creator: 'zeative', reels_url: 'https://x.test/r.mp4', is_verified: true, __typename: 'GenAIReelPrimitive' })
  })

  it('rejects an empty parts list', () => {
    expect(() => buildAIRichContent([])).toThrow(ZaileysBuilderError)
  })

  it('rejects a malformed table', () => {
    expect(() => buildAIRichContent([{ type: 'table', rows: [] }])).toThrow(ZaileysBuilderError)
  })

  it('rejects an empty product list', () => {
    expect(() => buildAIRichContent([{ type: 'product', products: [] }])).toThrow(ZaileysBuilderError)
  })
})

describe('MessageBuilder.text({ rich: true })', () => {
  it('relays the markdown rich response without the biz/interactive node (bot AI format)', async () => {
    const relayMessage = vi.fn(async () => 'R1')
    const sendMessage = vi.fn(async () => ({ key: { id: 'X' } as WAMessageKey }) as WAMessage)
    const socket: BuilderSocketLike = { sendMessage, relayMessage, user: { id: '9@s.whatsapp.net' } }
    await MessageBuilder.create(socket, RECIPIENT).text('hi', { rich: true })
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

  it('sends a plain text message when rich is omitted', async () => {
    const relayMessage = vi.fn(async () => 'R1')
    const sendMessage = vi.fn(async () => ({ key: { id: 'X' } as WAMessageKey }) as WAMessage)
    const socket: BuilderSocketLike = { sendMessage, relayMessage, user: { id: '9@s.whatsapp.net' } }
    await MessageBuilder.create(socket, RECIPIENT).text('hi')
    expect(relayMessage).not.toHaveBeenCalled()
    expect(sendMessage).toHaveBeenCalledOnce()
  })
})
