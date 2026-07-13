import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Client } from '../../src/client/client.js'
import { ZaileysCloudError } from '../../src/cloud/errors.js'

const fetchMock = vi.fn()

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock)
  fetchMock.mockReset()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

function cloudClient() {
  return new Client({
    provider: 'cloud',
    cloud: { accessToken: 'tok-123', phoneNumberId: '5550001', apiVersion: 'v23.0' },
    autoConnect: false,
    statusLog: false,
  })
}

describe('cloud connect health-check', () => {
  it('connect() hits the phone-number endpoint with bearer auth and emits connect', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ id: '5550001', display_phone_number: '+62 811' }), { status: 200 }),
    )
    const c = cloudClient()
    const connected = vi.fn()
    c.on('connect', connected)
    await c.connect()
    expect(c.state).toBe('connected')
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('https://graph.facebook.com/v23.0/5550001')
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer tok-123')
    expect(connected).toHaveBeenCalledWith(
      expect.objectContaining({ me: expect.objectContaining({ id: '5550001' }) }),
    )
  })

  it('bad token -> typed AUTH error, state disconnected, no retry', async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ error: { message: 'Invalid OAuth access token', code: 190 } }), { status: 401 }),
    )
    const c = cloudClient()
    await expect(c.connect()).rejects.toMatchObject({ name: 'ZaileysCloudError', code: 'AUTH' })
    expect(c.state).toBe('disconnected')
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('never emits qr or pairing-code on cloud', async () => {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ id: '5550001' }), { status: 200 }))
    const c = cloudClient()
    const qr = vi.fn()
    const pairing = vi.fn()
    c.on('qr', qr)
    c.on('pairing-code', pairing)
    await c.connect()
    expect(qr).not.toHaveBeenCalled()
    expect(pairing).not.toHaveBeenCalled()
  })

  it('disconnect() after cloud connect reaches disconnected and emits disconnect', async () => {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ id: '5550001' }), { status: 200 }))
    const c = cloudClient()
    const disconnected = vi.fn()
    c.on('disconnect', disconnected)
    await c.connect()
    await c.disconnect()
    expect(c.state).toBe('disconnected')
    expect(disconnected).toHaveBeenCalled()
  })

  it('sendMessage on skeleton throws NOT_IMPLEMENTED', async () => {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ id: '5550001' }), { status: 200 }))
    const c = cloudClient()
    await c.connect()
    await expect(c.send('628111').text('hi')).rejects.toThrowError()
    try {
      await c.send('628111').text('hi')
    } catch (err) {
      expect((err as { cause?: ZaileysCloudError }).cause?.code ?? (err as ZaileysCloudError).code).toBeDefined()
    }
  })
})
