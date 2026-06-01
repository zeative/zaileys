import { proto, type AnyMessageContent } from 'baileys'
import { ZaileysBuilderError } from '../errors.js'
import type { ButtonDef, InteractiveButton, MediaSource } from '../types.js'

const MAX_BUTTONS = 10

/**
 * Marker key on builder content whose value is a raw `proto.IMessage` to be sent
 * via `relayMessage` (used for interactive messages Baileys' `sendMessage` content
 * union does not cover). The builder detects this key and relays instead of calling
 * `sendMessage`.
 */
export const RELAY_CONTENT_KEY = '__zaileysRelayMessage'

/** Marker key carrying header media to upload + inject into the interactive header at send time. */
export const RELAY_MEDIA_KEY = '__zaileysHeaderMedia'

/** Header media descriptor resolved (uploaded) by the relay send path. */
export type HeaderMedia = { kind: 'image' | 'video'; src: MediaSource }

/** Content shape carrying a pre-built proto message (+ optional header media) for the relay send path. */
export type RelayContent = { [RELAY_CONTENT_KEY]: proto.IMessage; [RELAY_MEDIA_KEY]?: HeaderMedia }

/** Optional decoration for {@link buildButtonsContent}: body text, footer, and a text/media header. */
export type ButtonsContentOptions = {
  text?: string
  footer?: string
  title?: string
  subtitle?: string
  image?: MediaSource
  video?: MediaSource
}

type NativeButton = { name: string; buttonParamsJson: string }

const nonEmpty = (value: unknown): value is string => typeof value === 'string' && value.length > 0

const toNativeButton = (button: ButtonDef | InteractiveButton, seen: Set<string>): NativeButton => {
  const text = (button as { text?: unknown }).text
  if (!nonEmpty(text) || text.trim().length === 0) {
    throw new ZaileysBuilderError('INVALID_OPTIONS', 'button text must be a non-empty string')
  }
  const type = (button as InteractiveButton).type ?? 'reply'
  if (type === 'reply') {
    const id = (button as ButtonDef).id
    if (!nonEmpty(id)) {
      throw new ZaileysBuilderError('INVALID_OPTIONS', 'reply button requires a non-empty id')
    }
    if (seen.has(id)) {
      throw new ZaileysBuilderError('INVALID_OPTIONS', `duplicate button id: ${id}`)
    }
    seen.add(id)
    return { name: 'quick_reply', buttonParamsJson: JSON.stringify({ display_text: text, id }) }
  }
  if (type === 'url') {
    const url = (button as { url?: unknown }).url
    if (!nonEmpty(url)) {
      throw new ZaileysBuilderError('INVALID_OPTIONS', 'url button requires a non-empty url')
    }
    const webview = (button as { webview?: unknown }).webview === true
    return {
      name: 'cta_url',
      buttonParamsJson: JSON.stringify({ display_text: text, url, merchant_url: url, webview_interaction: webview }),
    }
  }
  if (type === 'copy') {
    const code = (button as { code?: unknown }).code
    if (!nonEmpty(code)) {
      throw new ZaileysBuilderError('INVALID_OPTIONS', 'copy button requires a non-empty code')
    }
    return { name: 'cta_copy', buttonParamsJson: JSON.stringify({ display_text: text, id: code, copy_code: code }) }
  }
  if (type === 'call') {
    const phone = (button as { phone?: unknown }).phone
    if (!nonEmpty(phone)) {
      throw new ZaileysBuilderError('INVALID_OPTIONS', 'call button requires a non-empty phone')
    }
    return { name: 'cta_call', buttonParamsJson: JSON.stringify({ display_text: text, id: phone, phone_number: phone }) }
  }
  throw new ZaileysBuilderError('INVALID_OPTIONS', `unknown button type: ${String(type)}`)
}

/**
 * Map declarative buttons to nativeFlow buttons, validating each. Reusable by
 * {@link buildButtonsContent} and the carousel card builder.
 *
 * @throws ZaileysBuilderError `INVALID_OPTIONS` on empty list, too many buttons, or invalid fields.
 */
export const buildNativeButtons = (buttons: Array<ButtonDef | InteractiveButton>): NativeButton[] => {
  if (!Array.isArray(buttons) || buttons.length === 0) {
    throw new ZaileysBuilderError('INVALID_OPTIONS', 'buttons() requires at least one button')
  }
  if (buttons.length > MAX_BUTTONS) {
    throw new ZaileysBuilderError('INVALID_OPTIONS', `buttons() accepts at most ${MAX_BUTTONS} buttons`)
  }
  const seen = new Set<string>()
  return buttons.map((button) => toNativeButton(button, seen))
}

/**
 * Build a modern `interactiveMessage` (nativeFlow) from declarative buttons,
 * returned as relay-marker content. Supports `reply` (quick_reply), `url`
 * (cta_url), `copy` (cta_copy), and `call` (cta_call) buttons, plus an optional
 * text header (`title`/`subtitle`). A bare `{ id, text }` is treated as a reply
 * button; its `id` round-trips on tap via `interactiveResponseMessage` ->
 * `ButtonClickPayload.buttonId`.
 *
 * NOTE: WhatsApp only RENDERS interactive content when the relay carries the
 * `biz > interactive (native_flow)` node (the builder adds it automatically).
 *
 * @param buttons - 1..10 button definitions.
 * @param opts - optional body `text`, `footer`, and header `title`/`subtitle`.
 * @throws ZaileysBuilderError `INVALID_OPTIONS` on empty list, too many buttons, or invalid button fields.
 */
export const buildButtonsContent = (
  buttons: Array<ButtonDef | InteractiveButton>,
  opts?: ButtonsContentOptions,
): AnyMessageContent => {
  const nativeButtons = buildNativeButtons(buttons)

  const interactiveMessage: proto.Message.IInteractiveMessage = {
    body: { text: opts?.text && opts.text.length > 0 ? opts.text : ' ' },
    nativeFlowMessage: { buttons: nativeButtons, messageParamsJson: '' },
  }
  if (opts?.footer && opts.footer.length > 0) {
    interactiveMessage.footer = { text: opts.footer }
  }
  const headerMedia: HeaderMedia | undefined = opts?.image
    ? { kind: 'image', src: opts.image }
    : opts?.video
      ? { kind: 'video', src: opts.video }
      : undefined
  const hasTextHeader = (opts?.title && opts.title.length > 0) || (opts?.subtitle && opts.subtitle.length > 0)
  if (hasTextHeader || headerMedia) {
    interactiveMessage.header = {
      title: opts?.title ?? '',
      subtitle: opts?.subtitle ?? '',
      hasMediaAttachment: headerMedia !== undefined,
    }
  }

  const relay: RelayContent =
    headerMedia !== undefined
      ? { [RELAY_CONTENT_KEY]: { interactiveMessage }, [RELAY_MEDIA_KEY]: headerMedia }
      : { [RELAY_CONTENT_KEY]: { interactiveMessage } }
  return relay as unknown as AnyMessageContent
}
