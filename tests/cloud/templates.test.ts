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

function cloudClient() {
  return new Client({
    provider: 'cloud',
    cloud: { accessToken: 'tok', phoneNumberId: '555', wabaId: 'WABA1', apiVersion: 'v23.0' },
    autoConnect: false,
    statusLog: false,
  })
}

describe('wa.cloud.templates', () => {
  it('list() hits waba message_templates and returns data', async () => {
    fetchMock.mockResolvedValueOnce(
      ok({ data: [{ id: '1', name: 'order_confirm', status: 'APPROVED', language: 'id' }] }),
    )
    const res = await cloudClient().cloud.templates.list()
    expect(res[0]?.name).toBe('order_confirm')
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('https://graph.facebook.com/v23.0/WABA1/message_templates')
    expect(init.method).toBe('GET')
  })

  it('list({status}) forwards the filter', async () => {
    fetchMock.mockResolvedValueOnce(ok({ data: [] }))
    await cloudClient().cloud.templates.list({ status: 'REJECTED' })
    expect((fetchMock.mock.calls[0] as [string])[0]).toContain('status=REJECTED')
  })

  it('create() posts the template definition', async () => {
    fetchMock.mockResolvedValueOnce(ok({ id: 'tpl-9', status: 'PENDING' }))
    const res = await cloudClient().cloud.templates.create({
      name: 'promo_juli',
      category: 'MARKETING',
      language: 'id',
      components: [{ type: 'BODY', text: 'Halo {{1}}' }],
    })
    expect(res.id).toBe('tpl-9')
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('https://graph.facebook.com/v23.0/WABA1/message_templates')
    expect(JSON.parse(init.body as string)).toMatchObject({ name: 'promo_juli', category: 'MARKETING' })
  })

  it('delete() issues DELETE with name query', async () => {
    fetchMock.mockResolvedValueOnce(ok({ success: true }))
    await cloudClient().cloud.templates.delete('promo_juli')
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('https://graph.facebook.com/v23.0/WABA1/message_templates?name=promo_juli')
    expect(init.method).toBe('DELETE')
  })

  it('template status webhook fires template-status event', async () => {
    fetchMock.mockResolvedValueOnce(ok({ id: '555' }))
    const c = cloudClient()
    await c.connect()
    const events: Array<Record<string, unknown>> = []
    c.on('template-status', (e) => events.push(e as unknown as Record<string, unknown>))
    const payload = JSON.stringify({
      object: 'whatsapp_business_account',
      entry: [
        {
          id: 'WABA1',
          changes: [
            {
              field: 'message_template_status_update',
              value: {
                event: 'APPROVED',
                message_template_id: 1234,
                message_template_name: 'promo_juli',
                message_template_language: 'id',
              },
            },
          ],
        },
      ],
    })
    await c.webhook()(new Request('https://x.test/wh', { method: 'POST', body: payload }))
    await new Promise((r) => setTimeout(r, 10))
    expect(events).toHaveLength(1)
    expect(events[0]).toMatchObject({ event: 'APPROVED', name: 'promo_juli', language: 'id' })
  })
})

describe('wa.cloud.templates.get', () => {
  it('get(name) resolves via waba filter', async () => {
    fetchMock.mockResolvedValueOnce(
      ok({ data: [{ id: '9', name: 'promo', status: 'APPROVED', language: 'id', components: [{ type: 'BODY' }] }] }),
    )
    const t = await cloudClient().cloud.templates.get('promo')
    expect(t?.name).toBe('promo')
    expect(t?.components).toHaveLength(1)
    expect((fetchMock.mock.calls[0] as [string])[0]).toContain('/WABA1/message_templates?name=promo')
  })

  it('get(numericId) fetches the node directly', async () => {
    fetchMock.mockResolvedValueOnce(
      ok({ id: '1783414372642659', name: '17_juni', status: 'APPROVED', language: 'id', components: [] }),
    )
    const t = await cloudClient().cloud.templates.get('1783414372642659')
    expect(t?.name).toBe('17_juni')
    expect((fetchMock.mock.calls[0] as [string])[0]).toContain('/1783414372642659?fields=')
  })

  it('get(missing) returns null', async () => {
    fetchMock.mockResolvedValueOnce(ok({ data: [] }))
    const t = await cloudClient().cloud.templates.get('nope')
    expect(t).toBeNull()
  })
})
