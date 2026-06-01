import {
  generateWAMessageFromContent,
  prepareWAMessageMedia,
  type AnyMessageContent,
  type MiscMessageGenerationOptions,
  type proto,
  type WAMessage,
  type WAMessageKey,
} from 'baileys'
import { sendAlbum } from './album.js'
import { buildAudioContent } from './content/audio.js'
import { buildButtonsContent, RELAY_CONTENT_KEY, RELAY_MEDIA_KEY, type HeaderMedia } from './content/buttons.js'
import { buildCarouselContent, RELAY_CARDS_MEDIA_KEY, type CardMedia, type CarouselCard } from './content/carousel.js'
import { buildAIRichContent, type AIRichOptions, type AIRichPart } from './content/airich.js'
import { loadMedia } from './media-loader.js'
import { buildContactContent } from './content/contact.js'
import { buildDocumentContent } from './content/document.js'
import { buildImageContent } from './content/image.js'
import { buildListContent } from './content/list.js'
import { buildLocationContent } from './content/location.js'
import { buildPollContent } from './content/poll.js'
import { buildStickerContent } from './content/sticker.js'
import { buildTemplateContent } from './content/template.js'
import { buildTextContent } from './content/text.js'
import { buildVideoContent } from './content/video.js'
import { ZaileysBuilderError } from './errors.js'
import { createInternalState, type BuilderInternalState } from './state.js'
import type {
  AlbumItem,
  AudioOptions,
  BuilderContext,
  BuilderState,
  ButtonDef,
  DocumentOptions,
  ImageOptions,
  InteractiveButton,
  ListOptions,
  LocationOptions,
  MediaSource,
  PollOptions,
  StickerOptions,
  TemplateOptions,
  VideoOptions,
} from './types.js'

/**
 * Minimal structural surface of a Baileys socket required by the builder.
 * Phase 3 `Client` is assignable to this type.
 */
export interface BuilderSocketLike {
  sendMessage(
    jid: string,
    content: AnyMessageContent,
    options?: MiscMessageGenerationOptions,
  ): Promise<WAMessage | undefined>
  relayMessage?(
    jid: string,
    message: unknown,
    options: { messageId: string; additionalNodes?: unknown[] },
  ): Promise<string>
  user?: { id?: string | null } | null
  waUploadToServer?: unknown
}

/**
 * Binary-node hint that makes WhatsApp render `interactiveMessage` content
 * (native_flow buttons/lists). Without it the server delivers the message but the
 * client shows no interactive UI. Passed to `relayMessage` as `additionalNodes`.
 */
const INTERACTIVE_NATIVE_FLOW_NODES = [
  {
    tag: 'biz',
    attrs: {},
    content: [
      {
        tag: 'interactive',
        attrs: { type: 'native_flow', v: '1' },
        content: [{ tag: 'native_flow', attrs: { v: '9', name: 'mixed' } }],
      },
    ],
  },
]

/**
 * Chainable, type-safe outbound message builder.
 *
 * The `State` type parameter enforces a single-content invariant at compile
 * time: content methods transition `'init' -> 'content-set'`, and the terminal
 * `then()` is only callable once `State` is `'content-set'`.
 */
export class MessageBuilder<State extends BuilderState> {
  declare protected readonly __state?: State
  protected readonly socket: BuilderSocketLike
  protected readonly internal: BuilderInternalState

  constructor(socket: BuilderSocketLike, internal: BuilderInternalState) {
    this.socket = socket
    this.internal = internal
  }

  /**
   * Entry point used by `Client.send` to start a builder targeting `recipient`.
   * When `resolveRecipient` is supplied the recipient is treated as a raw
   * username/phone and resolved lazily inside `then()` before dispatch.
   */
  static create(
    socket: BuilderSocketLike,
    recipient: string,
    resolveRecipient?: (raw: string) => Promise<string>,
  ): MessageBuilder<'init'> {
    return new MessageBuilder<'init'>(socket, createInternalState(recipient, resolveRecipient))
  }

  /**
   * Re-target the builder at `recipient` before content is set. Primarily used
   * by `Scheduler.scheduleAt`, whose `build` callback receives a recipient-less
   * builder and selects the destination jid inline. A fully-qualified jid is
   * used as-is; any lazy username resolver carried from `create` is cleared.
   */
  to(this: MessageBuilder<'init'>, recipient: string): MessageBuilder<'init'> {
    this.internal.recipient = recipient
    delete this.internal.resolveRecipient
    return this
  }

