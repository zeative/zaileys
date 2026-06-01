/**
 * Run two independent WhatsApp sessions in one process.
 *
 * Run: bun run examples/multi-account.ts
 */
import { Client } from '../src/index.js'

const primary = new Client({ sessionId: 'account-a' })
const secondary = new Client({ sessionId: 'account-b' })

primary.on('qr', ({ qrString }) => console.log('[account-a] Scan QR:', qrString))
secondary.on('qr', ({ qrString }) => console.log('[account-b] Scan QR:', qrString))

primary.on('connect', ({ me }) => console.log('[account-a] Connected as', me.id))
secondary.on('connect', ({ me }) => console.log('[account-b] Connected as', me.id))

primary.on('text', async (msg) => {
  if (msg.isFromMe) return
  await primary.send(msg.senderId).text('Reply from account A')
})

secondary.on('text', async (msg) => {
  if (msg.isFromMe) return
  await secondary.send(msg.senderId).text('Reply from account B')
})

process.on('SIGINT', async () => {
  await Promise.all([primary.disconnect(), secondary.disconnect()])
  process.exit(0)
})
