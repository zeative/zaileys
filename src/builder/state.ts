import type { AnyMessageContent, WAMessage, WAMessageKey } from 'baileys'

/**
 * Mutable internal accumulator backing a {@link MessageBuilder}.
 * Fields are additive: downstream plans extend this with `pendingContent`,
 * `albumItems`, and username-resolution markers.
 */
export type BuilderInternalState = {
  recipient: string
  content?: AnyMessageContent
  /** Async media content set by media methods; awaited by `then()` before dispatch. */
  pendingContent?: Promise<AnyMessageContent>
  quoted?: WAMessage | WAMessageKey
  mentions?: string[]
  mentionAll?: boolean
  disappearingSeconds?: number
}

/** Create a fresh internal state seeded with the target recipient. */
export const createInternalState = (recipient: string): BuilderInternalState => ({
  recipient,
})
