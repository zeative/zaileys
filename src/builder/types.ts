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

/** An interactive button definition. */
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
