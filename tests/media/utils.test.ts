import { describe, expect, it } from 'vitest'
import { generateId, ignoreLint } from '../../src/media/utils.js'

describe('media/utils', () => {
  it('U1: generateId returns a non-empty base36 string', () => {
    const id = generateId()
    expect(typeof id).toBe('string')
    expect(id.length).toBeGreaterThan(0)
  })

  it('U2: generateId produces distinct values across calls', () => {
    const ids = new Set(Array.from({ length: 50 }, () => generateId()))
    expect(ids.size).toBeGreaterThan(1)
  })

  it('U3: ignoreLint returns its argument unchanged', () => {
    const obj = { a: 1 }
    expect(ignoreLint(obj)).toBe(obj)
    expect(ignoreLint(null)).toBeNull()
  })
})
