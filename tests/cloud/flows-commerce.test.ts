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

async function connected() {
  fetchMock.mockResolvedValueOnce(ok({ id: '555' }))
  const c = new Client({
    provider: 'cloud',
    cloud: { accessToken: 'tok', phoneNumberId: '555', wabaId: 'WABA1', apiVersion: 'v23.0' },
    autoConnect: false,
    statusLog: false,
  })
  await c.connect()
  fetchMock.mockReset()
  return c
}

const lastBody = (): Record<string, unknown> =>
  JSON.parse((fetchMock.mock.calls.at(-1) as [string, RequestInit])[1].body as string) as Record<string, unknown>

const inbound = (messages: unknown[]) =>
  new Request('https://x.test/wh', {
    method: 'POST',
    body: JSON.stringify({
      object: 'whatsapp_business_account',
      entry: [
        {
          id: 'WABA1',
          changes: [
            {
              field: 'messages',
              value: {
                messaging_product: 'whatsapp',
                metadata: { phone_number_id: '555' },
                contacts: [{ profile: { name: 'Budi' }, wa_id: '628111000222' }],
                messages,
              },
            },
          ],
        },
      ],
    }),
  })

describe('wa.cloud.flows', () => {
  it('send() posts an interactive flow payload', async () => {
    const c = await connected()
    fetchMock.mockResolvedValueOnce(ok({ messages: [{ id: 'wamid.FLOW' }] }))
    const key = await c.cloud.flows.send('628111', {
      flowId: 'FLOW123',
      cta: 'Isi form',
      bodyText: 'Booking konsultasi',
      screen: 'BOOKING',
      flowToken: 'tok-1',
      data: { slot: 'pagi' },
    })
    expect(key.id).toBe('wamid.FLOW')
    const b = lastBody() as {
      type: string
      interactive: { type: string; body: { text: string }; action: { name: string; parameters: Record<string, unknown> } }
    }
    expect(b.type).toBe('interactive')
    expect(b.interactive.type).toBe('flow')
    expect(b.interactive.body.text).toBe('Booking konsultasi')
    expect(b.interactive.action.name).toBe('flow')
    expect(b.interactive.action.parameters).toMatchObject({
      flow_message_version: '3',
      flow_id: 'FLOW123',
      flow_cta: 'Isi form',
      flow_token: 'tok-1',
      flow_action: 'navigate',
      flow_action_payload: { screen: 'BOOKING', data: { slot: 'pagi' } },
    })
  })

  it('inbound nfm_reply fires flow-response with parsed response_json', async () => {
    const c = await connected()
    const events: Array<Record<string, unknown>> = []
    c.on('flow-response', (e) => events.push(e as unknown as Record<string, unknown>))
    await c.webhook()(
      inbound([
        {
          from: '628111000222',
          id: 'wamid.NFM1',
          timestamp: '1752350000',
          type: 'interactive',
          interactive: {
            type: 'nfm_reply',
            nfm_reply: { name: 'flow', body: 'Sent', response_json: '{"slot":"pagi","flow_token":"tok-1"}' },
          },
        },
      ]),
    )
    await new Promise((r) => setTimeout(r, 10))
    expect(events).toHaveLength(1)
    expect(events[0]).toMatchObject({
      name: 'flow',
      senderId: '628111000222@s.whatsapp.net',
      response: { slot: 'pagi', flow_token: 'tok-1' },
    })
  })
})

describe('wa.cloud.commerce', () => {
  it('sendProduct() posts an interactive product payload', async () => {
    const c = await connected()
    fetchMock.mockResolvedValueOnce(ok({ messages: [{ id: 'wamid.PROD' }] }))
    await c.cloud.commerce.sendProduct('628111', {
      catalogId: 'CAT1',
      retailerId: 'SKU-1',
      bodyText: 'Produk unggulan',
    })
    const b = lastBody() as { interactive: { type: string; action: Record<string, unknown> } }
    expect(b.interactive.type).toBe('product')
    expect(b.interactive.action).toEqual({ catalog_id: 'CAT1', product_retailer_id: 'SKU-1' })
  })

  it('sendProductList() posts sections of products', async () => {
    const c = await connected()
    fetchMock.mockResolvedValueOnce(ok({ messages: [{ id: 'wamid.PRODL' }] }))
    await c.cloud.commerce.sendProductList('628111', {
      catalogId: 'CAT1',
      headerText: 'Katalog',
      bodyText: 'Pilih produk',
      sections: [{ title: 'Populer', productIds: ['SKU-1', 'SKU-2'] }],
    })
    const b = lastBody() as { interactive: { type: string; action: { catalog_id: string; sections: unknown[] } } }
    expect(b.interactive.type).toBe('product_list')
    expect(b.interactive.action.sections).toEqual([
      { title: 'Populer', product_items: [{ product_retailer_id: 'SKU-1' }, { product_retailer_id: 'SKU-2' }] },
    ])
  })

  it('inbound order fires order event with items', async () => {
    const c = await connected()
    const orders: Array<Record<string, unknown>> = []
    c.on('order', (e) => orders.push(e as unknown as Record<string, unknown>))
    await c.webhook()(
      inbound([
        {
          from: '628111000222',
          id: 'wamid.ORDER1',
          timestamp: '1752350100',
          type: 'order',
          order: {
            catalog_id: 'CAT1',
            text: 'catatan',
            product_items: [
              { product_retailer_id: 'SKU-1', quantity: 2, item_price: 15000, currency: 'IDR' },
            ],
          },
        },
      ]),
    )
    await new Promise((r) => setTimeout(r, 10))
    expect(orders).toHaveLength(1)
    expect(orders[0]).toMatchObject({
      catalogId: 'CAT1',
      senderId: '628111000222@s.whatsapp.net',
      items: [{ productRetailerId: 'SKU-1', quantity: 2, price: 15000, currency: 'IDR' }],
    })
  })
})

describe('address request', () => {
  it('sendAddressRequest() posts an address_message interactive', async () => {
    const c = await connected()
    fetchMock.mockResolvedValueOnce(ok({ messages: [{ id: 'wamid.ADDR' }] }))
    await c.cloud.sendAddressRequest('628111', { bodyText: 'Alamat pengiriman?', countryIso: 'ID' })
    const b = lastBody() as { interactive: { type: string; action: { name: string; parameters: { country: string } } } }
    expect(b.interactive.type).toBe('address_message')
    expect(b.interactive.action.name).toBe('address_message')
    expect(b.interactive.action.parameters.country).toBe('ID')
  })
})
