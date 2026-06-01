/**
 * Connect, scan the QR, and echo incoming text (with quoted-reply lookup).
 *
 * Run: bun run examples/quickstart-connect.ts
 */
import { Client } from '../src/index.js'

const client = new Client()

client.on('qr', ({ qrString }) => console.log('Scan QR:', qrString))
client.on('connect', ({ me }) => console.log('Connected as', me.id))

client.on('text', async (msg) => {
  console.log('Received:', msg.senderId, '|', msg.text)

  const quoted = await msg.replied()
  if (quoted) console.log('In reply to:', quoted.senderId, '|', quoted.text)

  await client.send(msg.senderId).text(`Halo ${msg.senderName ?? ''}! You said: ${msg.text}`)
})
