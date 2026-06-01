import type { WAMessage, WAMessageKey } from 'baileys'
import { describe, expect, it, vi } from 'vitest'
import { MessageBuilder, type BuilderSocketLike } from '../../src/builder/builder.js'
import { RELAY_CONTENT_KEY } from '../../src/builder/content/buttons.js'
import { buildCarouselContent, RELAY_CARDS_MEDIA_KEY } from '../../src/builder/content/carousel.js'
import { ZaileysBuilderError } from '../../src/builder/errors.js'

const RECIPIENT = '1@s.whatsapp.net'
const SENT_KEY: WAMessageKey = { remoteJid: RECIPIENT, fromMe: true, id: 'MSG1' }

type Card = {
  body?: { text: string }
  footer?: { text: string }
  header?: { title?: string; subtitle?: string; hasMediaAttachment?: boolean }
  nativeFlowMessage?: { buttons: Array<{ name: string; buttonParamsJson: string }> }
}
type Interactive = { body: { text: string }; carouselMessage: { cards: Card[] } }
const interactiveOf = (content: unknown): Interactive =>
  (content as Record<string, { interactiveMessage: Interactive }>)[RELAY_CONTENT_KEY]!.interactiveMessage

const makeSocket = () => {
  const relayMessage = vi.fn(async () => 'R1')
  const sendMessage = vi.fn(async () => ({ key: SENT_KEY }) as WAMessage)
  const socket: BuilderSocketLike = { sendMessage, relayMessage, user: { id: '9@s.whatsapp.net' } }
  return { socket, relayMessage, sendMessage }
}

describe('buildCarouselContent', () => {
  it('builds a carouselMessage with one interactive card per entry', () => {
    const interactive = interactiveOf(
      buildCarouselContent([
        { title: 'Pizza', body: '$6', buttons: [{ id: 'buy1', text: 'Buy' }] },
        { title: 'Ramen', body: '$5', buttons: [{ id: 'buy2', text: 'Buy' }] },
      ], { text: '🛍️ Products' }),
    )
    expect(interactive.body.text).toBe('🛍️ Products')
    expect(interactive.carouselMessage.cards).toHaveLength(2)
    expect(interactive.carouselMessage.cards[0]!.header?.title).toBe('Pizza')
    expect(interactive.carouselMessage.cards[0]!.body?.text).toBe('$6')
    expect(JSON.parse(interactive.carouselMessage.cards[1]!.nativeFlowMessage!.buttons[0]!.buttonParamsJson).id).toBe('buy2')
  })

  it('records per-card media descriptors with the card index', () => {
    const content = buildCarouselContent([
      { title: 'A', image: Buffer.from([1]) },
      { title: 'B' },
      { title: 'C', video: Buffer.from([2]) },
    ]) as unknown as Record<string, unknown>
    const media = content[RELAY_CARDS_MEDIA_KEY] as Array<{ index: number; kind: string }>
    expect(media).toHaveLength(2)
    expect(media[0]).toMatchObject({ index: 0, kind: 'image' })
    expect(media[1]).toMatchObject({ index: 2, kind: 'video' })
    expect(interactiveOf(content).carouselMessage.cards[0]!.header?.hasMediaAttachment).toBe(true)
  })

  it('omits the cards-media key when no card has media', () => {
    const content = buildCarouselContent([{ title: 'A', body: 'x' }]) as unknown as Record<string, unknown>
    expect(RELAY_CARDS_MEDIA_KEY in content).toBe(false)
  })

  it('rejects an empty card list', () => {
    expect(() => buildCarouselContent([])).toThrow(ZaileysBuilderError)
  })

  it('rejects more than ten cards', () => {
    const cards = Array.from({ length: 11 }, (_, i) => ({ title: `C${i}` }))
    expect(() => buildCarouselContent(cards)).toThrow(ZaileysBuilderError)
  })

  it('propagates invalid card buttons as INVALID_OPTIONS', () => {
    expect(() => buildCarouselContent([{ title: 'A', buttons: [{ id: '', text: 'x' }] }])).toThrow(ZaileysBuilderError)
  })
})

describe('MessageBuilder.carousel()', () => {
  it('relays the carousel with the biz/interactive render node', async () => {
    const { socket, relayMessage, sendMessage } = makeSocket()
    await MessageBuilder.create(socket, RECIPIENT).carousel([{ title: 'A', body: 'x', buttons: [{ id: 'b', text: 'B' }] }])
    expect(sendMessage).not.toHaveBeenCalled()
    const [, message, opts] = relayMessage.mock.calls[0]! as [
      string,
      { interactiveMessage: { carouselMessage: { cards: unknown[] } } },
      { additionalNodes?: Array<{ tag: string }> },
    ]
    expect(message.interactiveMessage.carouselMessage.cards).toHaveLength(1)
    expect(opts.additionalNodes?.some((n) => n.tag === 'biz')).toBe(true)
  })
})
