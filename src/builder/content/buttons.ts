import { proto, type AnyMessageContent } from 'baileys'
import { ZaileysBuilderError } from '../errors.js'
import type { BottomSheetOptions, ButtonDef, InteractiveButton, LimitedTimeOfferOptions, MediaSource } from '../types.js'

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

/** Optional decoration for {@link buildButtonsContent}: body text, footer, a text/media header, and nativeFlow params. */
export type ButtonsContentOptions = {
  text?: string
  footer?: string
  title?: string
  subtitle?: string
  image?: MediaSource
  video?: MediaSource
  bottomSheet?: BottomSheetOptions
  limitedTimeOffer?: LimitedTimeOfferOptions
}

type NativeButton = { name: string; buttonParamsJson: string }

const nonEmpty = (value: unknown): value is string => typeof value === 'string' && value.length > 0

const requireText = (button: ButtonDef | InteractiveButton): string => {
  const text = (button as { text?: unknown }).text
  if (!nonEmpty(text) || text.trim().length === 0) {
    throw new ZaileysBuilderError('INVALID_OPTIONS', 'button text must be a non-empty string')
  }
  return text
}

const toNativeButton = (button: ButtonDef | InteractiveButton, seen: Set<string>): NativeButton => {
  const type = (button as InteractiveButton).type ?? 'reply'
  if (type === 'location') {
    const text = (button as { text?: unknown }).text
    return { name: 'send_location', buttonParamsJson: JSON.stringify(nonEmpty(text) ? { display_text: text } : {}) }
  }
  const text = requireText(button)
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
  if (type === 'reminder' || type === 'cancel-reminder') {
    const id = (button as { id?: unknown }).id
    const name = type === 'reminder' ? 'cta_reminder' : 'cta_cancel_reminder'
    return { name, buttonParamsJson: JSON.stringify({ display_text: text, id: nonEmpty(id) ? id : text }) }
  }
  if (type === 'address') {
    const id = (button as { id?: unknown }).id
    return { name: 'address_message', buttonParamsJson: JSON.stringify({ display_text: text, id: nonEmpty(id) ? id : text }) }
  }
  throw new ZaileysBuilderError('INVALID_OPTIONS', `unknown button type: ${String(type)}`)
}

/** Serialize {@link BottomSheetOptions}/{@link LimitedTimeOfferOptions} into the nativeFlow `messageParamsJson` string. */
export const buildMessageParamsJson = (opts?: ButtonsContentOptions): string => {
  const params: Record<string, unknown> = {}
  if (opts?.bottomSheet) {
    const b = opts.bottomSheet
    params['bottom_sheet'] = {
      ...(b.buttonsLimit !== undefined ? { in_thread_buttons_limit: b.buttonsLimit } : {}),
      ...(b.dividers !== undefined ? { divider_indices: b.dividers } : {}),
      ...(b.listTitle !== undefined ? { list_title: b.listTitle } : {}),
      ...(b.buttonTitle !== undefined ? { button_title: b.buttonTitle } : {}),
    }
  }
  if (opts?.limitedTimeOffer) {
    const o = opts.limitedTimeOffer
    params['limited_time_offer'] = {
      ...(o.text !== undefined ? { text: o.text } : {}),
      ...(o.url !== undefined ? { url: o.url } : {}),
      ...(o.copyCode !== undefined ? { copy_code: o.copyCode } : {}),
      ...(o.expiresAt !== undefined ? { expiration_time: o.expiresAt } : {}),
    }
  }
  return Object.keys(params).length > 0 ? JSON.stringify(params) : ''
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
    nativeFlowMessage: { buttons: nativeButtons, messageParamsJson: buildMessageParamsJson(opts) },
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
