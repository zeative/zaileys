import type { WACallEvent } from 'baileys'
import { describe, expect, it } from 'vitest'
import { decodeCallEnded, decodeCallIncoming } from '../../../src/events/decoders/calls.js'

const baseCall = (overrides: Partial<WACallEvent> = {}): WACallEvent => ({
  chatId: '628111@s.whatsapp.net',
  from: '628111@s.whatsapp.net',
  id: 'call-1',
  date: new Date('2026-01-01T00:00:00.000Z'),
  status: 'offer',
  offline: false,
  ...overrides,
})

describe('decodeCallIncoming', () => {
  it('decodes a voice offer', () => {
    const out = decodeCallIncoming(baseCall({ status: 'offer' }))
    expect(out).toEqual({
      kind: 'incoming',
      callId: 'call-1',
      from: '628111@s.whatsapp.net',
      isGroup: false,
      isVideo: false,
      timestamp: Date.parse('2026-01-01T00:00:00.000Z'),
      status: 'offer',
    })
  })

  it('decodes a video offer', () => {
    const out = decodeCallIncoming(baseCall({ status: 'offer', isVideo: true }))
    expect(out?.isVideo).toBe(true)
    expect(out?.kind).toBe('incoming')
  })

  it('decodes a ringing event', () => {
    const out = decodeCallIncoming(baseCall({ status: 'ringing' }))
    expect(out?.status).toBe('ringing')
    expect(out?.kind).toBe('incoming')
  })

  it('flags a group call', () => {
    const out = decodeCallIncoming(baseCall({ status: 'offer', isGroup: true, groupJid: 'g@g.us' }))
    expect(out?.isGroup).toBe(true)
  })

  it('returns null when id is missing', () => {
    const out = decodeCallIncoming(baseCall({ status: 'offer', id: '' }))
    expect(out).toBeNull()
  })

  it('returns null for an accept status (delegated to ended decoder)', () => {
    expect(decodeCallIncoming(baseCall({ status: 'accept' }))).toBeNull()
  })

  it('returns null for terminate', () => {
    expect(decodeCallIncoming(baseCall({ status: 'terminate' }))).toBeNull()
  })

  it('returns null for unknown intermediate statuses', () => {
    expect(decodeCallIncoming(baseCall({ status: 'preaccept' }))).toBeNull()
    expect(decodeCallIncoming(baseCall({ status: 'transport' }))).toBeNull()
  })
})

describe('decodeCallEnded', () => {
  it('decodes a timeout', () => {
    const out = decodeCallEnded(baseCall({ status: 'timeout' }))
    expect(out).toEqual({
      kind: 'ended',
      callId: 'call-1',
      from: '628111@s.whatsapp.net',
      isGroup: false,
      isVideo: false,
      timestamp: Date.parse('2026-01-01T00:00:00.000Z'),
      status: 'timeout',
    })
  })

  it('decodes a reject', () => {
    const out = decodeCallEnded(baseCall({ status: 'reject' }))
    expect(out?.status).toBe('reject')
    expect(out?.kind).toBe('ended')
  })

  it('decodes an accept (answered call transitions out of ringing)', () => {
    const out = decodeCallEnded(baseCall({ status: 'accept' }))
    expect(out?.status).toBe('accept')
    expect(out?.kind).toBe('ended')
  })

  it('decodes a terminate', () => {
    const out = decodeCallEnded(baseCall({ status: 'terminate' }))
    expect(out?.status).toBe('terminate')
  })

  it('preserves video flag and group flag', () => {
    const out = decodeCallEnded(baseCall({ status: 'terminate', isVideo: true, isGroup: true }))
    expect(out?.isVideo).toBe(true)
    expect(out?.isGroup).toBe(true)
  })

  it('returns null when id is missing', () => {
    expect(decodeCallEnded(baseCall({ status: 'terminate', id: '' }))).toBeNull()
  })

  it('returns null for an offer (delegated to incoming decoder)', () => {
    expect(decodeCallEnded(baseCall({ status: 'offer' }))).toBeNull()
    expect(decodeCallEnded(baseCall({ status: 'ringing' }))).toBeNull()
  })
})
