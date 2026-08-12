import { describe, expect, it } from 'vitest'
import {
  buildGroupStatusContent,
  parseStatusArgb,
  resolveStatusFont,
} from '../../src/builder/content/group-status.js'
import { RELAY_CONTENT_KEY, RELAY_REQUIRE_GROUP_KEY } from '../../src/builder/content/buttons.js'
import { ZaileysBuilderError } from '../../src/builder/errors.js'

type ExtendedText = { text: string; backgroundArgb?: number; font?: number }

const statusOf = (content: unknown): ExtendedText =>
  (content as Record<string, { groupStatusMessageV2: { message: { extendedTextMessage: ExtendedText } } }>)[
    RELAY_CONTENT_KEY
  ]!.groupStatusMessageV2.message.extendedTextMessage

const expectError = (fn: () => unknown, code: string) => {
  try {
    fn()
    expect.unreachable('expected throw')
  } catch (e) {
    expect(e).toBeInstanceOf(ZaileysBuilderError)
    expect((e as ZaileysBuilderError).code).toBe(code)
  }
}

describe('parseStatusArgb', () => {
  it('expands #RGB as CSS shorthand', () => {
    expect(parseStatusArgb('#f00')).toBe(0xffff0000)
  })

  it('accepts 6-digit hex with and without the hash', () => {
    expect(parseStatusArgb('#FF0000')).toBe(0xffff0000)
    expect(parseStatusArgb('FF0000')).toBe(0xffff0000)
  })

  it('preserves alpha on 8-digit hex', () => {
    expect(parseStatusArgb('#80FF0000')).toBe(0x80ff0000)
  })

  it('passes a positive integer through', () => {
    expect(parseStatusArgb(0xff00ff00)).toBe(0xff00ff00)
  })

  it('honours zero instead of dropping it', () => {
    expect(parseStatusArgb(0)).toBe(0)
  })

  it('wraps a negative integer into unsigned ARGB', () => {
    expect(parseStatusArgb(-1)).toBe(0xffffffff)
  })

  it('rejects malformed hex, out-of-range and non-integer values', () => {
    for (const bad of ['#12', 'zzzzzz', '1234567', '', 1.5, Number.NaN, Number.POSITIVE_INFINITY, 0x100000000]) {
      expectError(() => parseStatusArgb(bad as string | number), 'INVALID_OPTIONS')
    }
  })
})

describe('resolveStatusFont', () => {
  it('maps named fonts to their FontType value', () => {
    expect(resolveStatusFont('system')).toBe(0)
    expect(resolveStatusFont('system-text')).toBe(1)
    expect(resolveStatusFont('fb-script')).toBe(2)
    expect(resolveStatusFont('system-bold')).toBe(6)
    expect(resolveStatusFont('morningbreeze')).toBe(7)
    expect(resolveStatusFont('calistoga')).toBe(8)
    expect(resolveStatusFont('exo2')).toBe(9)
    expect(resolveStatusFont('courierprime')).toBe(10)
  })

  it('passes a raw non-negative integer through for forward compatibility', () => {
    expect(resolveStatusFont(9)).toBe(9)
    expect(resolveStatusFont(99)).toBe(99)
  })

  it('rejects unknown names and invalid numbers', () => {
    expectError(() => resolveStatusFont('comic-sans' as 'system'), 'INVALID_OPTIONS')
    expectError(() => resolveStatusFont(-1), 'INVALID_OPTIONS')
    expectError(() => resolveStatusFont(2.5), 'INVALID_OPTIONS')
  })
})

describe('buildGroupStatusContent', () => {
  it('wraps the text in a groupStatusMessageV2 relay envelope', () => {
    const content = buildGroupStatusContent('halo')
    expect(statusOf(content).text).toBe('halo')
  })

  it('marks the content as group-only', () => {
    const content = buildGroupStatusContent('halo') as unknown as Record<string, unknown>
    expect(content[RELAY_REQUIRE_GROUP_KEY]).toBe('groupStatus()')
  })

  it('omits backgroundArgb and font entirely when no options are given', () => {
    const node = statusOf(buildGroupStatusContent('halo'))
    expect('backgroundArgb' in node).toBe(false)
    expect('font' in node).toBe(false)
  })

  it('applies backgroundColor and font when given', () => {
    const node = statusOf(buildGroupStatusContent('halo', { backgroundColor: '#25D366', font: 'calistoga' }))
    expect(node.backgroundArgb).toBe(0xff25d366)
    expect(node.font).toBe(8)
  })

  it('emits backgroundArgb 0 and font 0 rather than dropping them', () => {
    const node = statusOf(buildGroupStatusContent('halo', { backgroundColor: 0, font: 'system' }))
    expect(node.backgroundArgb).toBe(0)
    expect(node.font).toBe(0)
  })

  it('rejects blank or non-string text', () => {
    expectError(() => buildGroupStatusContent(''), 'EMPTY_CONTENT')
    expectError(() => buildGroupStatusContent('   '), 'EMPTY_CONTENT')
    expectError(() => buildGroupStatusContent(undefined as unknown as string), 'EMPTY_CONTENT')
  })
})
