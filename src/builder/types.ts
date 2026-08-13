import type { WAMessage, WAMessageKey } from 'baileys'

import type { StickerMetadataType } from '../media/ffmpeg/sticker.js'

export type BuilderState = 'init' | 'content-set'

export type MediaSource = string | Buffer | URL

export type ImageOptions = {
  caption?: string
  viewOnce?: boolean
}

export type VideoOptions = {
  caption?: string
  gifPlayback?: boolean
  viewOnce?: boolean
  /** Send as a round video note (PTV). */
  ptv?: boolean
}

export type VideoNoteOptions = {
  viewOnce?: boolean
}

export type AudioOptions = {
  ptt?: boolean
  seconds?: number
}

export type DocumentOptions = {
  fileName: string
  mimetype?: string
  caption?: string
}

export type StickerOptions = StickerMetadataType & {
  animated?: boolean
}

export type AlbumItem = {
  type: 'image' | 'video'
  src: MediaSource
  caption?: string
}

export type ReplyButton = { type?: 'reply'; id: string; text: string }
export type UrlButton = { type: 'url'; text: string; url: string; webview?: boolean }
export type CopyButton = { type: 'copy'; text: string; code: string }
export type CallButton = { type: 'call'; text: string; phone: string }
export type ReminderButton = { type: 'reminder'; text: string; id?: string }
export type CancelReminderButton = { type: 'cancel-reminder'; text: string; id?: string }
export type LocationRequestButton = { type: 'location'; text?: string }
export type AddressButton = { type: 'address'; text: string; id?: string }

export type InteractiveButton =
  | ReplyButton
  | UrlButton
  | CopyButton
  | CallButton
  | ReminderButton
  | CancelReminderButton
  | LocationRequestButton
  | AddressButton

export type BottomSheetOptions = {
  listTitle?: string
  buttonTitle?: string
  buttonsLimit?: number
  dividers?: number[]
}

export type LimitedTimeOfferOptions = {
  text?: string
  url?: string
  copyCode?: string
  expiresAt?: number
}

export type ButtonDef = {
  id: string
  text: string
}

export type ListSection = {
  title: string
  rows: Array<{ id: string; title: string; description?: string }>
}

export type ListOptions = {
  title?: string
  description?: string
  buttonText: string
  footerText?: string
  sections: ListSection[]
}

export type PollOptions = {
  multipleChoice?: boolean
}

export type LocationOptions = {
  name?: string
  address?: string
}

export type TemplateOptions = {
  header?: string
  body: string
  footer?: string
  buttons: ButtonDef[]
}

export type EventOptions = {
  name: string
  description?: string
  startAt: Date | number
  endAt?: Date | number
  location?: { latitude: number; longitude: number; name?: string; address?: string }
  call?: 'audio' | 'video'
  canceled?: boolean
}

export type ProductOptions = {
  image: MediaSource
  title: string
  businessOwnerId: string
  description?: string
  /** Price in currency units (e.g. 50 = 50.00); mapped to priceAmount1000. */
  price?: number
  currency?: string
  productId?: string
  retailerId?: string
  url?: string
  body?: string
  footer?: string
}

export type GroupInviteOptions = {
  jid: string
  code: string
  subject?: string
  caption?: string
  /** Unix seconds when the invite expires. Defaults to ~3 days from now. WhatsApp reads this as seconds. */
  expiresAt?: number
  /** Optional JPEG thumbnail (group avatar) — improves how the card renders. */
  thumbnail?: Buffer
}

export type GroupStatusFont =
  | 'system'
  | 'system-text'
  | 'fb-script'
  | 'system-bold'
  | 'morningbreeze'
  | 'calistoga'
  | 'exo2'
  | 'courierprime'

export type GroupStatusOptions = {
  /** Background as `#RGB`, `#RRGGBB`, `#AARRGGBB` (with or without `#`), or a raw ARGB integer. */
  backgroundColor?: string | number
  /** Font face. Accepts a named font or a raw FontType integer for forward compatibility. */
  font?: GroupStatusFont | number
}

/** Media posted directly as a group status, without an existing message to repost. */
export type GroupStatusMedia = {
  image?: MediaSource
  video?: MediaSource
  audio?: MediaSource
  caption?: string
  /** Send an audio status as a voice note. */
  ptt?: boolean
}

/** What a group status can be built from: a `MessageContext`, a raw `WAMessage`, or fresh media. */
export type GroupStatusSource = WAMessage | { message: () => WAMessage } | GroupStatusMedia

export type GroupStatusRepostOptions = {
  /** Replaces the original caption. Ignored for voice notes, which have none. */
  caption?: string
}

export type BuilderContext = {
  recipient: string
  quoted?: WAMessage | WAMessageKey
  mentions?: string[]
  mentionAll?: boolean
  disappearingSeconds?: number
}
