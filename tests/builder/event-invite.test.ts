import { describe, expect, it } from 'vitest'
import { buildEventContent } from '../../src/builder/content/event.js'
import { buildGroupInviteContent } from '../../src/builder/content/group-invite.js'
import { ZaileysBuilderError } from '../../src/builder/errors.js'

const rec = (c: unknown) => c as Record<string, unknown>

describe('buildEventContent', () => {
  it('maps name + startAt (epoch ms) to a Date startDate', () => {
    const ms = 1782132231000
    const content = rec(buildEventContent({ name: 'Meetup', startAt: ms }))
    const ev = content.event as Record<string, unknown>
    expect(ev.name).toBe('Meetup')
    expect(ev.startDate).toBeInstanceOf(Date)
    expect((ev.startDate as Date).getTime()).toBe(ms)
  })

  it('maps description, endAt, call, canceled, and location', () => {
    const content = rec(buildEventContent({
      name: 'Launch',
      description: 'desc',
      startAt: new Date(1782132231000),
      endAt: 1782135831000,
      call: 'video',
      canceled: true,
      location: { latitude: -6.2, longitude: 106.8, name: 'HQ' },
    }))
    const ev = content.event as Record<string, unknown>
    expect(ev.description).toBe('desc')
    expect((ev.endDate as Date).getTime()).toBe(1782135831000)
    expect(ev.call).toBe('video')
    expect(ev.isCancelled).toBe(true)
    expect(ev.location).toMatchObject({ degreesLatitude: -6.2, degreesLongitude: 106.8, name: 'HQ' })
  })

  it('rejects empty name and invalid dates', () => {
    expect(() => buildEventContent({ name: '', startAt: 0 })).toThrow(ZaileysBuilderError)
    expect(() => buildEventContent({ name: 'x', startAt: Number.NaN })).toThrow(ZaileysBuilderError)
  })
})

describe('buildGroupInviteContent', () => {
  it('maps simplified fields to baileys groupInvite shape', () => {
    const content = rec(buildGroupInviteContent({ jid: '123@g.us', code: 'ABC', subject: 'ScrapeOps', caption: 'join', expiresAt: 99 }))
    expect(content.groupInvite).toMatchObject({ jid: '123@g.us', inviteCode: 'ABC', subject: 'ScrapeOps', text: 'join', inviteExpiration: 99 })
  })

  it('defaults expiration/subject/caption when omitted', () => {
    const content = rec(buildGroupInviteContent({ jid: '123@g.us', code: 'ABC' }))
    expect(content.groupInvite).toMatchObject({ inviteExpiration: 0, subject: '', text: '' })
  })

  it('rejects a non-group jid or missing code', () => {
    expect(() => buildGroupInviteContent({ jid: '123@s.whatsapp.net', code: 'ABC' })).toThrow(ZaileysBuilderError)
    expect(() => buildGroupInviteContent({ jid: '123@g.us', code: '' })).toThrow(ZaileysBuilderError)
  })
})
