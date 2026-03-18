import { describe, it, expect, vi } from 'vitest'
import { extractContent } from '../../src/context/content-resolver'

describe('Content Resolver', () => {
  it('should extract simple text messages', () => {
    const raw = {
      message: { conversation: 'hello world' }
    }
    const content = extractContent(raw)
    expect(content.type).toBe('text')
    expect(content.text).toBe('hello world')
  })

  it('should extract extended text messages', () => {
    const raw = {
      message: { extendedTextMessage: { text: 'hello context' } }
    }
    const content = extractContent(raw)
    expect(content.type).toBe('text')
    expect(content.text).toBe('hello context')
  })

  it('should unwrap ephemeral messages', () => {
    const raw = {
      message: {
        ephemeralMessage: {
          message: { imageMessage: { caption: 'hidden image' } }
        }
      }
    }
    const content = extractContent(raw)
    expect(content.type).toBe('image')
    expect(content.caption).toBe('hidden image')
  })

  it('should unwrap view-once messages', () => {
    const raw = {
      message: {
        viewOnceMessageV2: {
          message: { videoMessage: { caption: 'secret video' } }
        }
      }
    }
    const content = extractContent(raw)
    expect(content.type).toBe('video')
    expect(content.caption).toBe('secret video')
  })
})
