import { describe, expect, it } from 'vitest'
import { parseRichMarkdown } from '../../src/builder/content/markdown.js'
import type { AIRichPart } from '../../src/builder/content/airich.js'

const types = (parts: AIRichPart[]): string[] => parts.map((p) => p.type)
const find = <T extends AIRichPart['type']>(parts: AIRichPart[], t: T): Extract<AIRichPart, { type: T }> =>
  parts.find((p) => p.type === t) as Extract<AIRichPart, { type: T }>

describe('parseRichMarkdown', () => {
  it('groups plain prose into a single text part', () => {
    const parts = parseRichMarkdown('Halo dunia\nbaris kedua')
    expect(types(parts)).toEqual(['text'])
    expect(find(parts, 'text').text).toBe('Halo dunia\nbaris kedua')
  })

  it('segments a fenced code block with its language', () => {
    const parts = parseRichMarkdown('intro\n\n```ts\nconst x = 1\n```\n\noutro')
    expect(types(parts)).toEqual(['text', 'code', 'text'])
    const code = find(parts, 'code')
    expect(code.language).toBe('ts')
    expect(code.content).toBe('const x = 1')
  })

  it('emits a code part without language when the fence is bare', () => {
    const parts = parseRichMarkdown('```\nplain\n```')
    const code = find(parts, 'code')
    expect(code.language).toBeUndefined()
    expect(code.content).toBe('plain')
  })

  it('parses a GitHub-style table into rows', () => {
    const parts = parseRichMarkdown('| A | B |\n|---|---|\n| 1 | 2 |\n| 3 | 4 |')
    const table = find(parts, 'table')
    expect(table.rows).toEqual([['A', 'B'], ['1', '2'], ['3', '4']])
  })

  it('collects consecutive image lines into one image part', () => {
    const parts = parseRichMarkdown('![a](https://x.test/1.png)\n![b](https://x.test/2.png)')
    const image = find(parts, 'image')
    expect(image.url).toEqual(['https://x.test/1.png', 'https://x.test/2.png'])
  })

  it('parses a :::suggest directive (pipe-split)', () => {
    const parts = parseRichMarkdown(':::suggest\nLihat menu | Pesan sekarang\n:::')
    expect(find(parts, 'suggest').prompts).toEqual(['Lihat menu', 'Pesan sekarang'])
  })

  it('parses a :::product directive into product cards', () => {
    const md = [
      ':::product',
      '- title: Pizza | price: $7 | sale: $6 | image: https://x.test/p.png | brand: zaileys',
      '- title: Ramen | price: $6 | sale: $5',
      ':::',
    ].join('\n')
    const products = find(parseRichMarkdown(md), 'product').products as Array<Record<string, unknown>>
    expect(products).toHaveLength(2)
    expect(products[0]).toMatchObject({ title: 'Pizza', price: '$7', salePrice: '$6', image: 'https://x.test/p.png', brand: 'zaileys' })
    expect(products[1]).toMatchObject({ title: 'Ramen', price: '$6', salePrice: '$5' })
  })

  it('parses a :::video directive with optional duration', () => {
    const video = find(parseRichMarkdown(':::video\nhttps://x.test/v.mp4 | 12\n:::'), 'video')
    expect(video.url).toBe('https://x.test/v.mp4')
    expect(video.duration).toBe(12)
  })

  it('parses a :::reels directive with typed fields', () => {
    const reels = find(parseRichMarkdown(':::reels\n- user: zeative | url: https://x.test/r.mp4 | views: 999 | verified: true\n:::'), 'reels')
    const list = reels.reels as Array<Record<string, unknown>>
    expect(list[0]).toMatchObject({ username: 'zeative', url: 'https://x.test/r.mp4', views: 999, verified: true })
  })

  it('handles a mixed document end-to-end', () => {
    const md = [
      'Halo **bro**',
      '',
      '```js',
      'const x = 1',
      '```',
      '',
      '| A | B |',
      '|---|---|',
      '| 1 | 2 |',
      '',
      ':::suggest',
      'A | B',
      ':::',
    ].join('\n')
    expect(types(parseRichMarkdown(md))).toEqual(['text', 'code', 'table', 'suggest'])
  })
})
