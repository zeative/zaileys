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

describe('cloud outbound react / markRead / typing', () => {
  it('react() sends a reaction payload targeting the message id', async () => {
    const c = await connectedClient()
    fetchMock.mockResolvedValueOnce(ok({ messages: [{ id: 'wamid.R' }] }))
    const key = await c.react({ id: 'wamid.TARGET', remoteJid: '628111@s.whatsapp.net', fromMe: false }, '🔥')
    expect(key.id).toBe('wamid.R')
    expect(lastBody()).toMatchObject({
      type: 'reaction',
      to: '628111',
      reaction: { message_id: 'wamid.TARGET', emoji: '🔥' },
    })
  })

  it('unreact (empty emoji) sends empty reaction body', async () => {
    const c = await connectedClient()
    fetchMock.mockResolvedValueOnce(ok({ messages: [{ id: 'wamid.R2' }] }))
    await c.react({ id: 'wamid.TARGET', remoteJid: '628111@s.whatsapp.net', fromMe: false }, '')
    expect(lastBody()).toMatchObject({ reaction: { message_id: 'wamid.TARGET', emoji: '' } })
  })

  it('markRead(messageId) posts a read status', async () => {
    const c = await connectedClient()
    fetchMock.mockResolvedValueOnce(ok({ success: true }))
    await c.markRead('wamid.SEEN')
    const [url] = fetchMock.mock.calls[0] as [string]
    expect(url).toBe('https://graph.facebook.com/v23.0/555/messages')
    expect(lastBody()).toMatchObject({
      messaging_product: 'whatsapp',
      status: 'read',
      message_id: 'wamid.SEEN',
    })
  })

  it('markRead with typing shows a typing indicator', async () => {
    const c = await connectedClient()
    fetchMock.mockResolvedValueOnce(ok({ success: true }))
    await c.markRead('wamid.SEEN', { typing: true })
    expect(lastBody()).toMatchObject({
      status: 'read',
      message_id: 'wamid.SEEN',
      typing_indicator: { type: 'text' },
    })
  })

  it('markRead on baileys provider throws a clear error', async () => {
    const { MemoryAuthStore } = await import('../../src/auth/adapters/memory.js')
    const c = new Client({ auth: new MemoryAuthStore(), autoConnect: false, qrTerminal: false, statusLog: false })
    await expect(c.markRead('wamid.X')).rejects.toThrowError(/cloud/)
  })
})
