import { describe, expect, it } from 'vitest'
import { applyGroupStatusWrap, markAsGroupStatus } from '../../src/builder/status-wrap.js'

describe('group status wrap', () => {
  it('leaves an unmarked message untouched', () => {
    const msg = { imageMessage: { url: 'x' } }
    expect(applyGroupStatusWrap(msg)).toBe(msg)
  })

  it('wraps a marked message into the groupStatusMessageV2 envelope', () => {
    const msg = { imageMessage: { url: 'x' } }
    markAsGroupStatus(msg)
    const out = applyGroupStatusWrap(msg) as unknown as Record<string, Record<string, unknown>>
    expect(Object.keys(out)).toEqual(['messageContextInfo', 'groupStatusMessageV2'])
    const inner = (out['groupStatusMessageV2'] as unknown as { message: Record<string, unknown> }).message
    expect(inner['imageMessage']).toEqual({ url: 'x' })
  })

  it('puts a 32-byte messageSecret both outside and inside the envelope', () => {
    const msg = { videoMessage: {} }
    markAsGroupStatus(msg)
    const out = applyGroupStatusWrap(msg) as unknown as {
      messageContextInfo: { messageSecret: Uint8Array }
      groupStatusMessageV2: { message: { messageContextInfo: { messageSecret: Uint8Array } } }
    }
    expect(out.messageContextInfo.messageSecret.length).toBe(32)
    expect(out.groupStatusMessageV2.message.messageContextInfo.messageSecret).toEqual(
      out.messageContextInfo.messageSecret,
    )
  })

  it('only wraps once — the mark is consumed', () => {
    const msg = { imageMessage: {} }
    markAsGroupStatus(msg)
    applyGroupStatusWrap(msg)
    expect(applyGroupStatusWrap(msg)).toBe(msg)
  })
})
