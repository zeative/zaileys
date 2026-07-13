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

async function connectedClient() {
  fetchMock.mockResolvedValueOnce(ok({ id: '555' }))
  const c = new Client({
    provider: 'cloud',
    cloud: { accessToken: 'tok', phoneNumberId: '555', apiVersion: 'v23.0' },
    autoConnect: false,
    statusLog: false,
  })
  await c.connect()
  fetchMock.mockReset()
  return c
}

describe('integration: cloud send text', () => {
  it('send(to).text() posts the exact graph payload and returns wamid key', async () => {
    const c = await connectedClient()
    fetchMock.mockResolvedValueOnce(
      ok({ messaging_product: 'whatsapp', contacts: [{ wa_id: '628111' }], messages: [{ id: 'wamid.ABC' }] }),
    )
    const key = await c.send('628111').text('halo dunia')
    expect(key.id).toBe('wamid.ABC')
    expect(key.fromMe).toBe(true)
    expect(key.remoteJid).toBe('628111@s.whatsapp.net')
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('https://graph.facebook.com/v23.0/555/messages')
    expect(JSON.parse(init.body as string)).toEqual({
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: '628111',
      type: 'text',
      text: { body: 'halo dunia' },
    })
  })

  it('jid recipient is normalized to bare number for graph `to`', async () => {
    const c = await connectedClient()
    fetchMock.mockResolvedValueOnce(ok({ messages: [{ id: 'wamid.X' }] }))
    await c.send('628222@s.whatsapp.net').text('hi')
    const body = JSON.parse((fetchMock.mock.calls[0] as [string, RequestInit])[1].body as string) as { to: string }
    expect(body.to).toBe('628222')
  })

  it('reply() carries context.message_id', async () => {
    const c = await connectedClient()
    fetchMock.mockResolvedValueOnce(ok({ messages: [{ id: 'wamid.Y' }] }))
    const quoted = {
      key: { id: 'wamid.QUOTED', remoteJid: '628111@s.whatsapp.net', fromMe: false },
      message: { conversation: 'original' },
    }
    await c.send('628111').text('balasan').reply(quoted as never)
    const body = JSON.parse((fetchMock.mock.calls[0] as [string, RequestInit])[1].body as string) as {
      context?: { message_id: string }
    }
    expect(body.context?.message_id).toBe('wamid.QUOTED')
  })

  it('sent message is recorded to the store', async () => {
    const c = await connectedClient()
    fetchMock.mockResolvedValueOnce(ok({ messages: [{ id: 'wamid.Z' }] }))
    const key = await c.send('628111').text('kept')
    await new Promise((r) => setTimeout(r, 5))
    const stored = await c.store.getMessage(key)
    expect(stored?.key.id).toBe('wamid.Z')
  })
})
