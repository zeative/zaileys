import type { AnyMessageContent, WAMessage, WAMessageKey } from 'baileys'
import type { AlbumItem } from './types.js'

export type BuilderInternalState = {
  recipient: string
  content?: AnyMessageContent
  pendingContent?: Promise<AnyMessageContent>
  albumItems?: AlbumItem[]
  quoted?: WAMessage | WAMessageKey
  mentions?: string[]
  mentionAll?: boolean
  statusJidList?: string[]
  disappearingSeconds?: number
  resolveRecipient?: (raw: string) => Promise<string>
  recordSent?: (message: WAMessage) => void
  /** The chat's own disappearing timer, applied when the caller did not set one. */
  inheritDisappearing?: (jid: string) => number | undefined
}

export const createInternalState = (
  recipient: string,
  resolveRecipient?: (raw: string) => Promise<string>,
  recordSent?: (message: WAMessage) => void,
  inheritDisappearing?: (jid: string) => number | undefined,
): BuilderInternalState => ({
  recipient,
  ...(resolveRecipient ? { resolveRecipient } : {}),
  ...(recordSent ? { recordSent } : {}),
  ...(inheritDisappearing ? { inheritDisappearing } : {}),
})
