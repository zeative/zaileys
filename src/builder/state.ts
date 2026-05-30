import type { AnyMessageContent, WAMessage, WAMessageKey } from 'baileys'
import type { AlbumItem } from './types.js'

/**
 * Mutable internal accumulator backing a {@link MessageBuilder}.
 * Fields are additive: downstream plans extend this with `pendingContent`,
 * `albumItems`, and username-resolution markers.
 */
export type BuilderInternalState = {
  /** Resolved JID, or the raw username/phone when {@link BuilderInternalState.resolveRecipient} is set. */
  recipient: string
  content?: AnyMessageContent
  /** Async media content set by media methods; awaited by `then()` before dispatch. */
  pendingContent?: Promise<AnyMessageContent>
  /** Album entries set by `.album()`; when present `then()` dispatches via the album orchestrator. */
  albumItems?: AlbumItem[]
  quoted?: WAMessage | WAMessageKey
  mentions?: string[]
  mentionAll?: boolean
  disappearingSeconds?: number
  /**
   * Lazy recipient resolver invoked by `then()` before dispatch. Set by
   * `Client.send` for non-JID recipients so resolution stays out of the
   * synchronous builder entry point.
   */
  resolveRecipient?: (raw: string) => Promise<string>
}

/** Create a fresh internal state seeded with the target recipient. */
export const createInternalState = (
  recipient: string,
  resolveRecipient?: (raw: string) => Promise<string>,
): BuilderInternalState => ({
  recipient,
  ...(resolveRecipient ? { resolveRecipient } : {}),
})
