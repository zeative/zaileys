import { describe, expect, it } from 'vitest'
import { mediaDownloadOptions } from '../../src/utils/media-host.js'

const PATH = '/v/t62.15575-24/123_456_n.enc?ccb=11-4&oh=abc&oe=def'

describe('mediaDownloadOptions', () => {
  it('routes a url on the a.whatsapp.net placeholder to the default media host', () => {
    const content = { stickerMessage: { url: `https://a.whatsapp.net${PATH}&mms3=true`, directPath: PATH } }
    expect(mediaDownloadOptions(content)).toEqual({ host: 'mmg.whatsapp.net' })
  })

  it('leaves a real media host to baileys', () => {
    const content = { imageMessage: { url: `https://mmg.whatsapp.net${PATH}`, directPath: PATH } }
    expect(mediaDownloadOptions(content)).toEqual({})
  })

  it('returns no options for empty, malformed, or url-less content', () => {
    expect(mediaDownloadOptions(null)).toEqual({})
    expect(mediaDownloadOptions(undefined)).toEqual({})
    expect(mediaDownloadOptions({ audioMessage: { url: 'not a url' } })).toEqual({})
    expect(mediaDownloadOptions({ audioMessage: {}, messageContextInfo: null })).toEqual({})
  })
})
