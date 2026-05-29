import type { AnyMessageContent } from 'baileys'
import { ZaileysBuilderError } from '../errors.js'
import type { ButtonDef } from '../types.js'

const MAX_BUTTONS = 3

/**
 * A single quick-reply template button. `id` is echoed verbatim by WhatsApp as
 * `buttonsResponseMessage.selectedButtonId`, which Phase 4 `decodeButtonClick`
 * surfaces as `ButtonClickPayload.buttonId` — the cross-phase round-trip contract.
 */
export type TemplateQuickReplyButton = {
  index: number
  quickReplyButton: { displayText: string; id: string }
}

/** Interactive button-message content; carried as a structural shape past the Baileys public `AnyMessageContent` type. */
export type ButtonsContent = {
  text: string
  footer?: string
  templateButtons: TemplateQuickReplyButton[]
}

/** Optional decoration for {@link buildButtonsContent}. */
export type ButtonsContentOptions = {
  text?: string
  footer?: string
}

/**
 * Build interactive button content from declarative {@link ButtonDef}s.
 *
 * rc13 decision: the public `AnyMessageContent` union no longer exposes a
 * `templateButtons`/`buttons` branch (legacy outbound button generation was
 * dropped). The `templateButtons` shape is still accepted by the relay layer and
 * is what `decodeButtonClick` round-trips against, so it is emitted here and cast
 * to `AnyMessageContent` at the builder boundary rather than fabricating an
 * `interactiveMessage` proto by hand.
 *
 * Each `ButtonDef.id` lands in `quickReplyButton.id` and returns unchanged as
 * `ButtonClickPayload.buttonId` (Phase 4 EVT-11).
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
  const templateButtons = buttons.map((button, i): TemplateQuickReplyButton => {
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
    return { index: i + 1, quickReplyButton: { displayText: button.text, id: button.id } }
  })

  const content: ButtonsContent = {
    text: opts?.text && opts.text.length > 0 ? opts.text : ' ',
    templateButtons,
  }
  if (opts?.footer && opts.footer.length > 0) content.footer = opts.footer
  return content as unknown as AnyMessageContent
}
