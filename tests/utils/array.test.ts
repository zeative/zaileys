import { describe, expect, it } from 'vitest'
import { chunk } from '../../src/utils/array.js'

describe('chunk', () => {
  it('A1: splits an array into evenly sized chunks', () => {
    expect(chunk([1, 2, 3, 4], 2)).toEqual([
      [1, 2],
      [3, 4],
    ])
  })

  it('A2: leaves a remainder chunk smaller than size', () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]])
  })

  it('A3: returns a single chunk when size exceeds length', () => {
    expect(chunk([1, 2, 3], 10)).toEqual([[1, 2, 3]])
  })

  it('A4: returns an empty array for empty input', () => {
    expect(chunk([], 3)).toEqual([])
  })

  it('A5: throws RangeError when size is zero', () => {
    expect(() => chunk([1, 2], 0)).toThrow(RangeError)
  })

  it('A6: throws RangeError when size is negative', () => {
    expect(() => chunk([1, 2], -1)).toThrow('chunk size must be positive')
  })

  it('A7: does not mutate the input array', () => {
    const input = [1, 2, 3]
    chunk(input, 1)
    expect(input).toEqual([1, 2, 3])
  })
})