  text(this: MessageBuilder<'init'>, content: string): MessageBuilder<'content-set'> {
    this.internal.content = buildTextContent(content)
    return this as unknown as MessageBuilder<'content-set'>
  }

  image(this: MessageBuilder<'init'>, src: MediaSource, opts?: ImageOptions): MessageBuilder<'content-set'> {
    this.internal.pendingContent = buildImageContent(src, opts)
    return this as unknown as MessageBuilder<'content-set'>
  }

  video(this: MessageBuilder<'init'>, src: MediaSource, opts?: VideoOptions): MessageBuilder<'content-set'> {
    this.internal.pendingContent = buildVideoContent(src, opts)
    return this as unknown as MessageBuilder<'content-set'>
  }

  audio(this: MessageBuilder<'init'>, src: MediaSource, opts?: AudioOptions): MessageBuilder<'content-set'> {
    this.internal.pendingContent = buildAudioContent(src, opts)
    return this as unknown as MessageBuilder<'content-set'>
  }

  document(this: MessageBuilder<'init'>, src: MediaSource, opts: DocumentOptions): MessageBuilder<'content-set'> {
    this.internal.pendingContent = buildDocumentContent(src, opts)
    return this as unknown as MessageBuilder<'content-set'>
  }

  sticker(this: MessageBuilder<'init'>, src: MediaSource, opts?: StickerOptions): MessageBuilder<'content-set'> {
    this.internal.pendingContent = buildStickerContent(src, opts)
    return this as unknown as MessageBuilder<'content-set'>
  }

  buttons(
    this: MessageBuilder<'init'>,
    buttons: Array<ButtonDef | InteractiveButton>,
    opts?: { text?: string; footer?: string; title?: string; subtitle?: string; image?: MediaSource; video?: MediaSource },
  ): MessageBuilder<'content-set'> {
    this.internal.content = buildButtonsContent(buttons, opts)
    return this as unknown as MessageBuilder<'content-set'>
  }

  carousel(
    this: MessageBuilder<'init'>,
    cards: CarouselCard[],
    opts?: { text?: string },
  ): MessageBuilder<'content-set'> {
    this.internal.content = buildCarouselContent(cards, opts)
    return this as unknown as MessageBuilder<'content-set'>
  }

  /**
   * EXPERIMENTAL — send a Meta AI rich-response message (text with hyperlinks/
   * citations, code blocks, tables). Uses a reverse-engineered, non-standard
   * WhatsApp format that may break with WhatsApp updates.
   */
  aiRich(
    this: MessageBuilder<'init'>,
    parts: AIRichPart[],
    opts?: AIRichOptions,
  ): MessageBuilder<'content-set'> {
    this.internal.content = buildAIRichContent(parts, opts)
    return this as unknown as MessageBuilder<'content-set'>
  }

  list(this: MessageBuilder<'init'>, opts: ListOptions): MessageBuilder<'content-set'> {
    this.internal.content = buildListContent(opts)
    return this as unknown as MessageBuilder<'content-set'>
  }

  poll(
    this: MessageBuilder<'init'>,
    question: string,
    options: string[],
    opts?: PollOptions,
  ): MessageBuilder<'content-set'> {
    this.internal.content = buildPollContent(question, options, opts)
    return this as unknown as MessageBuilder<'content-set'>
  }

  location(
    this: MessageBuilder<'init'>,
    lat: number,
    lon: number,
    opts?: LocationOptions,
  ): MessageBuilder<'content-set'> {
    this.internal.content = buildLocationContent(lat, lon, opts)
    return this as unknown as MessageBuilder<'content-set'>
  }

  contact(this: MessageBuilder<'init'>, vcard: string): MessageBuilder<'content-set'> {
    this.internal.content = buildContactContent(vcard)
    return this as unknown as MessageBuilder<'content-set'>
  }

  template(this: MessageBuilder<'init'>, opts: TemplateOptions): MessageBuilder<'content-set'> {
    this.internal.content = buildTemplateContent(opts)
    return this as unknown as MessageBuilder<'content-set'>
  }

