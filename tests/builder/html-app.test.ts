import { describe, expect, it } from 'vitest'
import { AI_RICH_HTML_PRIMITIVE } from '../../src/builder/content/airich.js'
import { RELAY_CONTENT_KEY } from '../../src/builder/content/buttons.js'
import { buildHtmlAppContent } from '../../src/builder/content/html-app.js'
import { ZaileysBuilderError } from '../../src/builder/errors.js'

const HTML = '<body><div id="a">hi</div></body>'

type Inner = {
  botForwardedMessage?: { message: { richResponseMessage: { unifiedResponse: { data: string } } } }
  interactiveMessage?: { body?: { text?: string }; nativeFlowMessage?: { buttons: Array<{ name: string; buttonParamsJson: string }> } }
}
const innerOf = (content: unknown): Inner => (content as Record<string, Inner>)[RELAY_CONTENT_KEY]!
const primitivesOf = (content: unknown): Array<Record<string, unknown>> => {
  const data = innerOf(content).botForwardedMessage!.message.richResponseMessage.unifiedResponse.data
  const decoded = JSON.parse(Buffer.from(data, 'base64').toString('utf8')) as {
    sections: Array<{ view_model: { primitive?: Record<string, unknown> } }>
  }
  return decoded.sections.map((s) => s.view_model.primitive!).filter(Boolean)
}

describe('buildHtmlAppContent', () => {
  it('emits the android-only HTML primitive carrying the document verbatim', () => {
    const primitives = primitivesOf(buildHtmlAppContent(HTML, { device: 'android' }))
    const html = primitives.find((p) => p['__typename'] === AI_RICH_HTML_PRIMITIVE)
    expect(html?.['payload']).toBe(HTML)
    expect(html?.['trusted_sources']).toEqual([])
  })

  it('defaults to the inline path when no device is given', () => {
    expect(primitivesOf(buildHtmlAppContent(HTML)).some((p) => p['__typename'] === AI_RICH_HTML_PRIMITIVE)).toBe(true)
  })

  it('prepends a height lock that pins the page so the bubble stops re-measuring', () => {
    const html = primitivesOf(buildHtmlAppContent(HTML, { height: 160 })).find(
      (p) => p['__typename'] === AI_RICH_HTML_PRIMITIVE,
    )
    expect(html?.['payload']).toContain('height:160px')
    expect(html?.['payload']).toContain(HTML)
  })

  it('keeps the leading text as its own markdown section', () => {
    const primitives = primitivesOf(buildHtmlAppContent(HTML, { text: 'judul' }))
    expect(primitives[0]?.['__typename']).toBe('GenAIMarkdownTextUXPrimitive')
    expect(primitives[0]?.['text']).toBe('judul')
  })

  it.each(['ios', 'web', 'desktop', 'unknown'] as const)('sends a webview button instead of empty HTML on %s', (device) => {
    const inner = innerOf(buildHtmlAppContent(HTML, { device, fallbackUrl: 'https://e.dev', fallbackButtonText: 'Buka' }))
    expect(inner.botForwardedMessage).toBeUndefined()
    const button = inner.interactiveMessage?.nativeFlowMessage?.buttons[0]
    expect(button?.name).toBe('cta_url')
    const params = JSON.parse(button!.buttonParamsJson) as Record<string, unknown>
    expect(params['url']).toBe('https://e.dev')
    expect(params['landing_page_url']).toBe('https://e.dev')
    expect(params['webview_interaction']).toBe(true)
  })

  it('refuses a non-android device with no fallback rather than sending an empty bubble', () => {
    expect(() => buildHtmlAppContent(HTML, { device: 'ios' })).toThrow(ZaileysBuilderError)
  })

  it('rejects empty html', () => {
    expect(() => buildHtmlAppContent('   ')).toThrow(ZaileysBuilderError)
  })
})
