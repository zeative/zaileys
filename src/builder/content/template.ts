import type { AnyMessageContent } from 'baileys'
import { ZaileysBuilderError } from '../errors.js'
import type { TemplateOptions } from '../types.js'
import { buildButtonsContent, type ButtonsContentOptions } from './buttons.js'

const MAX_BUTTONS = 3

export const buildTemplateContent = (opts: TemplateOptions): AnyMessageContent => {
  if (typeof opts?.body !== 'string' || opts.body.trim().length === 0) {
    throw new ZaileysBuilderError('INVALID_OPTIONS', 'template() requires a non-empty body')
  }
  if (!Array.isArray(opts.buttons) || opts.buttons.length === 0) {
    throw new ZaileysBuilderError('INVALID_OPTIONS', 'template() requires at least one button')
  }
  if (opts.buttons.length > MAX_BUTTONS) {
    throw new ZaileysBuilderError('INVALID_OPTIONS', `template() accepts at most ${MAX_BUTTONS} buttons`)
  }
  const header = opts.header && opts.header.length > 0 ? `*${opts.header}*\n\n` : ''
  const buttonOpts: ButtonsContentOptions = { text: `${header}${opts.body}` }
  if (opts.footer !== undefined) buttonOpts.footer = opts.footer
  return buildButtonsContent(opts.buttons, buttonOpts)
}
