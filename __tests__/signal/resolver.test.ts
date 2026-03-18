import { describe, it, expect } from 'vitest'
import { Resolver } from '../../src/signal/resolver'

describe('Payload Resolver', () => {
  it('should detect text payloads', () => {
    expect(Resolver.detect('hello')).toBe('text')
    expect(Resolver.detect({ text: 'hi' })).toBe('text')
  })

  it('should detect media payloads', () => {
    expect(Resolver.detect({ image: 'link' })).toBe('image')
    expect(Resolver.detect({ video: Buffer.from([]) })).toBe('video')
    expect(Resolver.detect({ audio: { url: '...' } })).toBe('audio')
  })

  it('should detect utility payloads', () => {
    expect(Resolver.detect({ location: [0, 0] })).toBe('location')
    expect(Resolver.detect({ poll: { name: 'q' } })).toBe('poll')
    expect(Resolver.detect({ react: { text: '👍' } })).toBe('reaction')
  })

  it('should detect interactive payloads', () => {
    expect(Resolver.detect({ buttons: [] })).toBe('interactive')
    expect(Resolver.detect({ sections: [] })).toBe('interactive')
  })
})
