# Convex storage adapters

Persist your WhatsApp session (auth creds + signal keys) and chat history in
[Convex](https://convex.dev). Unlike Postgres/Redis/SQLite, Convex is reached
through **deployed functions**, so there is a one-time setup step.

## 1. Deploy the functions

In your Convex project:

1. Add the `zaileys_kv` table from [`schema.ts`](./schema.ts) to your
   `convex/schema.ts` (merge it with your existing schema).
2. Copy [`zaileys.ts`](./zaileys.ts) into your project as `convex/zaileys.ts`.
3. Deploy: `npx convex dev` (or `npx convex deploy`).

This exposes `zaileys:get`, `zaileys:set`, `zaileys:del`, `zaileys:clear`, and
`zaileys:list` against a single `zaileys_kv` table.

## 2. Install the peer dependency

```bash
pnpm add convex
```

## 3. Wire it into the Client

```ts
import { Client, ConvexAuthStore, ConvexMessageStore } from 'zaileys'

const url = process.env.CONVEX_URL // e.g. https://your-deployment.convex.cloud

const client = new Client({
  auth: new ConvexAuthStore({ url, namespace: 'wa-auth' }),
  store: new ConvexMessageStore({ url, namespace: 'wa-store' }),
})
```

Pass a pre-built client instead of a `url` if you already have one:

```ts
import { ConvexHttpClient } from 'convex/browser'
const convex = new ConvexHttpClient(process.env.CONVEX_URL!)
new ConvexAuthStore({ client: convex, namespace: 'wa-auth' })
```

## Notes

- **Use distinct `namespace` values for auth vs store** if they share one
  deployment — `clear()` wipes a whole namespace (auth `clear()` runs on a
  401/410 logout, mirroring the other adapters).
- Values are `BufferJSON`-serialized strings, so Buffers round-trip byte-for-byte.
- Messages carry `sortKey = messageTimestamp`; `listMessages` returns
  newest-first and honours `before` paging.
