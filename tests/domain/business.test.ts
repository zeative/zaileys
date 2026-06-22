import { describe, expect, it, vi } from 'vitest'
import { BusinessModule } from '../../src/domain/business.js'
import type { DomainSocketLike } from '../../src/domain/socket-like.js'

const sock = (over: Record<string, unknown>) => over as unknown as DomainSocketLike

describe('BusinessModule', () => {
  it('forwards catalog/collections/profile/order', async () => {
    const m = {
      getBusinessProfile: vi.fn(async () => ({ description: 'shop' })),
      getCatalog: vi.fn(async () => ({ products: [] })),
      getCollections: vi.fn(async () => ({ collections: [] })),
      getOrderDetails: vi.fn(async () => ({ price: 1 })),
    }
    const b = new BusinessModule(() => sock(m))
    expect(await b.profile('biz@s.whatsapp.net')).toMatchObject({ description: 'shop' })
    await b.catalog({ jid: 'biz@s.whatsapp.net', limit: 10 })
    expect(m.getCatalog).toHaveBeenCalledWith({ jid: 'biz@s.whatsapp.net', limit: 10 })
    await b.collections('biz@s.whatsapp.net', 5)
    expect(m.getCollections).toHaveBeenCalledWith('biz@s.whatsapp.net', 5)
    await b.orderDetails('o1', 'tok')
    expect(m.getOrderDetails).toHaveBeenCalledWith('o1', 'tok')
  })

  it('product CRUD forwards', async () => {
    const m = {
      productCreate: vi.fn(async () => ({ id: 'p1' })),
      productUpdate: vi.fn(async () => ({ id: 'p1' })),
      productDelete: vi.fn(async () => ({ deleted: 2 })),
    }
    const b = new BusinessModule(() => sock(m))
    await b.createProduct({ name: 'Kaos' })
    expect(m.productCreate).toHaveBeenCalledWith({ name: 'Kaos' })
    await b.updateProduct('p1', { price: 1000 })
    expect(m.productUpdate).toHaveBeenCalledWith('p1', { price: 1000 })
    expect(await b.deleteProduct('p1', 'p2')).toEqual({ deleted: 2 })
    expect(m.productDelete).toHaveBeenCalledWith(['p1', 'p2'])
  })

  it('throws NOT_CONNECTED without socket', async () => {
    await expect(new BusinessModule(() => undefined).profile('x')).rejects.toMatchObject({ code: 'NOT_CONNECTED' })
  })
})
