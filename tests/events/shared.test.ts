import type { WAContextInfo, WAMessageKey } from 'baileys'
import { describe, expect, it } from 'vitest'
import {
  extractJid,
  extractMentions,
  extractQuoted,
  extractSender,
  isGroupJid,
  mapAddressing,
  safeNumber,
  type LongLike,
} from '../../src/events/decoders/_shared.js'

describe('extractJid', () => {
  it('returns null for nullish or empty input', () => {
    expect(extractJid(undefined)).toBeNull()
    expect(extractJid(null)).toBeNull()
    expect(extractJid('')).toBeNull()
  })

  it('normalizes a user JID', () => {
    expect(extractJid('628123:5@s.whatsapp.net')).toBe('628123@s.whatsapp.net')
  })

  it('passes through a group JID', () => {
    expect(extractJid('12345-678@g.us')).toBe('12345-678@g.us')
  })
})

describe('extractSender', () => {
  it('returns null when key is undefined', () => {
    expect(extractSender(undefined)).toBeNull()
  })

  it('returns null when no jid resolvable', () => {
    expect(extractSender({ id: 'x' })).toBeNull()
  })

  it('prefers participant in group context', () => {
    const key: WAMessageKey = {
      remoteJid: '123-456@g.us',
      participant: '628999@s.whatsapp.net',
      fromMe: false,
    }
    const sender = extractSender(key)
    expect(sender?.jid).toBe('628999@s.whatsapp.net')
    expect(sender?.isMe).toBe(false)
  })

  it('falls back to remoteJid in dm context', () => {
    const sender = extractSender({ remoteJid: '628111@s.whatsapp.net', fromMe: true })
    expect(sender?.jid).toBe('628111@s.whatsapp.net')
    expect(sender?.isMe).toBe(true)
  })

  it('captures lid alias, username, and pushName', () => {
    const key: WAMessageKey = {
      remoteJid: '628111@s.whatsapp.net',
      remoteJidAlt: '111@lid',
      remoteJidUsername: 'alice',
    }
    const sender = extractSender(key, 'Alice')
    expect(sender?.lid).toBe('111@lid')
    expect(sender?.username).toBe('alice')
    expect(sender?.pushName).toBe('Alice')
  })

  it('omits pushName when blank', () => {
    const sender = extractSender({ remoteJid: '628111@s.whatsapp.net' }, '')
    expect(sender?.pushName).toBeUndefined()
  })
})

describe('extractQuoted', () => {
  it('returns null without contextInfo', () => {
    expect(extractQuoted(null)).toBeNull()
    expect(extractQuoted(undefined)).toBeNull()
  })

  it('returns null without stanzaId', () => {
    expect(extractQuoted({ mentionedJid: [] } as WAContextInfo)).toBeNull()
  })

  it('builds a quoted ref with key and sender', () => {
    const ctx = {
      stanzaId: 'ABC123',
      participant: '628999@s.whatsapp.net',
      remoteJid: '123-456@g.us',
    } as WAContextInfo
    const quoted = extractQuoted(ctx)
    expect(quoted?.key.id).toBe('ABC123')
    expect(quoted?.key.remoteJid).toBe('123-456@g.us')
    expect(quoted?.sender?.jid).toBe('628999@s.whatsapp.net')
  })
})

describe('extractMentions', () => {
  it('returns empty for nullish contextInfo', () => {
    expect(extractMentions(null)).toEqual({ mentionedJids: [], mentionAll: false })
  })

  it('extracts mentioned jids', () => {
    const ctx = { mentionedJid: ['a@s.whatsapp.net', 'b@s.whatsapp.net'] } as WAContextInfo
    const out = extractMentions(ctx)
    expect(out.mentionedJids).toEqual(['a@s.whatsapp.net', 'b@s.whatsapp.net'])
    expect(out.mentionAll).toBe(false)
  })

  it('flags mentionAll when groupMentions present', () => {
    const ctx = { groupMentions: [{ groupJid: 'g@g.us', groupSubject: 'All' }] } as unknown as WAContextInfo
    expect(extractMentions(ctx).mentionAll).toBe(true)
  })

  it('filters non-string mentioned entries', () => {
    const ctx = { mentionedJid: ['a@s.whatsapp.net', null] } as unknown as WAContextInfo
    expect(extractMentions(ctx).mentionedJids).toEqual(['a@s.whatsapp.net'])
  })
})

describe('mapAddressing', () => {
  it('returns empty object for bare key', () => {
    expect(mapAddressing({ id: 'x' })).toEqual({})
  })

  it('lifts all four addressing aliases', () => {
    const key: WAMessageKey = {
      remoteJidAlt: 'r@lid',
      remoteJidUsername: 'ru',
      participantAlt: 'p@lid',
      participantUsername: 'pu',
    }
    expect(mapAddressing(key)).toEqual({
      remoteJidAlt: 'r@lid',
      remoteJidUsername: 'ru',
      participantAlt: 'p@lid',
      participantUsername: 'pu',
    })
  })
})

describe('isGroupJid', () => {
  it('true for group jid', () => {
    expect(isGroupJid('123-456@g.us')).toBe(true)
  })

  it('false for user jid', () => {
    expect(isGroupJid('628111@s.whatsapp.net')).toBe(false)
  })
})

describe('safeNumber', () => {
  it('returns null for nullish', () => {
    expect(safeNumber(null)).toBeNull()
    expect(safeNumber(undefined)).toBeNull()
  })

  it('passes finite numbers through', () => {
    expect(safeNumber(42)).toBe(42)
  })

  it('rejects non-finite numbers', () => {
    expect(safeNumber(Number.NaN)).toBeNull()
    expect(safeNumber(Number.POSITIVE_INFINITY)).toBeNull()
  })

  it('converts a Long-like value', () => {
    const long: LongLike = { low: 1700000000, high: 0, toNumber: () => 1700000000 }
    expect(safeNumber(long)).toBe(1700000000)
  })

  it('rejects a Long-like producing non-finite', () => {
    const long: LongLike = { low: 0, high: 0, toNumber: () => Number.NaN }
    expect(safeNumber(long)).toBeNull()
  })
})
