import { describe, expect, it } from 'vitest'
import { sameUser } from '../../src/utils/jid.js'

describe('sameUser', () => {
  it('matches the same principal across device suffixes', () => {
    expect(sameUser('628111@s.whatsapp.net', '628111:12@s.whatsapp.net')).toBe(true)
  })

  it('matches identical jids', () => {
    expect(sameUser('628111@s.whatsapp.net', '628111@s.whatsapp.net')).toBe(true)
    expect(sameUser('19988@lid', '19988@lid')).toBe(true)
  })

  it('never matches a LID against a phone number with the same digits', () => {
    expect(sameUser('628111@lid', '628111@s.whatsapp.net')).toBe(false)
    expect(sameUser('628111@s.whatsapp.net', '628111@lid')).toBe(false)
  })

  it('rejects different principals', () => {
    expect(sameUser('628111@s.whatsapp.net', '628222@s.whatsapp.net')).toBe(false)
  })

  it('rejects malformed input rather than matching loosely', () => {
    expect(sameUser('628111', '628111@s.whatsapp.net')).toBe(false)
    expect(sameUser('', '')).toBe(false)
    expect(sameUser('@s.whatsapp.net', '@s.whatsapp.net')).toBe(false)
  })
})
