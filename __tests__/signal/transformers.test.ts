import { describe, it, expect, vi } from 'vitest'
import { textTransformer } from '../../src/signal/transformers/text'
import { locationTransformer } from '../../src/signal/transformers/location'

describe('Transformers', () => {
  it('should normalize text and extract mentions', async () => {
    const result = await textTransformer('Hello @628123 (Z\u200Ea\u200Elgo)')
    expect(result.text).toBe('Hello @628123 (Zalgo)')
    expect(result.mentions).toContain('628123@s.whatsapp.net')
  })

  it('should handle location shorthand', async () => {
    const result = await locationTransformer({ location: [-6.2, 106.8] })
    expect(result.location.degreesLatitude).toBe(-6.2)
    expect(result.location.degreesLongitude).toBe(106.8)
  })
})
