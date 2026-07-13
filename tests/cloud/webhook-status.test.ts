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

const statusPayload = JSON.stringify({
  object: 'whatsapp_business_account',
  entry: [
    {
      id: '1',
      changes: [
        {
          field: 'messages',
          value: {
            messaging_product: 'whatsapp',
            metadata: { phone_number_id: '555' },
            statuses: [
              {
                id: 'wamid.OUT1',
                status: 'delivered',
                timestamp: '1752348000',
                recipient_id: '628111000222',
              },
              {
                id: 'wamid.OUT2',
                status: 'failed',
                timestamp: '1752348050',
                recipient_id: '628111000333',
                errors: [{ code: 131026, title: 'Message undeliverable' }],
              },
            ],
          },
        },
      ],
    },
  ],
})

describe('cloud message-status events', () => {
  it('statuses[] fires message-status with id, status, recipient and error detail', async () => {
    fetchMock.mockResolvedValueOnce(ok({ id: '555' }))
    const c = new Client({
      provider: 'cloud',
      cloud: { accessToken: 'tok', phoneNumberId: '555' },
      autoConnect: false,
      statusLog: false,
    })
    await c.connect()
    const events: Array<Record<string, unknown>> = []
    c.on('message-status', (e) => events.push(e as unknown as Record<string, unknown>))
    await c.webhook()(new Request('https://x.test/wh', { method: 'POST', body: statusPayload }))
    await new Promise((r) => setTimeout(r, 10))
    expect(events).toHaveLength(2)
    expect(events[0]).toMatchObject({
      id: 'wamid.OUT1',
      status: 'delivered',
      recipientId: '628111000222@s.whatsapp.net',
      timestamp: 1752348000,
    })
    expect(events[1]).toMatchObject({ id: 'wamid.OUT2', status: 'failed' })
    expect((events[1] as { error?: { code?: number } }).error?.code).toBe(131026)
  })
})
