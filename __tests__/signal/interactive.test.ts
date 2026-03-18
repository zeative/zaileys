import { describe, it, expect } from 'vitest'
import { buttons, list } from '../../src/signal/signals/interactive'

describe('Interactive Signals', () => {
  it('should format buttons signal', () => {
    const signal = buttons('hello', 'foot', [{ id: '1', text: 'B1' }])
    const payload = signal({})
    expect(payload.text).toBe('hello')
    expect(payload.buttons[0].buttonText.displayText).toBe('B1')
  })

  it('should format list signal', () => {
    const signal = list('list', 'f', 'title', 'click', [])
    const payload = signal({})
    expect(payload.buttonText).toBe('click')
    expect(payload.sections).toEqual([])
  })
})
