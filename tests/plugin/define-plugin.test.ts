import { describe, it, expect } from 'vitest'
import { definePlugin } from '../../src/plugin/index.js'

describe('definePlugin', () => {
  it('returns the same object (identity, type-only helper)', () => {
    const p = definePlugin({ name: 'x', setup() {} })
    expect(p.name).toBe('x')
    expect(typeof p.setup).toBe('function')
  })
})
