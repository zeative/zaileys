import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createGraphClient } from '../../src/cloud/graph-client.js'
import { ZaileysCloudError } from '../../src/cloud/errors.js'

const fetchMock = vi.fn()

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock)
  fetchMock.mockReset()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

const client = () =>
  createGraphClient(
    { accessToken: 'tok', phoneNumberId: '555', apiVersion: 'v23.0' },
    { delay: () => Promise.resolve() },
  )

const ok = (body: unknown) => new Response(JSON.stringify(body), { status: 200 })

describe('graph client', () => {
  it('post builds versioned URL with bearer auth and JSON body', async () => {
    fetchMock.mockResolvedValueOnce(ok({ messages: [{ id: 'wamid.1' }] }))
    const res = await client().post<{ messages: Array<{ id: string }> }>('555/messages', { type: 'text' })
    expect(res.messages[0]?.id).toBe('wamid.1')
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('https://graph.facebook.com/v23.0/555/messages')
    expect(init.method).toBe('POST')
    const headers = init.headers as Record<string, string>
    expect(headers.Authorization).toBe('Bearer tok')
    expect(headers['Content-Type']).toBe('application/json')
    expect(JSON.parse(init.body as string)).toEqual({ type: 'text' })
  })

  it('maps Graph error object to ZaileysCloudError with meta details', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({ error: { message: 'Unsupported post request', type: 'GraphMethodException', code: 100 } }),
        { status: 400 },
      ),
    )
    const err = await client()
      .post('555/messages', {})
      .catch((e: unknown) => e)
    expect(err).toBeInstanceOf(ZaileysCloudError)
    expect((err as ZaileysCloudError).code).toBe('REQUEST_FAILED')
    expect((err as ZaileysCloudError).message).toContain('Unsupported post request')
  })

  it('401 maps to AUTH', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ error: { message: 'Invalid OAuth access token', code: 190 } }), { status: 401 }),
    )
    const err = await client()
      .post('555/messages', {})
      .catch((e: unknown) => e)
    expect((err as ZaileysCloudError).code).toBe('AUTH')
  })

  it('retries 429 then succeeds', async () => {
    fetchMock
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: { message: 'rate', code: 4 } }), { status: 429 }))
      .mockResolvedValueOnce(ok({ done: true }))
    const res = await client().post<{ done: boolean }>('555/messages', {})
    expect(res.done).toBe(true)
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('persistent 429 surfaces RATE_LIMITED after bounded retries', async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ error: { message: 'rate limit hit', code: 4 } }), { status: 429 }),
    )
    const err = await client()
      .post('555/messages', {})
      .catch((e: unknown) => e)
    expect((err as ZaileysCloudError).code).toBe('RATE_LIMITED')
    expect(fetchMock.mock.calls.length).toBeLessThanOrEqual(4)
    expect(fetchMock.mock.calls.length).toBeGreaterThanOrEqual(2)
  })

  it('retries 500 then succeeds', async () => {
    fetchMock
      .mockResolvedValueOnce(new Response('oops', { status: 500 }))
      .mockResolvedValueOnce(ok({ done: true }))
    const res = await client().post<{ done: boolean }>('555/messages', {})
    expect(res.done).toBe(true)
  })

  it('does not retry 400', async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ error: { message: 'bad param', code: 100 } }), { status: 400 }),
    )
    await client()
      .post('555/messages', {})
      .catch(() => undefined)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('network failure maps to REQUEST_FAILED with cause', async () => {
    fetchMock.mockRejectedValue(new TypeError('fetch failed'))
    const err = await client()
      .post('555/messages', {})
      .catch((e: unknown) => e)
    expect((err as ZaileysCloudError).code).toBe('REQUEST_FAILED')
    expect((err as ZaileysCloudError).cause).toBeInstanceOf(TypeError)
  })

  it('get() issues GET with auth', async () => {
    fetchMock.mockResolvedValueOnce(ok({ id: '555' }))
    const res = await client().get<{ id: string }>('555')
    expect(res.id).toBe('555')
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(init.method).toBe('GET')
  })

  it('respects baseUrl override', async () => {
    fetchMock.mockResolvedValueOnce(ok({}))
    const c = createGraphClient(
      { accessToken: 'tok', phoneNumberId: '555', baseUrl: 'http://localhost:9999' },
      { delay: () => Promise.resolve() },
    )
    await c.get('555')
    expect((fetchMock.mock.calls[0] as [string])[0]).toMatch(/^http:\/\/localhost:9999\/v[0-9.]+\/555$/)
  })
})
