import { describe, it, expect } from 'vitest'
import { normalizeText } from '../../src/utils/text'

describe('Text Utilities', () => {
  describe('normalizeText', () => {
    it('should clean simple text', () => {
      expect(normalizeText('  Hello World  ')).toBe('Hello World')
    })

    it('should handle RTL overrides', () => {
      // \u202E is RTL override
      expect(normalizeText('\u202Eolleh\u202C')).toBe('hello')
    })

    it('should remove invisible marks', () => {
      // \u200B is zero-width space
      expect(normalizeText('Hello\u200BWorld')).toBe('HelloWorld')
    })

    it('should collapse multiple spaces', () => {
      expect(normalizeText('Hello    \n  World')).toBe('Hello World')
    })

    it('should return null for empty/whitespace input', () => {
      expect(normalizeText('   ')).toBeNull()
      expect(normalizeText('')).toBeNull()
      expect(normalizeText(null)).toBeNull()
    })

    it('should clean Zalgo-style combined marks', () => {
      expect(normalizeText('z҉a҉i҉l҉e҉y҉s҉')).toBe('zaileys')
    })
  })
})
