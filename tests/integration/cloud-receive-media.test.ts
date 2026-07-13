import { readFileSync } from 'node:fs'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Client } from '../../src/client/client.js'
import type { MessageContext } from '../../src/events/context.js'

const fixture = readFileSync(new URL('../_fixtures/cloud/image-message.json', import.meta.url), 'utf8')

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

const post = (body: string) => new Request('https://x.test/wh', { method: 'POST', body })

describe('integration: cloud receive media', () => {
  it('image webhook fires message + image events with media descriptor', async () => {
    const c = await connectedClient()
    const images: MessageContext[] = []
    c.on('image', (m) => images.push(m))
    await c.webhook()(post(fixture))
    await new Promise((r) => setTimeout(r, 10))
    expect(images).toHaveLength(1)
    const m = images[0] as MessageContext
    expect(m.senderId).toBe('628111000222@s.whatsapp.net')
    expect(m.text).toBe('cek foto ini')
    expect(m.media).toMatchObject({ type: 'image', mimetype: 'image/jpeg' })
  })

  it('downloadMedia resolves the Meta media url then fetches bytes', async () => {
    const c = await connectedClient()
    await c.webhook()(post(fixture))
    await new Promise((r) => setTimeout(r, 10))
    fetchMock
      .mockResolvedValueOnce(ok({ url: 'https://lookaside.fbsbx.com/whatsapp_business/attachments/?mid=MEDIA-IN-1' }))
      .mockResolvedValueOnce(new Response(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3])))
    const result = await c.downloadMedia({
      id: 'wamid.IMAGE01',
      remoteJid: '628111000222@s.whatsapp.net',
      fromMe: false,
    })
    expect(result).not.toBeNull()
    expect(result?.buffer.length).toBeGreaterThan(0)
    expect(result?.mime).toBe('image/jpeg')
    const metaUrl = (fetchMock.mock.calls[0] as [string])[0]
    expect(metaUrl).toBe('https://graph.facebook.com/v23.0/MEDIA-IN-1')
    const cdnInit = (fetchMock.mock.calls[1] as [string, RequestInit])[1]
    expect((cdnInit.headers as Record<string, string>).Authorization).toBe('Bearer tok')
  })

  it('downloadMedia returns null for unknown message', async () => {
    const c = await connectedClient()
    const result = await c.downloadMedia({ id: 'wamid.NOPE', remoteJid: 'x@s.whatsapp.net', fromMe: false })
    expect(result).toBeNull()
  })
})
