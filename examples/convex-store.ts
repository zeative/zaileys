/**
 * Persist session + chat history in Convex. Deploy examples/convex/{schema,zaileys}.ts
 * to your Convex project first (see examples/convex/README.md).
 *
 * Run: CONVEX_URL=https://your.convex.cloud bun run examples/convex-store.ts
 */
import { Client, ConvexAuthStore, ConvexMessageStore } from '../src/index.js'

const CONVEX_URL = process.env['CONVEX_URL'] ?? ''
if (!CONVEX_URL) {
  console.error('Set CONVEX_URL, e.g. CONVEX_URL=https://your.convex.cloud bun run examples/convex-store.ts')
  process.exit(1)
}

const client = new Client({
  auth: new ConvexAuthStore({ url: CONVEX_URL, namespace: 'wa-auth' }),
  store: new ConvexMessageStore({ url: CONVEX_URL, namespace: 'wa-store' }),
})

client.on('qr', ({ qrString }) => console.log('Scan QR:', qrString))
client.on('connect', ({ me }) => console.log('Connected as', me.id, '— session persisted in Convex'))
client.on('text', (msg) => console.log('text:', msg.senderId, '|', msg.text))
