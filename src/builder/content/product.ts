import type { AnyMessageContent } from 'baileys'
import { ZaileysBuilderError } from '../errors.js'
import { loadMedia } from '../media-loader.js'
import type { ProductOptions } from '../types.js'

export const buildProductContent = async (opts: ProductOptions): Promise<AnyMessageContent> => {
  if (opts == null || typeof opts.title !== 'string' || opts.title.trim().length === 0) {
    throw new ZaileysBuilderError('INVALID_OPTIONS', 'product() requires a non-empty title')
  }
  if (typeof opts.businessOwnerId !== 'string' || opts.businessOwnerId.length === 0) {
    throw new ZaileysBuilderError('INVALID_OPTIONS', 'product() requires businessOwnerId')
  }
  const { buffer } = await loadMedia(opts.image)
  const product: Record<string, unknown> = { productImage: buffer, title: opts.title }
  if (opts.productId !== undefined) product['productId'] = opts.productId
  if (opts.description !== undefined) product['description'] = opts.description
  if (opts.currency !== undefined) product['currencyCode'] = opts.currency
  if (opts.price !== undefined) product['priceAmount1000'] = Math.round(opts.price * 1000)
  if (opts.retailerId !== undefined) product['retailerId'] = opts.retailerId
  if (opts.url !== undefined) product['url'] = opts.url

  const content: Record<string, unknown> = { product, businessOwnerJid: opts.businessOwnerId }
  if (opts.body !== undefined) content['body'] = opts.body
  if (opts.footer !== undefined) content['footer'] = opts.footer
  return content as unknown as AnyMessageContent
}
