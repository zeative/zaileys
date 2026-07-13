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

describe('cloud sendTemplate', () => {
  it('sends an approved template with language and components', async () => {
    const c = await connectedClient()
    fetchMock.mockResolvedValueOnce(ok({ messages: [{ id: 'wamid.TPL' }] }))
    const key = await c.sendTemplate('628111', 'order_confirm', 'id', [
      { type: 'body', parameters: [{ type: 'text', text: 'Budi' }] },
    ])
    expect(key.id).toBe('wamid.TPL')
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('https://graph.facebook.com/v23.0/555/messages')
    expect(JSON.parse(init.body as string)).toEqual({
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: '628111',
      type: 'template',
      template: {
        name: 'order_confirm',
        language: { code: 'id' },
        components: [{ type: 'body', parameters: [{ type: 'text', text: 'Budi' }] }],
      },
    })
  })

  it('components are optional', async () => {
    const c = await connectedClient()
    fetchMock.mockResolvedValueOnce(ok({ messages: [{ id: 'wamid.TPL2' }] }))
    await c.sendTemplate('628111', 'hello_world', 'en_US')
    const body = JSON.parse((fetchMock.mock.calls[0] as [string, RequestInit])[1].body as string) as {
      template: { name: string; components?: unknown }
    }
    expect(body.template.name).toBe('hello_world')
    expect(body.template.components).toBeUndefined()
  })

  it('throws on the baileys provider', async () => {
    const { MemoryAuthStore } = await import('../../src/auth/adapters/memory.js')
    const c = new Client({ auth: new MemoryAuthStore(), autoConnect: false, qrTerminal: false, statusLog: false })
    await expect(c.sendTemplate('628111', 'hello_world', 'en_US')).rejects.toThrowError(/cloud/)
  })
})
