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
}

export const createInternalState = (
  recipient: string,
  resolveRecipient?: (raw: string) => Promise<string>,
): BuilderInternalState => ({
  recipient,
  ...(resolveRecipient ? { resolveRecipient } : {}),
})
