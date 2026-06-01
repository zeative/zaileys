import type { WAMessage, WAMessageKey } from 'baileys'

/** Compile-time state of a {@link MessageBuilder}: `'init'` before content, `'content-set'` after exactly one content method. */
export type BuilderState = 'init' | 'content-set'

/** Uniform media input accepted by every media method: file path / URL string, raw `Buffer`, or `URL` instance. */
export type MediaSource = string | Buffer | URL

/** Options for {@link MessageBuilder.image}. */
export type ImageOptions = {
  caption?: string
  viewOnce?: boolean
}

/** Options for {@link MessageBuilder.video}. */
export type VideoOptions = {
  caption?: string
  gifPlayback?: boolean
  viewOnce?: boolean
}

/** Options for {@link MessageBuilder.audio}; `ptt` sends a voice note. */
export type AudioOptions = {
  ptt?: boolean
  seconds?: number
}

/** Options for {@link MessageBuilder.document}; `fileName` is required. */
export type DocumentOptions = {
  fileName: string
  mimetype?: string
  caption?: string
}

/** Options for {@link MessageBuilder.sticker}; `animated` selects WebP animation. */
export type StickerOptions = {
  animated?: boolean
}

/** A single album entry (rc11+); discriminated by `type`. */
export type AlbumItem = {
  type: 'image' | 'video'
  src: MediaSource
  caption?: string
}

/** A quick-reply button: tapping sends `id` back as a `button-click` event. */
export type ReplyButton = { type?: 'reply'; id: string; text: string }
/** A button that opens `url` (optionally in WhatsApp's in-app webview). */
export type UrlButton = { type: 'url'; text: string; url: string; webview?: boolean }
/** A button that copies `code` to the clipboard. */
export type CopyButton = { type: 'copy'; text: string; code: string }
/** A button that dials `phone`. */
export type CallButton = { type: 'call'; text: string; phone: string }
/** A button that sets a native WhatsApp reminder when tapped. */
export type ReminderButton = { type: 'reminder'; text: string; id?: string }
/** A button that cancels a previously-set WhatsApp reminder. */
export type CancelReminderButton = { type: 'cancel-reminder'; text: string; id?: string }
/** A button that prompts the user to share their current location. */
export type LocationRequestButton = { type: 'location'; text?: string }
/** A button that prompts the user to fill in / send a delivery address. */
export type AddressButton = { type: 'address'; text: string; id?: string }

/** Any interactive (nativeFlow) button accepted by {@link MessageBuilder.buttons}. */
export type InteractiveButton =
  | ReplyButton
  | UrlButton
  | CopyButton
  | CallButton
  | ReminderButton
  | CancelReminderButton
  | LocationRequestButton
  | AddressButton

/** Groups overflow buttons into a tap-to-open bottom sheet (nativeFlow `bottom_sheet` param). */
export type BottomSheetOptions = {
  listTitle?: string
  buttonTitle?: string
  buttonsLimit?: number
  dividers?: number[]
}

/** Renders a countdown limited-time-offer banner above the buttons (nativeFlow `limited_time_offer` param). */
export type LimitedTimeOfferOptions = {
  text?: string
  url?: string
  copyCode?: string
  expiresAt?: number
}

/** A quick-reply button definition (legacy alias of {@link ReplyButton}). */
export type ButtonDef = {
  id: string
  text: string
}

/** A section of a {@link ListOptions} list message. */
export type ListSection = {
  title: string
  rows: Array<{ id: string; title: string; description?: string }>
}

/** Options for {@link MessageBuilder.list}. */
export type ListOptions = {
  title?: string
  description?: string
  buttonText: string
  footerText?: string
  sections: ListSection[]
}

/** Options for {@link MessageBuilder.poll}. */
export type PollOptions = {
  multipleChoice?: boolean
}

/** Options for {@link MessageBuilder.location}. */
export type LocationOptions = {
  name?: string
  address?: string
}

/** Options for {@link MessageBuilder.template}. */
export type TemplateOptions = {
  header?: string
  body: string
  footer?: string
  buttons: ButtonDef[]
}

/** Resolved context shared with downstream content/album mutations. */
export type BuilderContext = {
  recipient: string
  quoted?: WAMessage | WAMessageKey
  mentions?: string[]
  mentionAll?: boolean
  disappearingSeconds?: number
}
