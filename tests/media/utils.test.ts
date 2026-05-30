import { describe, expect, it } from 'vitest'
import { generateId } from '../../src/media/utils.js'

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
})
