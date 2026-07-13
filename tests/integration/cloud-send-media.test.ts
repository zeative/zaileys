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

/** Tiny valid JPEG magic prefix so mime sniffing resolves image/jpeg. */
const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(64)])
const PDF = Buffer.concat([Buffer.from('%PDF-1.4\n'), Buffer.alloc(32)])

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

describe('integration: cloud send media', () => {
  it('image(buffer) uploads to /media then sends referencing the media id', async () => {
    const c = await connectedClient()
    fetchMock
      .mockResolvedValueOnce(ok({ id: 'MEDIA-1' }))
      .mockResolvedValueOnce(ok({ messages: [{ id: 'wamid.IMG' }] }))
    const key = await c.send('628111').image(JPEG, { caption: 'lihat ini' })
    expect(key.id).toBe('wamid.IMG')
    const [uploadUrl, uploadInit] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(uploadUrl).toBe('https://graph.facebook.com/v23.0/555/media')
    expect(uploadInit.body).toBeInstanceOf(FormData)
    const form = uploadInit.body as FormData
    expect(form.get('messaging_product')).toBe('whatsapp')
    expect(form.get('file')).toBeInstanceOf(Blob)
    const [sendUrl, sendInit] = fetchMock.mock.calls[1] as [string, RequestInit]
    expect(sendUrl).toBe('https://graph.facebook.com/v23.0/555/messages')
    expect(JSON.parse(sendInit.body as string)).toMatchObject({
      type: 'image',
      image: { id: 'MEDIA-1', caption: 'lihat ini' },
    })
  })

  it('document sends filename and uses document type', async () => {
    const c = await connectedClient()
    fetchMock
      .mockResolvedValueOnce(ok({ id: 'MEDIA-2' }))
      .mockResolvedValueOnce(ok({ messages: [{ id: 'wamid.DOC' }] }))
    await c.send('628111').document(PDF, { fileName: 'laporan.pdf' })
    const body = JSON.parse((fetchMock.mock.calls[1] as [string, RequestInit])[1].body as string) as {
      type: string
      document: { id: string; filename?: string }
    }
    expect(body.type).toBe('document')
    expect(body.document.id).toBe('MEDIA-2')
    expect(body.document.filename).toBe('laporan.pdf')
  })

  it('audio content uploads and sends as audio type (transport level; builder transcode is baileys-tested)', async () => {
    const { CloudTransport } = await import('../../src/cloud/transport.js')
    const t = new CloudTransport({ accessToken: 'tok', phoneNumberId: '555', apiVersion: 'v23.0' })
    fetchMock
      .mockResolvedValueOnce(ok({ id: 'MEDIA-3' }))
      .mockResolvedValueOnce(ok({ messages: [{ id: 'wamid.AUD' }] }))
    const OGG = Buffer.concat([Buffer.from('OggS'), Buffer.alloc(32)])
    await t.sendMessage('628111', { audio: OGG } as never)
    const body = JSON.parse((fetchMock.mock.calls[1] as [string, RequestInit])[1].body as string) as {
      type: string
      audio: { id: string }
    }
    expect(body.type).toBe('audio')
    expect(body.audio.id).toBe('MEDIA-3')
  })

  it('upload failure surfaces SEND_FAILED with cloud cause', async () => {
    const c = await connectedClient()
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ error: { message: 'media too large', code: 131052 } }), { status: 400 }),
    )
    await expect(c.send('628111').image(JPEG)).rejects.toMatchObject({ code: 'SEND_FAILED' })
  })
})