  album(this: MessageBuilder<'init'>, items: AlbumItem[]): MessageBuilder<'content-set'> {
    this.internal.albumItems = items
    return this as unknown as MessageBuilder<'content-set'>
  }

  /**
   * Quote a previous message; rejects a missing reference. Accepts a full
   * {@link WAMessage} or a bare {@link WAMessageKey} — a bare key is wrapped into
   * the `{ key }` shape Baileys requires (it reads `quoted.key.fromMe`), so passing
   * only a key never crashes. NOTE: a real quoted preview needs the full
   * {@link WAMessage} (with `message` content); a key alone carries no quoted body,
   * which the server may reject — prefer passing the original message. Chainable on any state.
   */
  reply(quoted: WAMessage | WAMessageKey): MessageBuilder<State> {
    if (quoted === undefined || quoted === null) {
      throw new ZaileysBuilderError('INVALID_OPTIONS', 'reply() requires a quoted message or key')
    }
    const isFullMessage = 'key' in quoted && (quoted as WAMessage).key != null
    this.internal.quoted = isFullMessage
      ? (quoted as WAMessage)
      : ({ key: quoted as WAMessageKey } as WAMessage)
    return this as unknown as MessageBuilder<State>
  }

  /** Tag the given jids; rejects an empty list or malformed jid, merges across calls. Chainable on any state. */
  mentions(jids: string[]): MessageBuilder<State> {
    if (jids.length === 0) {
      throw new ZaileysBuilderError('INVALID_OPTIONS', 'mentions() requires at least one jid')
    }
    for (const jid of jids) {
      if (typeof jid !== 'string' || !jid.includes('@')) {
        throw new ZaileysBuilderError('INVALID_OPTIONS', `invalid jid: ${String(jid)}`)
      }
    }
    const merged = new Set([...(this.internal.mentions ?? []), ...jids])
    this.internal.mentions = [...merged]
    return this as unknown as MessageBuilder<State>
  }

  /** Tag every participant of the target chat; idempotent. Chainable on any state. */
  mentionAll(): MessageBuilder<State> {
    this.internal.mentionAll = true
    return this as unknown as MessageBuilder<State>
  }

  /** Mark the message as disappearing after `seconds`; rejects non-positive or non-integer values. */
  disappearing(seconds: number): MessageBuilder<State> {
    if (!Number.isInteger(seconds) || seconds <= 0) {
      throw new ZaileysBuilderError('INVALID_OPTIONS', 'disappearing() requires a positive integer duration')
    }
    this.internal.disappearingSeconds = seconds
    return this as unknown as MessageBuilder<State>
  }

  /**
   * Terminal action — only callable once content is set. Sends the accumulated
   * content through the socket and resolves with the sent {@link WAMessageKey}.
   */
  then<T = WAMessageKey>(
    this: MessageBuilder<'content-set'>,
    onResolved: (key: WAMessageKey) => T,
    onRejected?: (err: unknown) => T | PromiseLike<T>,
  ): Promise<T> {
    const send = async (): Promise<WAMessageKey> => {
      if (this.internal.resolveRecipient) {
        this.internal.recipient = await this.internal.resolveRecipient(this.internal.recipient)
        delete this.internal.resolveRecipient
      }
      if (this.internal.albumItems) {
        const context: BuilderContext = { recipient: this.internal.recipient }
        if (this.internal.quoted !== undefined) context.quoted = this.internal.quoted
        if (this.internal.mentions !== undefined) context.mentions = this.internal.mentions
        if (this.internal.mentionAll !== undefined) context.mentionAll = this.internal.mentionAll
        if (this.internal.disappearingSeconds !== undefined) {
          context.disappearingSeconds = this.internal.disappearingSeconds
        }
        return sendAlbum(this.socket, this.internal.recipient, this.internal.albumItems, context)
      }
      if (this.internal.pendingContent) {
        this.internal.content = await this.internal.pendingContent
      }
      if (!this.internal.content) {
        throw new ZaileysBuilderError('EMPTY_CONTENT', 'no content set')
      }
      const relayContent = this.internal.content as Record<string, unknown>
      const relayInner = relayContent[RELAY_CONTENT_KEY]
      if (relayInner !== undefined) {
        const headerMedia = relayContent[RELAY_MEDIA_KEY] as HeaderMedia | undefined
        const cardsMedia = relayContent[RELAY_CARDS_MEDIA_KEY] as CardMedia[] | undefined
        return this.sendRelay(relayInner as proto.IMessage, headerMedia, cardsMedia)
      }
      const content = this.internal.content as AnyMessageContent & {
        mentions?: string[]
        mentionAll?: boolean
      }
      if (this.internal.mentions && this.internal.mentions.length > 0) {
        content.mentions = this.internal.mentions
      }
      if (this.internal.mentionAll) {
        content.mentionAll = true
      }
      const options: MiscMessageGenerationOptions = {}
      if (this.internal.quoted) {
        options.quoted = this.internal.quoted as WAMessage
      }
      if (this.internal.disappearingSeconds !== undefined) {
        options.ephemeralExpiration = this.internal.disappearingSeconds
      }
      let result: WAMessage | undefined
      try {
        result = await this.socket.sendMessage(this.internal.recipient, content, options)
      } catch (err) {
        throw new ZaileysBuilderError('SEND_FAILED', 'socket sendMessage rejected', { cause: err })
      }
      if (!result?.key) {
        throw new ZaileysBuilderError('SEND_FAILED', 'socket returned no message key')
      }
      return result.key
    }
    return send().then(onResolved, onRejected)
  }

