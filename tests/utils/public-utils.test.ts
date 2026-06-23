import { describe, expect, it } from 'vitest'
import {
  computeUniqueId,
  computeStaticId,
  extractLinks,
  senderDeviceOf,
  epochSecondsToMs,
  normalizeJid,
  isLidJid,
  isPnJid,
  jidToPhone,
  phoneToJid,
  loadMedia,
  detectMimeFromBuffer,
  chunk,
  jidDecode,
  jidEncode,
  jidNormalizedUser,
  areJidsSameUser,
  isJidGroup,
  isJidNewsletter,
  isLidUser,
  isPnUser,
} from '../../src/index.js'

describe('public utility exports', () => {
  it('id hashers are exposed and deterministic (16-char uppercase hex)', () => {
    const u = computeUniqueId({ remoteJid: 'r', id: 'i', fromMe: false })
    const s = computeStaticId('room@g.us', '628@s.whatsapp.net')
    expect(u).toMatch(/^[0-9A-F]{16}$/)
    expect(s).toMatch(/^[0-9A-F]{16}$/)
    expect(computeStaticId('room@g.us', '628@s.whatsapp.net')).toBe(s)
  })

  it('jid helpers', () => {
    expect(isLidJid('1@lid')).toBe(true)
    expect(isPnJid('628@s.whatsapp.net')).toBe(true)
    expect(normalizeJid('628:5@s.whatsapp.net')).toBe('628@s.whatsapp.net')
    expect(jidToPhone('628111@s.whatsapp.net')).toBe('628111')
    expect(jidToPhone('123@g.us')).toBe('')
    expect(phoneToJid('+62 811-1')).toBe('628111@s.whatsapp.net')
  })

  it('text + device + time helpers', () => {
    expect(extractLinks('see https://x.io done')).toEqual(['https://x.io'])
    expect(typeof senderDeviceOf('628@s.whatsapp.net')).toBe('string')
    expect(epochSecondsToMs(1782132231)).toBe(1782132231000)
  })

  it('re-exports baileys jid utilities', () => {
    expect(jidNormalizedUser('628:3@s.whatsapp.net')).toBe('628@s.whatsapp.net')
    expect(jidDecode('628@s.whatsapp.net')?.user).toBe('628')
    expect(jidEncode('628', 's.whatsapp.net')).toBe('628@s.whatsapp.net')
    expect(areJidsSameUser('628:3@s.whatsapp.net', '628@s.whatsapp.net')).toBe(true)
    expect(isJidGroup('1@g.us')).toBe(true)
    expect(isJidNewsletter('1@newsletter')).toBe(true)
    expect(isLidUser('1@lid')).toBe(true)
    expect(isPnUser('628@s.whatsapp.net')).toBe(true)
  })

  it('media helpers + chunk are callable', () => {
    expect(typeof loadMedia).toBe('function')
    expect(typeof detectMimeFromBuffer).toBe('function')
    expect(chunk([1, 2, 3], 2)).toEqual([[1, 2], [3]])
  })
})
