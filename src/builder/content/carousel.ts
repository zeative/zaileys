import { proto, type AnyMessageContent } from 'baileys'
import { ZaileysBuilderError } from '../errors.js'
import type { ButtonDef, InteractiveButton, MediaSource } from '../types.js'
import { buildNativeButtons, type HeaderMedia, RELAY_CONTENT_KEY } from './buttons.js'

const MAX_CARDS = 10

/** Marker key carrying per-card header media to upload + inject at send time. */
export const RELAY_CARDS_MEDIA_KEY = '__zaileysCardsMedia'

/** Per-card header media descriptor with the index of its card in the carousel. */
export type CardMedia = HeaderMedia & { index: number }

/** A single carousel card: an interactive sub-message with its own header, body, footer, and buttons. */
export type CarouselCard = {
  title?: string
  subtitle?: string
  body?: string
  footer?: string
  image?: MediaSource
  video?: MediaSource
  buttons?: Array<ButtonDef | InteractiveButton>
}

/**
 * Build a carousel `interactiveMessage` (swipeable cards) as relay-marker content.
 * Each card is an interactive sub-message with an optional media/text header, body,
 * footer, and nativeFlow buttons. Card media is uploaded + injected at send time.
 *
 * @param cards - 1..10 cards.
 * @param opts - optional carousel body `text` shown above the cards.
 * @throws ZaileysBuilderError `INVALID_OPTIONS` on empty/too-many cards or invalid card buttons.
 */
export const buildCarouselContent = (
  cards: CarouselCard[],
  opts?: { text?: string },
): AnyMessageContent => {
  if (!Array.isArray(cards) || cards.length === 0) {
    throw new ZaileysBuilderError('INVALID_OPTIONS', 'carousel() requires at least one card')
  }
  if (cards.length > MAX_CARDS) {
    throw new ZaileysBuilderError('INVALID_OPTIONS', `carousel() accepts at most ${MAX_CARDS} cards`)
  }

  const cardsMedia: CardMedia[] = []
  const protoCards = cards.map((card, index): proto.Message.IInteractiveMessage => {
    const im: proto.Message.IInteractiveMessage = {
      body: { text: card.body && card.body.length > 0 ? card.body : ' ' },
    }
    if (card.buttons && card.buttons.length > 0) {
      im.nativeFlowMessage = { buttons: buildNativeButtons(card.buttons), messageParamsJson: '' }
    }
    if (card.footer && card.footer.length > 0) {
      im.footer = { text: card.footer }
    }
    const media: HeaderMedia | undefined = card.image
      ? { kind: 'image', src: card.image }
      : card.video
        ? { kind: 'video', src: card.video }
        : undefined
    const hasTextHeader = (card.title && card.title.length > 0) || (card.subtitle && card.subtitle.length > 0)
    if (hasTextHeader || media) {
      im.header = {
        title: card.title ?? '',
        subtitle: card.subtitle ?? '',
        hasMediaAttachment: media !== undefined,
      }
    }
    if (media) cardsMedia.push({ ...media, index })
    return im
  })

  const interactiveMessage: proto.Message.IInteractiveMessage = {
    body: { text: opts?.text && opts.text.length > 0 ? opts.text : ' ' },
    carouselMessage: { cards: protoCards },
  }

  const relay =
    cardsMedia.length > 0
      ? { [RELAY_CONTENT_KEY]: { interactiveMessage }, [RELAY_CARDS_MEDIA_KEY]: cardsMedia }
      : { [RELAY_CONTENT_KEY]: { interactiveMessage } }
  return relay as unknown as AnyMessageContent
}