  private async uploadHeaderMedia(
    header: proto.Message.InteractiveMessage.IHeader,
    media: HeaderMedia,
  ): Promise<void> {
    const { buffer } = await loadMedia(media.src)
    const prepared = (await prepareWAMessageMedia(
      { [media.kind]: buffer } as never,
      { upload: this.socket.waUploadToServer } as never,
    )) as { imageMessage?: proto.Message.IImageMessage; videoMessage?: proto.Message.IVideoMessage }
    header.hasMediaAttachment = true
    if (media.kind === 'image' && prepared.imageMessage) header.imageMessage = prepared.imageMessage
    if (media.kind === 'video' && prepared.videoMessage) header.videoMessage = prepared.videoMessage
  }

  private async sendRelay(
    inner: proto.IMessage,
    headerMedia?: HeaderMedia,
    cardsMedia?: CardMedia[],
  ): Promise<WAMessageKey> {
    const relay = this.socket.relayMessage
    if (typeof relay !== 'function') {
      throw new ZaileysBuilderError('SEND_FAILED', 'socket does not support relayMessage (interactive content)')
    }
    if (this.socket.waUploadToServer !== undefined) {
      try {
        const header = inner.interactiveMessage?.header
        if (headerMedia !== undefined && header) await this.uploadHeaderMedia(header, headerMedia)
        const cards = inner.interactiveMessage?.carouselMessage?.cards
        if (cardsMedia !== undefined && cards) {
          for (const media of cardsMedia) {
            const cardHeader = cards[media.index]?.header
            if (cardHeader) await this.uploadHeaderMedia(cardHeader, media)
          }
        }
      } catch (err) {
        throw new ZaileysBuilderError('SEND_FAILED', 'interactive media upload failed', { cause: err })
      }
    }
    const userJid = this.socket.user?.id ?? ''
    const genOptions = { userJid } as Parameters<typeof generateWAMessageFromContent>[2]
    const quoted = this.internal.quoted as { message?: unknown } | undefined
    if (quoted !== undefined && quoted.message != null) {
      ;(genOptions as { quoted?: unknown }).quoted = quoted
    }
    const waMsg = generateWAMessageFromContent(this.internal.recipient, inner, genOptions)
    if (typeof waMsg.key?.id !== 'string') {
      throw new ZaileysBuilderError('SEND_FAILED', 'failed to generate relay message key')
    }
    const isInteractive = 'interactiveMessage' in inner && inner.interactiveMessage != null
    const relayOptions = isInteractive
      ? { messageId: waMsg.key.id, additionalNodes: INTERACTIVE_NATIVE_FLOW_NODES }
      : { messageId: waMsg.key.id }
    try {
      await relay(this.internal.recipient, waMsg.message, relayOptions)
    } catch (err) {
      throw new ZaileysBuilderError('SEND_FAILED', 'socket relayMessage rejected', { cause: err })
    }
    return waMsg.key as WAMessageKey
  }
}
