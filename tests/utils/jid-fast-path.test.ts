import { jidDecode, jidNormalizedUser } from 'baileys'
import { describe, expect, it } from 'vitest'
import { normalizedUserJid } from '../../src/events/decoders/_shared.js'
import { sameUser } from '../../src/utils/jid.js'

const SAMPLES = [
  '628111@s.whatsapp.net',
  '628111:12@s.whatsapp.net',
  '628111_1:3@s.whatsapp.net',
  '628111@c.us',
  '628111:4@c.us',
  '12345@lid',
  '12345:7@lid',
  '12345@hosted.lid',
  '1203630412@g.us',
  '120363@newsletter',
  'status@broadcast',
  '@s.whatsapp.net',
  '628111',
  '',
  'a@b@c.us',
  'a@b:1',
  '628222@s.whatsapp.net',
]

/** The decode-based comparison sameUser used before its fast path, kept as the oracle. */
const slowSameUser = (a: string, b: string): boolean => {
  const left = jidDecode(a)
  const right = jidDecode(b)
  if (left === undefined || right === undefined) return false
  if (!left.user || !right.user) return false
  return left.user === right.user && left.server === right.server
}

describe('jid fast paths match the decode/encode result exactly', () => {
  it('normalizedUserJid equals jidNormalizedUser for every sample', () => {
    for (const jid of SAMPLES) expect(normalizedUserJid(jid), jid).toBe(jidNormalizedUser(jid))
  })

  it('sameUser equals the decode-based comparison for every pair', () => {
    for (const a of SAMPLES) for (const b of SAMPLES) expect(sameUser(a, b), `${a} vs ${b}`).toBe(slowSameUser(a, b))
  })
})
