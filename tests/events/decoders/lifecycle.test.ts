import { describe, expect, it } from 'vitest'
import {
  decodeHistorySync,
  decodeLimited,
  decodeNewsletter,
  decodePresence,
} from '../../../src/events/decoders/lifecycle.js'

describe('decodeHistorySync', () => {
  it('passes through an INITIAL_BOOTSTRAP complete status', () => {
    const out = decodeHistorySync({ syncType: 1, status: 'complete', explicit: true })
    expect(out).toEqual({ syncType: '1', status: 'complete', explicit: true })
  })

  it('passes through a paused status', () => {
    const out = decodeHistorySync({ syncType: 2, status: 'paused', explicit: false })
    expect(out).toEqual({ syncType: '2', status: 'paused', explicit: false })
  })

  it('marks inferred (non-explicit) completion', () => {
    const out = decodeHistorySync({ syncType: 3, status: 'complete', explicit: false })
    expect(out?.explicit).toBe(false)
  })

  it('coerces a string syncType', () => {
    const out = decodeHistorySync({ syncType: 'RECENT', status: 'complete', explicit: true })
    expect(out?.syncType).toBe('RECENT')
  })

  it('returns null for an invalid status', () => {
    expect(decodeHistorySync({ syncType: 1, status: 'bogus', explicit: true })).toBeNull()
  })
})

describe('decodeLimited', () => {
  it('emits a reachout-timelock when active', () => {
    const ends = new Date('2026-02-01T00:00:00.000Z')
    const out = decodeLimited({
      source: 'connection-update',
      reachoutTimeLock: { isActive: true, timeEnforcementEnds: ends },
    })
    expect(out).toEqual({ reason: 'reachout-timelock', retryAt: ends.getTime() })
  })

  it('returns null for an inactive reachout timelock', () => {
    const out = decodeLimited({
      source: 'connection-update',
      reachoutTimeLock: { isActive: false, timeEnforcementEnds: new Date() },
    })
    expect(out).toBeNull()
  })

  it('returns null for a reachout with no isActive flag', () => {
    expect(decodeLimited({ source: 'connection-update', reachoutTimeLock: {} })).toBeNull()
  })

  it('emits chat-limit-reached for a CAPPED status', () => {
    const out = decodeLimited({
      source: 'message-capping',
      capInfo: { capping_status: 'CAPPED', used_quota: 50, total_quota: 50 },
    })
    expect(out).toEqual({ reason: 'chat-limit-reached', usedQuota: 50, totalQuota: 50 })
  })

  it('returns null for a FIRST_WARNING status', () => {
    expect(
      decodeLimited({ source: 'message-capping', capInfo: { capping_status: 'FIRST_WARNING' } }),
    ).toBeNull()
  })

  it('returns null for a NONE status', () => {
    expect(
      decodeLimited({ source: 'message-capping', capInfo: { capping_status: 'NONE' } }),
    ).toBeNull()
  })

  it('omits absent quota fields on chat-limit-reached', () => {
    const out = decodeLimited({ source: 'message-capping', capInfo: { capping_status: 'CAPPED' } })
    expect(out).toEqual({ reason: 'chat-limit-reached' })
  })
})

describe('decodePresence', () => {
  it('decodes a single presence', () => {
    const out = decodePresence({
      id: '628111@s.whatsapp.net',
      presences: { '628111@s.whatsapp.net': { lastKnownPresence: 'available' } },
    })
    expect(out).toEqual([
      { jid: '628111@s.whatsapp.net', participant: '628111@s.whatsapp.net', status: 'available' },
    ])
  })

  it('decodes multiple participants in a group', () => {
    const out = decodePresence({
      id: 'g@g.us',
      presences: {
        '628111@s.whatsapp.net': { lastKnownPresence: 'composing' },
        '628222@s.whatsapp.net': { lastKnownPresence: 'unavailable' },
      },
    })
    expect(out).toHaveLength(2)
    expect(out).toContainEqual({ jid: 'g@g.us', participant: '628111@s.whatsapp.net', status: 'composing' })
    expect(out).toContainEqual({ jid: 'g@g.us', participant: '628222@s.whatsapp.net', status: 'unavailable' })
  })

  it('decodes a recording status', () => {
    const out = decodePresence({ id: 'x@s.whatsapp.net', presences: { 'x@s.whatsapp.net': { lastKnownPresence: 'recording' } } })
    expect(out[0]?.status).toBe('recording')
  })

  it('returns an empty array for empty presences', () => {
    expect(decodePresence({ id: 'x@s.whatsapp.net', presences: {} })).toEqual([])
  })

  it('skips entries missing lastKnownPresence', () => {
    const out = decodePresence({
      id: 'g@g.us',
      presences: {
        '628111@s.whatsapp.net': {},
        '628222@s.whatsapp.net': { lastKnownPresence: 'paused' },
      },
    })
    expect(out).toEqual([{ jid: 'g@g.us', participant: '628222@s.whatsapp.net', status: 'paused' }])
  })
})

describe('decodeNewsletter', () => {
  it('decodes a reaction', () => {
    const out = decodeNewsletter({
      source: 'reaction',
      payload: { id: 'nl@newsletter', server_id: '99', reaction: { code: '👍', count: 3 } },
    })
    expect(out).toMatchObject({ action: 'reaction', newsletterId: 'nl@newsletter', serverId: '99', emoji: '👍' })
  })

  it('decodes a view', () => {
    const out = decodeNewsletter({
      source: 'view',
      payload: { id: 'nl@newsletter', server_id: '99', count: 120 },
    })
    expect(out).toMatchObject({ action: 'view', newsletterId: 'nl@newsletter', serverId: '99', count: 120 })
  })

  it('decodes participants', () => {
    const out = decodeNewsletter({
      source: 'participants',
      payload: { id: 'nl@newsletter', author: 'a', user: 'u', new_role: 'admin', action: 'promote' },
    })
    expect(out).toMatchObject({ action: 'participants', newsletterId: 'nl@newsletter' })
  })

  it('decodes settings', () => {
    const out = decodeNewsletter({
      source: 'settings',
      payload: { id: 'nl@newsletter', update: { reaction_codes: 'ALL' } },
    })
    expect(out).toMatchObject({ action: 'settings', newsletterId: 'nl@newsletter' })
    expect(out?.action === 'settings' && out.update).toEqual({ reaction_codes: 'ALL' })
  })

  it('returns null when newsletter id is missing', () => {
    expect(decodeNewsletter({ source: 'view', payload: { id: '', server_id: '1', count: 0 } })).toBeNull()
    expect(decodeNewsletter({ source: 'reaction', payload: { id: '', server_id: '1', reaction: {} } })).toBeNull()
  })
})
