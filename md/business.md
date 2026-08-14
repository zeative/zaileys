# Business & Catalog

> Source: https://zeative.github.io/zaileys/business

# Business & Catalog

`client.business` is the WhatsApp Business namespace on the zaileys [Client](/client). It exposes
read access to business profiles, product catalogs, collections, and order details, plus write access
to create, update, and delete catalog products. It is a lazily-created `BusinessModule` — constructed
on first access and proxying every call through the live socket.

```typescript

const client = new Client({ sessionId: 'default' })

client.on('connect', async () => {
  const profile = await client.business.profile('628xxxxxxxxxx@s.whatsapp.net')
  console.log(profile)

  const catalog = await client.business.catalog({ limit: 10 })
  console.log(catalog)
})
```

**Requires a WhatsApp Business account.** These methods only work when the connected account is a
WhatsApp Business account (or you are reading another account that is a business). Catalog write
operations (`createProduct`, `updateProduct`, `deleteProduct`) act on **your own** business catalog.

Every method calls an internal `requireSocket()` guard. If the client is not connected, the call
immediately throws a `ZaileysDomainError` with code `NOT_CONNECTED` and message `client not
connected`. Always wait for the `'connect'` event (or `await client.connect()`) first. See
[Error Handling](/error-handling).

**Return shapes are raw.** Every method returns the raw object from the underlying transport layer
(baileys). zaileys does not reshape these — consult the baileys types for the exact fields. The
signatures below type returns as `unknown`; cast or narrow as needed for your use case.

## Methods at a glance

| Method | Signature | Returns | Description |
| ------ | --------- | ------- | ----------- |
| `profile` | `profile(jid)` | `Promise<unknown>` | Fetch a business profile. |
| `catalog` | `catalog({ jid?, limit?, cursor? })` | `Promise<unknown>` | Browse a catalog (paginated). |
| `collections` | `collections(jid?, limit?)` | `Promise<unknown>` | List catalog collections. |
| `orderDetails` | `orderDetails(orderId, tokenBase64)` | `Promise<unknown>` | Fetch order details. |
| `createProduct` | `createProduct(create)` | `Promise<unknown>` | Create a catalog product. |
| `updateProduct` | `updateProduct(productId, update)` | `Promise<unknown>` | Update a catalog product. |
| `deleteProduct` | `deleteProduct(...productIds)` | `Promise<{ deleted: number }>` | Delete one or more products. |

## `profile`

```typescript
profile(jid: string): Promise<unknown>
```

Fetches the business profile for the given JID: description, category, address, hours, websites, and
related fields.

```typescript
client.on('connect', async () => {
  const profile = await client.business.profile('628xxxxxxxxxx@s.whatsapp.net')
  console.log(profile)
})
```

| Parameter | Type | Description |
| --------- | ---- | ----------- |
| `jid` | `string` | The business account JID. |

## `catalog`

```typescript
catalog(opts?: { jid?: string; limit?: number; cursor?: string }): Promise<unknown>
```

Browses a product catalog. With no `jid`, returns your own catalog. Use `limit` to page size and
`cursor` to paginate.

```typescript
client.on('connect', async () => {
  // Your own catalog
  const mine = await client.business.catalog({ limit: 20 })

  // Another business's catalog
  const theirs = await client.business.catalog({
    jid: '628xxxxxxxxxx@s.whatsapp.net',
    limit: 10,
  })

  console.log(mine, theirs)
})
```

| Parameter | Type | Description |
| --------- | ---- | ----------- |
| `opts.jid` | `string` (optional) | Target business JID. Omit for your own catalog. |
| `opts.limit` | `number` (optional) | Max products to return. |
| `opts.cursor` | `string` (optional) | Pagination cursor from a previous response. |

## `collections`

```typescript
collections(jid?: string, limit?: number): Promise<unknown>
```

Lists the catalog collections (groupings of products) for a business. Omit `jid` for your own
collections.

```typescript
client.on('connect', async () => {
  const collections = await client.business.collections(undefined, 5)
  console.log(collections)
})
```

| Parameter | Type | Description |
| --------- | ---- | ----------- |
| `jid` | `string` (optional) | Target business JID. Omit for your own collections. |
| `limit` | `number` (optional) | Max collections to return. |

## `orderDetails`

```typescript
orderDetails(orderId: string, tokenBase64: string): Promise<unknown>
```

Fetches the details of an order. Both the `orderId` and the base64 `token` come from an inbound order
message's payload.

```typescript
client.on('connect', async () => {
  const order = await client.business.orderDetails('ORDER_ID', 'BASE64_TOKEN')
  console.log(order)
})
```

| Parameter | Type | Description |
| --------- | ---- | ----------- |
| `orderId` | `string` | The order identifier. |
| `tokenBase64` | `string` | The base64 order token from the order message. |

## `createProduct`

```typescript
createProduct(create: Record<string, unknown>): Promise<unknown>
```

Creates a new product in your business catalog. The `create` payload is passed through to baileys —
typical fields include `name`, `price`, `currency`, `description`, `images`, and `isHidden`.

```typescript
client.on('connect', async () => {
  const product = await client.business.createProduct({
    name: 'Zaileys Sticker Pack',
    price: 25000,
    currency: 'IDR',
    description: 'Official sticker pack.',
    images: [{ url: 'https://example.com/sticker.png' }],
  })

  console.log('Created:', product)
})
```

| Parameter | Type | Description |
| --------- | ---- | ----------- |
| `create` | `Record<string, unknown>` | The product payload (passed through to baileys `productCreate`). |

## `updateProduct`

```typescript
updateProduct(productId: string, update: Record<string, unknown>): Promise<unknown>
```

Updates an existing catalog product by id. Pass only the fields you want to change.

```typescript
client.on('connect', async () => {
  const updated = await client.business.updateProduct('PRODUCT_ID', {
    price: 30000,
    isHidden: false,
  })

  console.log('Updated:', updated)
})
```

| Parameter | Type | Description |
| --------- | ---- | ----------- |
| `productId` | `string` | The product id to update. |
| `update` | `Record<string, unknown>` | The fields to change (passed through to baileys `productUpdate`). |

## `deleteProduct`

```typescript
deleteProduct(...productIds: string[]): Promise<{ deleted: number }>
```

Deletes one or more catalog products. Returns the count of products that were deleted.

```typescript
client.on('connect', async () => {
  const { deleted } = await client.business.deleteProduct('PRODUCT_ID_1', 'PRODUCT_ID_2')
  console.log(`${deleted} product(s) deleted.`)
})
```

| Parameter | Type | Description |
| --------- | ---- | ----------- |
| `productIds` | `...string[]` | One or more product ids to delete. |

**Returns:** `{ deleted: number }` — the number of products deleted.

## See also

- [Client & Lifecycle](/client) — how to construct the client and connect.
- [Interactive Messages](/interactive) — product and order messages in chat.
- [Error Handling](/error-handling) — `ZaileysDomainError` codes and catch patterns.
