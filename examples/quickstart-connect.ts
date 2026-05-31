import { Client } from '../src/index.js'

const client = new Client()

client.on('qr', ({ qrString }) => console.log('Scan QR:', qrString))
client.on('connect', ({ me }) => console.log('Connected as', me.id))

client.on('text', async (msg) => {
  console.log('Received message:', msg.senderId, '|', msg.text)

  if (msg.isFromMe) return

  const quoted = await msg.replied()
  if (quoted) console.log('In reply to:', quoted.senderId, '|', quoted.text)

  await client.send(msg.senderId).text(`Halo ${msg.senderName ?? ''}! You said: ${msg.text}`)
})
