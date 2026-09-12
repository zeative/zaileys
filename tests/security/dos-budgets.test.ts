import { describe, expect, it } from 'vitest'
import { extractLinks } from '../../src/events/context.js'
import { buildAIRichContent } from '../../src/builder/content/airich.js'
import { parseRichMarkdown } from '../../src/builder/content/markdown.js'

const under = (ms: number, fn: () => void): number => {
  const t = process.hrtime.bigint()
  fn()
  const took = Number(process.hrtime.bigint() - t) / 1e6
  expect(took).toBeLessThan(ms)
  return took
}

describe('one message must not stall the event loop', () => {
  it('extractLinks survives a long punctuation run inside a URL', () => {
    const payload = `http://a${'.'.repeat(60_000)}x`
    under(250, () => extractLinks(payload))
  })

  it('extractLinks survives an all-punctuation tail', () => {
    under(250, () => extractLinks(`http://a${'.'.repeat(60_000)}`))
  })

  it('rich text survives unbalanced bracket spam', () => {
    const payload = '['.repeat(20_000) + ']('.repeat(20_000)
    under(1_000, () => buildAIRichContent([{ type: 'text', text: payload }]))
  })

  it('markdown table separator survives a long dash run', () => {
    const payload = `| a |\n|${'-'.repeat(50_000)}!\n| b |`
    under(500, () => parseRichMarkdown(payload))
  })

  it('a table with an absurd cell count is rejected, not allocated', () => {
    const rows = Array.from({ length: 3_000 }, () => Array.from({ length: 200 }, () => 'x'))
    expect(() => buildAIRichContent([{ type: 'table', rows }])).toThrow(/cells/)
  })

  it('a table with too many rows is rejected', () => {
    const rows = Array.from({ length: 6_000 }, () => ['a'])
    expect(() => buildAIRichContent([{ type: 'table', rows }])).toThrow(/rows/)
  })

  it('an ordinary table still works', () => {
    const out = buildAIRichContent([{ type: 'table', rows: [['h1', 'h2'], ['a'], ['b', 'c']] }])
    expect(out).toBeTruthy()
  })
})
