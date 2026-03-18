import { describe, it, expect } from 'vitest'
import { cleanJid, resolveJids, getJidId } from '../../src/utils/jid'

describe('JID Utilities', () => {
  describe('cleanJid', () => {
    it('should suffix numerical ID with @s.whatsapp.net', () => {
      expect(cleanJid('62812345678')).toBe('62812345678@s.whatsapp.net')
    })

    it('should lowercase existing JIDs', () => {
      expect(cleanJid('62812345678@S.WhatsApp.Net')).toBe('62812345678@s.whatsapp.net')
    })
  })

  describe('resolveJids', () => {
    it('should handle array input', () => {
      const input = ['62812', '62834@g.us']
      expect(resolveJids(input)).toEqual([
        '62812@s.whatsapp.net',
        '62834@g.us'
      ])
    })

    it('should handle string input', () => {
      expect(resolveJids('123')).toEqual(['123@s.whatsapp.net'])
    })
  })

  describe('getJidId', () => {
    it('should extract numerical part', () => {
      expect(getJidId('62812345678@s.whatsapp.net')).toBe('62812345678')
    })
  })
})
