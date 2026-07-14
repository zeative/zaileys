import { readFileSync } from 'node:fs'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Client } from '../../src/client/client.js'
import type { MessageContext } from '../../src/events/context.js'

const fixture = readFileSync(new URL('../_fixtures/cloud/text-message.json', import.meta.url), 'utf8')

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
    cloud: { accessToken: 'tok', phoneNumberId: '555', verifyToken: 'verify-me' },
    autoConnect: false,
    statusLog: false,
  })
  await c.connect()
  fetchMock.mockReset()
  return c
}

const post = (body: string) => new Request('https://x.test/wh', { method: 'POST', body })

describe('integration: cloud receive text', () => {
  it('webhook POST fires message and text events with baileys-shaped context', async () => {
    const c = await connectedClient()
    const messages: MessageContext[] = []
    const texts: MessageContext[] = []
    c.on('message', (m) => messages.push(m))
    c.on('text', (m) => texts.push(m))
    const res = await c.webhook()(post(fixture))
    expect(res.status).toBe(200)
    await new Promise((r) => setTimeout(r, 10))
    expect(messages).toHaveLength(1)
    expect(texts).toHaveLength(1)
    const m = texts[0] as MessageContext
    expect(m.text).toBe('halo bot')
    expect(m.senderId).toBe('628111000222@s.whatsapp.net')
    expect(m.roomId).toBe('628111000222@s.whatsapp.net')
    expect(m.senderName).toBe('Budi Santoso')
    expect(m.chatId).toBe('wamid.HBgLNjI4MTExMDAwMjIyFQIAEhgUM0E5RkY2NDVDMkI3NDdCQzcxRkYA')
  })

  it('inbound message is saved to the store', async () => {
    const c = await connectedClient()
    await c.webhook()(post(fixture))
    await new Promise((r) => setTimeout(r, 10))
    const stored = await c.store.getMessage({
      id: 'wamid.HBgLNjI4MTExMDAwMjIyFQIAEhgUM0E5RkY2NDVDMkI3NDdCQzcxRkYA',
      remoteJid: '628111000222@s.whatsapp.net',
      fromMe: false,
    })
    expect(stored).toBeDefined()
  })

  it('reply() from the message context sends through the cloud transport', async () => {
    const c = await connectedClient()
    const replied = new Promise<void>((resolve, reject) => {
      c.on('text', (m) => {
        fetchMock.mockResolvedValueOnce(ok({ messages: [{ id: 'wamid.REPLY' }] }))
        m.reply('siap!').then(() => resolve(), reject)
      })
    })
    await c.webhook()(post(fixture))
    await replied
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toContain('/555/messages')
    const body = JSON.parse(init.body as string) as { to: string; text: { body: string } }
    expect(body.to).toBe('628111000222')
    expect(body.text.body).toBe('siap!')
  })

  it('webhook() on baileys provider throws', async () => {
    const { MemoryAuthStore } = await import('../../src/auth/adapters/memory.js')
    const c = new Client({ auth: new MemoryAuthStore(), autoConnect: false, qrTerminal: false, statusLog: false })
    expect(() => c.webhook()).toThrowError()
  })
})

describe('integration: cloud webhook without connect()', () => {
  it('webhook() dispatches events even if connect() was never called', async () => {
    // no health-check fetch — construct only, never connect
    const c = new Client({
      provider: 'cloud',
      cloud: { accessToken: 'tok', phoneNumberId: '555', verifyToken: 'verify-me' },
      autoConnect: false,
      statusLog: false,
    })
    const texts: MessageContext[] = []
    c.on('text', (m) => texts.push(m))
    const res = await c.webhook()(post(fixture))
    expect(res.status).toBe(200)
    await new Promise((r) => setTimeout(r, 10))
    expect(texts).toHaveLength(1)
    expect(texts[0]?.text).toBe('halo bot')
  })
})

describe('integration: cloud inbound quoted/context parsing', () => {
  function reply(quotedId: string) {
    return post(JSON.stringify({
      object: 'whatsapp_business_account',
      entry: [{ id: 'W', changes: [{ field: 'messages', value: {
        messaging_product: 'whatsapp', metadata: { phone_number_id: '555' },
        contacts: [{ profile: { name: 'Budi' }, wa_id: '628111000222' }],
        messages: [{ from: '628111000222', id: 'wamid.REPLY', timestamp: '1752350000',
          type: 'text', text: { body: 'setuju' }, context: { from: '555', id: quotedId } }],
      } }] }],
    }))
  }

  it('a reply carries context.id → msg.replied() resolves the stored original', async () => {
    const c = await connectedClient()
    // bot sends a message first → stored under its wamid
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ messages: [{ id: 'wamid.ORIG' }] }), { status: 200 }))
    await c.send('628111000222').text('pertanyaan?')
    await new Promise((r) => setTimeout(r, 5))

    let quoted: MessageContext | null = null
    const done = new Promise<void>((resolve) => {
      c.on('text', async (m) => { if (m.text === 'setuju') { quoted = await m.replied(); resolve() } })
    })
    await c.webhook()(reply('wamid.ORIG'))
    await done
    expect(quoted).not.toBeNull()
    expect(quoted?.chatId).toBe('wamid.ORIG')
    expect(quoted?.text).toBe('pertanyaan?')
  })
})
