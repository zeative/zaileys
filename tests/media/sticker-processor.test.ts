import { describe, expect, it } from 'vitest'
import { StickerProcessor, type StickerMetadataType } from '../../src/media/ffmpeg/sticker.js'

describe('StickerProcessor Metadata', () => {
  it('has default metadata values', () => {
    const defaults = StickerProcessor.getDefaultMetadata()
    expect(defaults.packageName).toBe('Zaileys Library')
    expect(defaults.authorName).toBe('https://github.com/zeative/zaileys')
  })

  it('allows updating default metadata via setDefaultMetadata', () => {
    StickerProcessor.setDefaultMetadata({
      pack: 'Global Pack',
      author: 'Global Author',
    })
    const defaults = StickerProcessor.getDefaultMetadata()
    expect(defaults.pack).toBe('Global Pack')
    expect(defaults.author).toBe('Global Author')
  })
})
