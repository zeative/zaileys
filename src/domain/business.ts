import { ZaileysDomainError } from './errors.js'
import type { DomainSocketLike } from './socket-like.js'

export class BusinessModule {
  constructor(private readonly getSocket: () => DomainSocketLike | undefined) {}

  protected requireSocket(): DomainSocketLike {
    const socket = this.getSocket()
    if (!socket) {
      throw new ZaileysDomainError('NOT_CONNECTED', 'client not connected')
    }
    return socket
  }

  async profile(jid: string): Promise<unknown> {
    return this.requireSocket().getBusinessProfile(jid)
  }

  async catalog(opts: { jid?: string; limit?: number; cursor?: string } = {}): Promise<unknown> {
    return this.requireSocket().getCatalog(opts)
  }

  async collections(jid?: string, limit?: number): Promise<unknown> {
    return this.requireSocket().getCollections(jid, limit)
  }

  async orderDetails(orderId: string, tokenBase64: string): Promise<unknown> {
    return this.requireSocket().getOrderDetails(orderId, tokenBase64)
  }

  async createProduct(create: Record<string, unknown>): Promise<unknown> {
    return this.requireSocket().productCreate(create)
  }

  async updateProduct(productId: string, update: Record<string, unknown>): Promise<unknown> {
    return this.requireSocket().productUpdate(productId, update)
  }

  async deleteProduct(...productIds: string[]): Promise<{ deleted: number }> {
    return this.requireSocket().productDelete(productIds)
  }
}
