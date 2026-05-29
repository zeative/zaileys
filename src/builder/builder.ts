import type {
  AnyMessageContent,
  MiscMessageGenerationOptions,
  WAMessage,
  WAMessageKey,
} from 'baileys'
import { buildTextContent } from './content/text.js'
import { ZaileysBuilderError } from './errors.js'
import { createInternalState, type BuilderInternalState } from './state.js'
import type {
  AlbumItem,
  AudioOptions,
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

const notImplemented = (method: string): never => {
  throw new ZaileysBuilderError('INVALID_OPTIONS', `${method}() not yet implemented`)
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

  image(this: MessageBuilder<'init'>, _src: MediaSource, _opts?: ImageOptions): MessageBuilder<'content-set'> {
    return notImplemented('image')
  }

  video(this: MessageBuilder<'init'>, _src: MediaSource, _opts?: VideoOptions): MessageBuilder<'content-set'> {
    return notImplemented('video')
  }

  audio(this: MessageBuilder<'init'>, _src: MediaSource, _opts?: AudioOptions): MessageBuilder<'content-set'> {
    return notImplemented('audio')
  }

  document(this: MessageBuilder<'init'>, _src: MediaSource, _opts: DocumentOptions): MessageBuilder<'content-set'> {
    return notImplemented('document')
  }

  sticker(this: MessageBuilder<'init'>, _src: MediaSource, _opts?: StickerOptions): MessageBuilder<'content-set'> {
    return notImplemented('sticker')
  }

  buttons(this: MessageBuilder<'init'>, _buttons: ButtonDef[]): MessageBuilder<'content-set'> {
    return notImplemented('buttons')
  }

  list(this: MessageBuilder<'init'>, _opts: ListOptions): MessageBuilder<'content-set'> {
    return notImplemented('list')
  }

  poll(
    this: MessageBuilder<'init'>,
    _question: string,
    _options: string[],
    _opts?: PollOptions,
  ): MessageBuilder<'content-set'> {
    return notImplemented('poll')
  }

  location(
    this: MessageBuilder<'init'>,
    _lat: number,
    _lon: number,
    _opts?: LocationOptions,
  ): MessageBuilder<'content-set'> {
    return notImplemented('location')
  }

  contact(this: MessageBuilder<'init'>, _vcard: string): MessageBuilder<'content-set'> {
    return notImplemented('contact')
  }

  template(this: MessageBuilder<'init'>, _opts: TemplateOptions): MessageBuilder<'content-set'> {
    return notImplemented('template')
  }

  album(this: MessageBuilder<'init'>, _items: AlbumItem[]): MessageBuilder<'content-set'> {
    return notImplemented('album')
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
