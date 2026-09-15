import type { AnyMessageContent } from 'baileys'
import { ZaileysBuilderError } from '../errors.js'
import { SafeHtml } from '../html.js'
import { buildAIRichContent } from './airich.js'
import { buildTextContent } from './text.js'

/** Default byte ceiling for `htmlApp()` markup. */
export const HTML_APP_MAX_BYTES = 256 * 1024

const MAX_HEIGHT = 4096

export interface HtmlAppOptions {
  /** Small label shown above the card. Default: none. */
  title?: string
  /** Pins the card height in CSS pixels (1–4096) so the bubble stops re-measuring. Default: the page's own height. */
  height?: number
  /** Recipient device, usually `ctx.senderDevice`; non-`'android'` sends `fallback` or throws. Default: Android. */
  device?: string
  /** Plain text sent instead of the card when `device` is not Android. Default: none. */
  fallback?: string
  /** Byte ceiling for the UTF-8 markup. Default 256 KB. */
  maxBytes?: number
}

const assertPositiveInteger = (name: string, value: number | undefined, max?: number): void => {
  if (value === undefined) return
  if (!Number.isInteger(value) || value <= 0 || (max !== undefined && value > max)) {
    const range = max === undefined ? 'a positive integer' : `an integer from 1 to ${max}`
    throw new ZaileysBuilderError('INVALID_OPTIONS', `htmlApp() ${name} must be ${range}, got ${String(value)}`)
  }
}

/** Builds an inline HTML card. WhatsApp renders it only on Android, with no network or storage access. */
export const buildHtmlAppContent = (markup: string | SafeHtml, opts: HtmlAppOptions = {}): AnyMessageContent => {
  const source = markup instanceof SafeHtml ? markup.value : markup
  if (typeof source !== 'string' || source.trim().length === 0) {
    throw new ZaileysBuilderError('EMPTY_CONTENT', 'htmlApp() requires a non-empty HTML string')
  }
  if (opts.fallback !== undefined && (typeof opts.fallback !== 'string' || opts.fallback.trim().length === 0)) {
    throw new ZaileysBuilderError('INVALID_OPTIONS', 'htmlApp() fallback must be a non-empty string')
  }
  assertPositiveInteger('height', opts.height, MAX_HEIGHT)
  assertPositiveInteger('maxBytes', opts.maxBytes)
  const maxBytes = opts.maxBytes ?? HTML_APP_MAX_BYTES
  const bytes = Buffer.byteLength(source, 'utf8')
  if (bytes > maxBytes) {
    throw new ZaileysBuilderError(
      'INVALID_OPTIONS',
      `htmlApp() markup is ${bytes} bytes, over the ${maxBytes} byte limit; raise maxBytes or trim the page`,
    )
  }
  if (opts.device !== undefined && opts.device !== 'android') {
    if (opts.fallback === undefined) {
      throw new ZaileysBuilderError(
        'INVALID_RECIPIENT',
        `htmlApp() renders only on Android, not "${opts.device}"; check ctx.senderDevice first or pass fallback`,
      )
    }
    return buildTextContent(opts.fallback)
  }
  return buildAIRichContent(
    [{ type: 'html', html: source, ...(opts.height === undefined ? {} : { height: opts.height }) }],
    opts.title === undefined ? undefined : { title: opts.title },
  )
}
