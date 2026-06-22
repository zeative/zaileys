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
import { buildButtonsContent, RELAY_CONTENT_KEY, RELAY_MEDIA_KEY, type ButtonsContentOptions, type HeaderMedia } from './content/buttons.js'
import { buildCarouselContent, RELAY_CARDS_MEDIA_KEY, type CardMedia, type CarouselCard } from './content/carousel.js'
import { buildAIRichContent, type AIRichOptions } from './content/airich.js'
import { parseRichMarkdown } from './content/markdown.js'
import { loadMedia } from './media-loader.js'
import { buildContactContent } from './content/contact.js'
import { buildDocumentContent } from './content/document.js'
import { buildEventContent } from './content/event.js'
import { buildGroupInviteContent } from './content/group-invite.js'
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
  EventOptions,
  GroupInviteOptions,
  ImageOptions,
  InteractiveButton,
  ListOptions,
  LocationOptions,
  MediaSource,
  PollOptions,
  StickerOptions,
  TemplateOptions,
  VideoNoteOptions,
  VideoOptions,
} from './types.js'

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
  chatModify?(mod: unknown, jid: string): Promise<void>
  user?: { id?: string | null } | null
  waUploadToServer?: unknown
}

export type TextOptions = { rich?: boolean } & AIRichOptions

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

export class MessageBuilder<State extends BuilderState> {
  declare protected readonly __state?: State
  protected readonly socket: BuilderSocketLike
  protected readonly internal: BuilderInternalState

  constructor(socket: BuilderSocketLike, internal: BuilderInternalState) {
    this.socket = socket
    this.internal = internal
  }

  static create(
    socket: BuilderSocketLike,
    recipient: string,
    resolveRecipient?: (raw: string) => Promise<string>,
    recordSent?: (message: WAMessage) => void,
  ): MessageBuilder<'init'> {
    return new MessageBuilder<'init'>(
      socket,
      createInternalState(recipient, resolveRecipient, recordSent),
    )
  }

  to(this: MessageBuilder<'init'>, recipient: string): MessageBuilder<'init'> {
    this.internal.recipient = recipient
    delete this.internal.resolveRecipient
    return this
  }

  text(this: MessageBuilder<'init'>, content: string, opts?: TextOptions): MessageBuilder<'content-set'> {
    if (opts?.rich === true) {
      this.internal.content = buildAIRichContent(parseRichMarkdown(content), opts)
    } else {
      this.internal.content = buildTextContent(content)
    }
    return this as unknown as MessageBuilder<'content-set'>
  }

  image(this: MessageBuilder<'init'>, src: MediaSource, opts?: ImageOptions): MessageBuilder<'content-set'> {
    this.internal.pendingContent = buildImageContent(src, opts)
    return this as unknown as MessageBuilder<'content-set'>
  }

  videoNote(this: MessageBuilder<'init'>, src: MediaSource, opts?: VideoNoteOptions): MessageBuilder<'content-set'> {
    this.internal.pendingContent = buildVideoContent(src, { ...opts, ptv: true })
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
    opts?: ButtonsContentOptions,
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

  event(this: MessageBuilder<'init'>, opts: EventOptions): MessageBuilder<'content-set'> {
    this.internal.content = buildEventContent(opts)
    return this as unknown as MessageBuilder<'content-set'>
  }

  groupInvite(this: MessageBuilder<'init'>, opts: GroupInviteOptions): MessageBuilder<'content-set'> {
    this.internal.content = buildGroupInviteContent(opts)
    return this as unknown as MessageBuilder<'content-set'>
  }

  album(this: MessageBuilder<'init'>, items: AlbumItem[]): MessageBuilder<'content-set'> {
    this.internal.albumItems = items
    return this as unknown as MessageBuilder<'content-set'>
  }

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

  mentionAll(): MessageBuilder<State> {
    this.internal.mentionAll = true
    return this as unknown as MessageBuilder<State>
  }

  disappearing(seconds: number): MessageBuilder<State> {
    if (!Number.isInteger(seconds) || seconds <= 0) {
      throw new ZaileysBuilderError('INVALID_OPTIONS', 'disappearing() requires a positive integer duration')
    }
    this.internal.disappearingSeconds = seconds
    return this as unknown as MessageBuilder<State>
  }

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
    this.internal.recordSent?.(waMsg as WAMessage)
    return waMsg.key as WAMessageKey
  }
}
