import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Client } from '../../src/client/client.js'

const fetchMock = vi.fn()

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock)
  fetchMock.mockReset()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

const ok = (body: unknown) => new Response(JSON.stringify(body), { status: 200 })

const wa = () =>
  new Client({
    provider: 'cloud',
    cloud: { accessToken: 'tok', phoneNumberId: '555', wabaId: 'WABA1', apiVersion: 'v23.0' },
    autoConnect: false,
    statusLog: false,
  }).cloud

const call = (i = 0): [string, RequestInit] => fetchMock.mock.calls[i] as [string, RequestInit]
const body = (i = 0): Record<string, unknown> => JSON.parse(call(i)[1].body as string) as Record<string, unknown>

describe('wa.cloud.profile', () => {
  it('get() reads whatsapp_business_profile fields', async () => {
    fetchMock.mockResolvedValueOnce(ok({ data: [{ about: 'halo', vertical: 'EDU' }] }))
    const p = await wa().profile.get()
    expect(p.about).toBe('halo')
    expect(call()[0]).toBe(
      'https://graph.facebook.com/v23.0/555/whatsapp_business_profile?fields=about,address,description,email,websites,vertical',
    )
  })

  it('update() posts fields with messaging_product', async () => {
    fetchMock.mockResolvedValueOnce(ok({ success: true }))
    await wa().profile.update({ about: 'toko buka 9-5', vertical: 'RETAIL' })
    expect(body()).toEqual({ messaging_product: 'whatsapp', about: 'toko buka 9-5', vertical: 'RETAIL' })
  })
})

describe('wa.cloud.blocklist', () => {
  it('add() posts block_users', async () => {
    fetchMock.mockResolvedValueOnce(ok({}))
    await wa().blocklist.add(['628111', '628222'])
    expect(call()[0]).toBe('https://graph.facebook.com/v23.0/555/block_users')
    expect(body()).toEqual({
      messaging_product: 'whatsapp',
      block_users: [{ user: '628111' }, { user: '628222' }],
    })
  })

  it('remove() issues DELETE with block_users', async () => {
    fetchMock.mockResolvedValueOnce(ok({}))
    await wa().blocklist.remove(['628111'])
    expect(call()[1].method).toBe('DELETE')
    expect(body()).toMatchObject({ block_users: [{ user: '628111' }] })
  })

  it('list() unwraps blocked users', async () => {
    fetchMock.mockResolvedValueOnce(ok({ data: [{ block_users: [{ wa_id: '628111' }] }] }))
    const res = await wa().blocklist.list()
    expect(res).toEqual([{ wa_id: '628111' }])
  })
})

describe('wa.cloud.qr', () => {
  it('create() posts prefilled message and image format', async () => {
    fetchMock.mockResolvedValueOnce(ok({ code: 'ABC', prefilled_message: 'halo' }))
    const res = await wa().qr.create('halo')
    expect(res.code).toBe('ABC')
    expect(body()).toEqual({ prefilled_message: 'halo', generate_qr_image: 'PNG' })
  })

  it('delete() targets the code path', async () => {
    fetchMock.mockResolvedValueOnce(ok({ success: true }))
    await wa().qr.delete('ABC')
    expect(call()[0]).toBe('https://graph.facebook.com/v23.0/555/message_qrdls/ABC')
    expect(call()[1].method).toBe('DELETE')
  })
})

describe('wa.cloud.analytics', () => {
  it('conversations() queries waba with the analytics field syntax', async () => {
    fetchMock.mockResolvedValueOnce(ok({ conversation_analytics: { data: [] } }))
    await wa().analytics.conversations({ start: 1000, end: 2000 })
    const url = call()[0]
    expect(url).toContain('/WABA1?fields=')
    expect(decodeURIComponent(url)).toContain('conversation_analytics.start(1000).end(2000).granularity(DAILY)')
  })

  it('messages() uses the analytics field', async () => {
    fetchMock.mockResolvedValueOnce(ok({ analytics: { data: [] } }))
    await wa().analytics.messages({ start: 1, end: 2, granularity: 'MONTH' })
    expect(decodeURIComponent(call()[0])).toContain('analytics.start(1).end(2).granularity(MONTH)')
  })
})

describe('wa.cloud.phone', () => {
  it('register() posts the pin', async () => {
    fetchMock.mockResolvedValueOnce(ok({ success: true }))
    await wa().phone.register('123456')
    expect(call()[0]).toBe('https://graph.facebook.com/v23.0/555/register')
    expect(body()).toEqual({ messaging_product: 'whatsapp', pin: '123456' })
  })

  it('requestCode() posts method and language', async () => {
    fetchMock.mockResolvedValueOnce(ok({ success: true }))
    await wa().phone.requestCode('SMS', 'id')
    expect(body()).toEqual({ code_method: 'SMS', language: 'id' })
  })

  it('verifyCode() posts the code', async () => {
    fetchMock.mockResolvedValueOnce(ok({ success: true }))
    await wa().phone.verifyCode('000111')
    expect(body()).toEqual({ code: '000111' })
  })
})
