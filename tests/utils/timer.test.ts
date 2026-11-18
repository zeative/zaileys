import { describe, expect, it } from 'vitest'
import { clampTimerDelay, MAX_TIMER_DELAY_MS } from '../../src/utils/timer.js'

describe('clampTimerDelay', () => {
  it('keeps a delay inside the Node timer range unchanged', () => {
    expect(clampTimerDelay(1500)).toBe(1500)
  })

  it('caps a delay above 2^31-1 ms at the Node maximum', () => {
    expect(MAX_TIMER_DELAY_MS).toBe(2 ** 31 - 1)
    expect(clampTimerDelay(2 ** 31)).toBe(MAX_TIMER_DELAY_MS)
    expect(clampTimerDelay(Number.POSITIVE_INFINITY)).toBe(MAX_TIMER_DELAY_MS)
  })

  it('raises negative delays and NaN to zero', () => {
    expect(clampTimerDelay(-5)).toBe(0)
    expect(clampTimerDelay(Number.NaN)).toBe(0)
  })
})
