import { beforeEach, describe, expect, it } from 'vitest'
import { rememberCallerInfo, resetCallerInfo, takeCallerInfo } from '../../src/events/call-metadata.js'

/** Shaped from a real `<call>` offer captured on the wire (iPhone caller, ID). */
const offerNode = (overrides: { video?: boolean; attrs?: Record<string, string> } = {}) => ({
  tag: 'call',
  attrs: {
    from: '123918899749051@lid',
    version: '2.26.30.78',
    platform: 'iphone',
    id: '1786619694-11',
    notify: 'Kejaa',
    t: '1786619698',
    ...overrides.attrs,
  },
  content: [
    {
      tag: 'offer',
      attrs: {
        'call-id': 'CALL1',
        'call-creator': '123918899749051@lid',
        caller_pn: '6285136635787@s.whatsapp.net',
        joinable: '1',
        caller_country_code: 'ID',
      },
      content: [
        { tag: 'audio', attrs: { enc: 'opus', rate: '16000' }, content: null },
        { tag: 'net', attrs: { medium: '3' }, content: null },
        ...(overrides.video === true
          ? [
              {
                tag: 'video',
                attrs: {
                  enc: 'h.264',
                  dec: 'H264,H265,AV1',
                  device_orientation: '0',
                  screen_height: '2556',
                  screen_width: '1179',
                },
                content: null,
              },
            ]
          : []),
      ],
    },
  ],
})

describe('rememberCallerInfo', () => {
  beforeEach(() => resetCallerInfo())

  it('reads the caller details WhatsApp puts on a voice offer', () => {
    expect(rememberCallerInfo(offerNode())).toBe(true)
    expect(takeCallerInfo('CALL1')).toEqual({
      platform: 'iphone',
      appVersion: '2.26.30.78',
      name: 'Kejaa',
      countryCode: 'ID',
      phoneJid: '6285136635787@s.whatsapp.net',
      networkMedium: 3,
    })
  })

  it('adds the screen size a video offer advertises', () => {
    rememberCallerInfo(offerNode({ video: true }))
    expect(takeCallerInfo('CALL1')?.screen).toEqual({ width: 1179, height: 2556 })
  })

  it('omits screen entirely for a voice call', () => {
    rememberCallerInfo(offerNode())
    expect(takeCallerInfo('CALL1')).not.toHaveProperty('screen')
  })

  it('consumes the entry so a call id is only read once', () => {
    rememberCallerInfo(offerNode())
    expect(takeCallerInfo('CALL1')).toBeDefined()
    expect(takeCallerInfo('CALL1')).toBeUndefined()
  })

  it('ignores stanzas that are not call offers', () => {
    expect(rememberCallerInfo({ tag: 'message', attrs: {}, content: [] })).toBe(false)
    expect(rememberCallerInfo({ tag: 'call', attrs: {}, content: [] })).toBe(false)
    expect(rememberCallerInfo(null)).toBe(false)
    expect(rememberCallerInfo('nope')).toBe(false)
  })

  it('survives a stanza carrying none of the optional attributes', () => {
    const bare = {
      tag: 'call',
      attrs: { from: 'x@lid' },
      content: [{ tag: 'offer', attrs: { 'call-id': 'CALL2' }, content: [] }],
    }
    expect(rememberCallerInfo(bare)).toBe(true)
    expect(takeCallerInfo('CALL2')).toBeUndefined()
  })

  it('keeps the cache bounded so a call flood cannot grow it forever', () => {
    for (let i = 0; i < 200; i++) {
      rememberCallerInfo({
        tag: 'call',
        attrs: { platform: 'android' },
        content: [{ tag: 'offer', attrs: { 'call-id': `C${i}` }, content: [] }],
      })
    }
    expect(takeCallerInfo('C0')).toBeUndefined()
    expect(takeCallerInfo('C199')).toBeDefined()
  })
})
