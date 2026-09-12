import type { AnyMessageContent } from 'baileys'
import { ZaileysBuilderError } from '../errors.js'
import { buildAIRichContent, type AIRichPart } from './airich.js'
import { buildButtonsContent, RELAY_BYPASS_DOWNLOAD_KEY } from './buttons.js'

export type HtmlAppDevice = 'android' | 'ios' | 'web' | 'desktop' | 'unknown'

export type HtmlAppOptions = {
  /** From baileys' `getDevice(messageId)`. Anything but `android` takes the fallback. */
  device?: HtmlAppDevice
  /** Where non-Android clients open the page instead. Required unless the device is android. */
  fallbackUrl?: string
  fallbackButtonText?: string
  /** Rendered above the card, and as the body of the fallback message. */
  text?: string
  footer?: string
  trustedSources?: string[]
  /** Pins the page height so the host stops re-measuring a bubble whose height follows its width. */
  height?: number
  /**
   * Follows the card with an identical edit so it renders immediately instead of behind WhatsApp's
   * "can't verify the security of this media" prompt. Costs one extra relay and one re-render, so a
   * page running an animation restarts once. Defaults to on.
   */
  bypassDownload?: boolean
}

/**
 * Only WhatsApp Android renders an inline HTML primitive. Every other client drops the section and
 * leaves an empty bubble, so they get a webview button to the same page instead.
 */
export const buildHtmlAppContent = (html: string, opts: HtmlAppOptions = {}): AnyMessageContent => {
  if (typeof html !== 'string' || html.trim().length === 0) {
    throw new ZaileysBuilderError('INVALID_OPTIONS', 'htmlApp() requires a non-empty HTML string')
  }
  if ((opts.device ?? 'android') === 'android') {
    const parts: AIRichPart[] = []
    if (opts.text !== undefined) parts.push({ type: 'text', text: opts.text })
    parts.push({
      type: 'html',
      html,
      ...(opts.trustedSources === undefined ? {} : { trustedSources: opts.trustedSources }),
      ...(opts.height === undefined ? {} : { height: opts.height }),
    })
    const content = buildAIRichContent(parts, {
      ...(opts.text === undefined ? {} : { title: opts.text }),
      ...(opts.footer === undefined ? {} : { footer: opts.footer }),
    }) as unknown as Record<string, unknown>
    if (opts.bypassDownload !== false) content[RELAY_BYPASS_DOWNLOAD_KEY] = true
    return content as unknown as AnyMessageContent
  }
  if (opts.fallbackUrl === undefined) {
    throw new ZaileysBuilderError(
      'INVALID_OPTIONS',
      `htmlApp() cannot render inline HTML on "${opts.device}"; pass fallbackUrl to send a webview button instead`,
    )
  }
  return buildButtonsContent([{ type: 'url', text: opts.fallbackButtonText ?? 'Buka', url: opts.fallbackUrl, webview: true }], {
    text: opts.text ?? '',
    ...(opts.footer === undefined ? {} : { footer: opts.footer }),
  })
}
