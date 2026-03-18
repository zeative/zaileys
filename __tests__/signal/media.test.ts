import { describe, it, expect } from 'vitest'
import { image, video, audio, document } from '../../src/signal/signals/media'

describe('Media Signals', () => {
  it('should format image signal', () => {
    const signal = image('https://example.com/i.jpg', { caption: 'hi' })
    const payload = signal({})
    expect(payload).toEqual({ image: { url: 'https://example.com/i.jpg' }, caption: 'hi' })
  })

  it('should format video signal', () => {
    const signal = video(Buffer.from('v'), { caption: 'vid' })
    const payload = signal({})
    expect(payload).toEqual({ video: Buffer.from('v'), caption: 'vid' })
  })

  it('should format audio signal', () => {
    const signal = audio('a.mp3', { ptt: true })
    const payload = signal({})
    expect(payload).toEqual({ audio: { url: 'a.mp3' }, ptt: true })
  })

  it('should format document signal', () => {
    const signal = document('d.pdf', { fileName: 'd.pdf', mimetype: 'application/pdf' })
    const payload = signal({})
    expect(payload).toEqual({ document: { url: 'd.pdf' }, fileName: 'd.pdf', mimetype: 'application/pdf' })
  })
})
