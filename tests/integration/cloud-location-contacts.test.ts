import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Client } from '../../src/client/client.js'
import type { MessageContext } from '../../src/events/context.js'

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

const lastBody = (): Record<string, unknown> =>
  JSON.parse((fetchMock.mock.calls.at(-1) as [string, RequestInit])[1].body as string) as Record<string, unknown>

const inbound = (messages: unknown[]) =>
  new Request('https://x.test/wh', {
    method: 'POST',
    body: JSON.stringify({
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
                contacts: [{ profile: { name: 'Budi' }, wa_id: '628111000222' }],
                messages,
              },
            },
          ],
        },
      ],
    }),
  })

describe('integration: cloud location + contacts', () => {
  it('location() sends a graph location payload', async () => {
    const c = await connectedClient()
    fetchMock.mockResolvedValueOnce(ok({ messages: [{ id: 'wamid.LOC' }] }))
    await c.send('628111').location(-6.2, 106.8, { name: 'Monas', address: 'Jakarta Pusat' })
    expect(lastBody()).toMatchObject({
      type: 'location',
      location: { latitude: -6.2, longitude: 106.8, name: 'Monas', address: 'Jakarta Pusat' },
    })
  })

  it('contact() sends a graph contacts payload parsed from the vcard', async () => {
    const c = await connectedClient()
    fetchMock.mockResolvedValueOnce(ok({ messages: [{ id: 'wamid.CT' }] }))
    const vcard = 'BEGIN:VCARD\nVERSION:3.0\nFN:Siti Aminah\nTEL;type=CELL:+62 812-0000-1111\nEND:VCARD'
    await c.send('628111').contact(vcard)
    const body = lastBody() as { type: string; contacts: Array<{ name: { formatted_name: string }; phones?: Array<{ phone: string }> }> }
    expect(body.type).toBe('contacts')
    expect(body.contacts[0]?.name.formatted_name).toBe('Siti Aminah')
    expect(body.contacts[0]?.phones?.[0]?.phone).toBe('+62 812-0000-1111')
  })

  it('inbound location fires location-typed message event', async () => {
    const c = await connectedClient()
    const messages: MessageContext[] = []
    c.on('message', (m) => messages.push(m))
    await c.webhook()(
      inbound([
        {
          from: '628111000222',
          id: 'wamid.INLOC',
          timestamp: '1752347000',
          type: 'location',
          location: { latitude: -7.797, longitude: 110.37, name: 'Tugu Jogja' },
        },
      ]),
    )
    await new Promise((r) => setTimeout(r, 10))
    expect(messages).toHaveLength(1)
    expect(messages[0]?.media).toMatchObject({ type: 'location', latitude: -7.797, longitude: 110.37 })
  })

  it('inbound contacts fires contact-typed message event', async () => {
    const c = await connectedClient()
    const messages: MessageContext[] = []
    c.on('message', (m) => messages.push(m))
    await c.webhook()(
      inbound([
        {
          from: '628111000222',
          id: 'wamid.INCT',
          timestamp: '1752347100',
          type: 'contacts',
          contacts: [{ name: { formatted_name: 'Joko Susilo' }, phones: [{ phone: '+62 813', wa_id: '62813' }] }],
        },
      ]),
    )
    await new Promise((r) => setTimeout(r, 10))
    expect(messages).toHaveLength(1)
    expect(messages[0]?.media).toMatchObject({ type: 'contact' })
  })
})
