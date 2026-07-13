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

const lastBody = (): Record<string, unknown> =>
  JSON.parse((fetchMock.mock.calls.at(-1) as [string, RequestInit])[1].body as string) as Record<string, unknown>

describe('cloud outbound interactive', () => {
  it('buttons() sends a graph interactive button payload', async () => {
    const c = await connectedClient()
    fetchMock.mockResolvedValueOnce(ok({ messages: [{ id: 'wamid.BTN' }] }))
    await c
      .send('628111')
      .buttons([{ text: 'Ya', id: 'yes' }, { text: 'Tidak', id: 'no' }], { text: 'Setuju?', footer: 'pilih satu' })
    const body = lastBody() as {
      type: string
      to: string
      interactive: {
        type: string
        body: { text: string }
        footer?: { text: string }
        action: { buttons: Array<{ type: string; reply: { id: string; title: string } }> }
      }
    }
    expect(body.type).toBe('interactive')
    expect(body.to).toBe('628111')
    expect(body.interactive.type).toBe('button')
    expect(body.interactive.body.text).toBe('Setuju?')
    expect(body.interactive.footer?.text).toBe('pilih satu')
    expect(body.interactive.action.buttons).toEqual([
      { type: 'reply', reply: { id: 'yes', title: 'Ya' } },
      { type: 'reply', reply: { id: 'no', title: 'Tidak' } },
    ])
  })

  it('more than 3 reply buttons throws (meta hard limit)', async () => {
    const c = await connectedClient()
    await expect(
      c.send('628111').buttons(
        [
          { text: 'a', id: '1' },
          { text: 'b', id: '2' },
          { text: 'c', id: '3' },
          { text: 'd', id: '4' },
        ],
        { text: 'x' },
      ),
    ).rejects.toThrowError()
  })

  it('list() sends a graph interactive list payload', async () => {
    const c = await connectedClient()
    fetchMock.mockResolvedValueOnce(ok({ messages: [{ id: 'wamid.LIST' }] }))
    await c.send('628111').list({
      title: 'Menu',
      description: 'Pilih menu favoritmu',
      buttonText: 'Lihat menu',
      footerText: 'buka tiap hari',
      sections: [
        {
          title: 'Makanan',
          rows: [
            { id: 'nasgor', title: 'Nasi Goreng', description: 'pedas' },
            { id: 'mie', title: 'Mie Ayam' },
          ],
        },
      ],
    })
    const body = lastBody() as {
      type: string
      interactive: {
        type: string
        header?: { type: string; text: string }
        body: { text: string }
        action: { button: string; sections: Array<{ title: string; rows: Array<{ id: string; title: string }> }> }
      }
    }
    expect(body.interactive.type).toBe('list')
    expect(body.interactive.header).toEqual({ type: 'text', text: 'Menu' })
    expect(body.interactive.body.text).toBe('Pilih menu favoritmu')
    expect(body.interactive.action.button).toBe('Lihat menu')
    expect(body.interactive.action.sections[0]?.rows).toEqual([
      { id: 'nasgor', title: 'Nasi Goreng', description: 'pedas' },
      { id: 'mie', title: 'Mie Ayam', description: '' },
    ])
  })

  it('the synthesized upsert carries the real wamid for the store', async () => {
    const c = await connectedClient()
    fetchMock.mockResolvedValueOnce(ok({ messages: [{ id: 'wamid.BTN2' }] }))
    await c.send('628111').buttons([{ text: 'Ok', id: 'ok' }], { text: 'test' })
    await new Promise((r) => setTimeout(r, 5))
    const stored = await c.store.getMessage({ id: 'wamid.BTN2', remoteJid: '628111@s.whatsapp.net', fromMe: true })
    expect(stored).toBeDefined()
  })
})
