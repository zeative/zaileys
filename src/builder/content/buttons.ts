import { proto, type AnyMessageContent } from 'baileys'
import { ZaileysBuilderError } from '../errors.js'
import type { ButtonDef } from '../types.js'

const MAX_BUTTONS = 3

/**
 * Marker key on builder content whose value is a raw `proto.IMessage` to be sent
 * via `relayMessage` (used for interactive messages Baileys' `sendMessage` content
 * union does not cover). The builder detects this key and relays instead of calling
 * `sendMessage`.
 */
export const RELAY_CONTENT_KEY = '__zaileysRelayMessage'

/** Content shape carrying a pre-built proto message for the relay send path. */
export type RelayContent = { [RELAY_CONTENT_KEY]: proto.IMessage }

/** Optional decoration for {@link buildButtonsContent}. */
export type ButtonsContentOptions = {
  text?: string
  footer?: string
}

/**
 * Build a modern `interactiveMessage` (nativeFlow `quick_reply`) from declarative
 * {@link ButtonDef}s, returned as relay-marker content. Each `ButtonDef.id` is
 * encoded into `buttonParamsJson` and returns unchanged on tap via
 * `interactiveResponseMessage.nativeFlowResponseMessage` -> `ButtonClickPayload.buttonId`.
 *
 * NOTE: WhatsApp only RENDERS interactive buttons for eligible accounts
 * (WhatsApp Business / Cloud API). On personal/regular accounts the message is
 * delivered but the buttons are not displayed — a WhatsApp platform restriction,
 * not a library limitation.
 *
 * @param buttons - 1..3 button definitions; ids and labels must be non-empty.
 * @param opts - optional body `text` and `footer`.
 * @throws ZaileysBuilderError `INVALID_OPTIONS` on empty list, >3 buttons, or blank id/text.
 */
export const buildButtonsContent = (
  buttons: ButtonDef[],
  opts?: ButtonsContentOptions,
): AnyMessageContent => {
  if (!Array.isArray(buttons) || buttons.length === 0) {
    throw new ZaileysBuilderError('INVALID_OPTIONS', 'buttons() requires at least one button')
  }
  if (buttons.length > MAX_BUTTONS) {
    throw new ZaileysBuilderError('INVALID_OPTIONS', `buttons() accepts at most ${MAX_BUTTONS} buttons`)
  }
  const seen = new Set<string>()
  const nativeButtons = buttons.map((button) => {
    if (typeof button.id !== 'string' || button.id.length === 0) {
      throw new ZaileysBuilderError('INVALID_OPTIONS', 'button id must be a non-empty string')
    }
    if (typeof button.text !== 'string' || button.text.trim().length === 0) {
      throw new ZaileysBuilderError('INVALID_OPTIONS', 'button text must be a non-empty string')
    }
    if (seen.has(button.id)) {
      throw new ZaileysBuilderError('INVALID_OPTIONS', `duplicate button id: ${button.id}`)
    }
    seen.add(button.id)
    return {
      name: 'quick_reply',
      buttonParamsJson: JSON.stringify({ display_text: button.text, id: button.id }),
    }
  })

  const interactiveMessage: proto.Message.IInteractiveMessage = {
    body: { text: opts?.text && opts.text.length > 0 ? opts.text : ' ' },
    nativeFlowMessage: { buttons: nativeButtons, messageParamsJson: '' },
  }
  if (opts?.footer && opts.footer.length > 0) {
    interactiveMessage.footer = { text: opts.footer }
  }

  const relay: RelayContent = { [RELAY_CONTENT_KEY]: { interactiveMessage } }
  return relay as unknown as AnyMessageContent
}
