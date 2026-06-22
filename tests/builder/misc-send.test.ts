import { describe, expect, it, vi } from 'vitest'
import type { BuilderSocketLike } from '../../src/builder/builder.js'

const loadMediaMock = vi.fn<[unknown], Promise<{ buffer: Buffer; mime: string; size: number }>>()
vi.mock('../../src/builder/media-loader.js', () => ({
  loadMedia: (src: unknown) => loadMediaMock(src),
}))

const { MessageBuilder } = await import('../../src/builder/builder.js')
const { buildProductContent } = await import('../../src/builder/content/product.js')
const { ZaileysBuilderError } = await import('../../src/builder/errors.js')

type Captured = { jid: string; content: Record<string, unknown> }
const makeSocket = (): { socket: BuilderSocketLike; captured: () => Captured } => {
  let last: Captured | undefined
  const socket = {
    sendMessage: async (jid: string, content: unknown) => {
      last = { jid, content: content as Record<string, unknown> }
      return { key: { id: 'X', remoteJid: jid, fromMe: true } } as never
    },
  } as unknown as BuilderSocketLike
  return { socket, captured: () => { if (!last) throw new Error('not sent'); return last } }
}

describe('phone-number + limitSharing builder content', () => {
  it('requestPhoneNumber sends an empty requestPhoneNumber content', async () => {
    const { socket, captured } = makeSocket()
    await MessageBuilder.create(socket, '62811@s.whatsapp.net').requestPhoneNumber()
    expect(captured().content).toEqual({ requestPhoneNumber: {} })
  })
  it('sharePhoneNumber sends an empty sharePhoneNumber content', async () => {
    const { socket, captured } = makeSocket()
    await MessageBuilder.create(socket, '62811@s.whatsapp.net').sharePhoneNumber()
    expect(captured().content).toEqual({ sharePhoneNumber: {} })
  })
  it('limitSharing toggles via boolean (defaults true)', async () => {
    const { socket, captured } = makeSocket()
    await MessageBuilder.create(socket, '62811@s.whatsapp.net').limitSharing()
    expect(captured().content).toEqual({ limitSharing: true })
    const b = makeSocket()
    await MessageBuilder.create(b.socket, '62811@s.whatsapp.net').limitSharing(false)
    expect(b.captured().content).toEqual({ limitSharing: false })
  })
})

describe('buildProductContent', () => {
  it('maps fields and price -> priceAmount1000', async () => {
    const buf = Buffer.from('img')
    loadMediaMock.mockResolvedValue({ buffer: buf, mime: 'image/jpeg', size: buf.length })
    const content = (await buildProductContent({
      image: 'x', title: 'Kaos', businessOwnerId: 'biz@s.whatsapp.net',
      description: 'cotton', price: 50, currency: 'IDR', productId: 'p1', retailerId: 'r1', url: 'http://x',
    })) as Record<string, unknown>
    expect(content.businessOwnerJid).toBe('biz@s.whatsapp.net')
    expect(content.product).toMatchObject({ title: 'Kaos', description: 'cotton', currencyCode: 'IDR', priceAmount1000: 50000, productId: 'p1', retailerId: 'r1', url: 'http://x' })
    expect((content.product as { productImage: Buffer }).productImage).toBe(buf)
  })
  it('rejects missing title or businessOwnerId', async () => {
    loadMediaMock.mockResolvedValue({ buffer: Buffer.from('i'), mime: 'image/jpeg', size: 1 })
    await expect(buildProductContent({ image: 'x', title: '', businessOwnerId: 'b' })).rejects.toThrow(ZaileysBuilderError)
    await expect(buildProductContent({ image: 'x', title: 't', businessOwnerId: '' })).rejects.toThrow(ZaileysBuilderError)
  })
})
