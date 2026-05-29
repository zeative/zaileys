import type { AnyMessageContent, WAMessageKey } from 'baileys'
import type { BuilderSocketLike } from './builder.js'
import { buildImageContent } from './content/image.js'
import { buildTextContent } from './content/text.js'
import { buildVideoContent } from './content/video.js'
import { ZaileysBuilderError } from './errors.js'
import type { ImageOptions, MediaSource, VideoOptions } from './types.js'

/**
 * Chainable editor for an existing message. Exposes only the content kinds
 * WhatsApp permits on an edit (`text`, `image`, `video`); awaiting the builder
 * dispatches the replacement with the `edit` field set to the target key.
 */
export class EditBuilder {
  private readonly socket: BuilderSocketLike
  private readonly key: WAMessageKey
  private content: AnyMessageContent | undefined
  private pendingContent: Promise<AnyMessageContent> | undefined

  constructor(socket: BuilderSocketLike, key: WAMessageKey) {
    this.socket = socket
    this.key = key
  }

  /** Replace with new text. */
  text(content: string): this {
    this.content = buildTextContent(content) as unknown as AnyMessageContent
    return this
  }

  /** Replace with a new image. */
  image(src: MediaSource, opts?: ImageOptions): this {
    this.pendingContent = buildImageContent(src, opts)
    return this
  }

  /** Replace with a new video. */
  video(src: MediaSource, opts?: VideoOptions): this {
    this.pendingContent = buildVideoContent(src, opts)
    return this
  }

  /** Terminal action — dispatch the edit and resolve with the resulting {@link WAMessageKey}. */
  then<T = WAMessageKey>(
    onResolved: (key: WAMessageKey) => T,
    onRejected?: (err: unknown) => T | PromiseLike<T>,
  ): Promise<T> {
    return this.send().then(onResolved, onRejected)
  }

  private async send(): Promise<WAMessageKey> {
    const remoteJid = this.key.remoteJid
    if (typeof remoteJid !== 'string' || remoteJid.length === 0) {
      throw new ZaileysBuilderError('INVALID_OPTIONS', 'message key is missing remoteJid')
    }
    if (this.pendingContent) {
      this.content = await this.pendingContent
    }
    if (!this.content) {
      throw new ZaileysBuilderError('EMPTY_CONTENT', 'edit() requires a content method before await')
    }
    const content = { ...this.content, edit: this.key } as AnyMessageContent
    let result
    try {
      result = await this.socket.sendMessage(remoteJid, content)
    } catch (err) {
      throw new ZaileysBuilderError('SEND_FAILED', 'socket sendMessage rejected', { cause: err })
    }
    if (!result?.key) {
      throw new ZaileysBuilderError('SEND_FAILED', 'socket returned no message key')
    }
    return result.key
  }
}
