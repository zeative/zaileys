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
  disappearingSeconds?: number
  resolveRecipient?: (raw: string) => Promise<string>
  recordSent?: (message: WAMessage) => void
}

export const createInternalState = (
  recipient: string,
  resolveRecipient?: (raw: string) => Promise<string>,
  recordSent?: (message: WAMessage) => void,
): BuilderInternalState => ({
  recipient,
  ...(resolveRecipient ? { resolveRecipient } : {}),
  ...(recordSent ? { recordSent } : {}),
})
