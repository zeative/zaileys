import type {
  AnyMessageContent,
  MiscMessageGenerationOptions,
  WAMessage,
  WAMessageKey,
} from 'baileys'
import { sendAlbum } from './album.js'
import { buildAudioContent } from './content/audio.js'
import { buildButtonsContent } from './content/buttons.js'
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
}

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

  /** Entry point used by `Client.send` to start a builder targeting `recipient`. */
  static create(socket: BuilderSocketLike, recipient: string): MessageBuilder<'init'> {
    return new MessageBuilder<'init'>(socket, createInternalState(recipient))
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
    buttons: ButtonDef[],
    opts?: { text?: string; footer?: string },
  ): MessageBuilder<'content-set'> {
    this.internal.content = buildButtonsContent(buttons, opts)
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

  /** Quote a previous message; rejects a missing reference. Chainable on any state. */
  reply(quoted: WAMessage | WAMessageKey): MessageBuilder<State> {
    if (quoted === undefined || quoted === null) {
      throw new ZaileysBuilderError('INVALID_OPTIONS', 'reply() requires a quoted message or key')
    }
    this.internal.quoted = quoted
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
}
