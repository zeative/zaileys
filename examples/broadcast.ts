/**
 * Broadcast one message to many recipients with rate limiting and progress.
 *
 * Run: bun run examples/broadcast.ts
 */
import { Client } from '../src/index.js'

const client = new Client()

client.on('qr', ({ qrString }) => console.log('Scan QR:', qrString))

const recipients = [
  '6281111111111@s.whatsapp.net',
  '6282222222222@s.whatsapp.net',
  '6283333333333@s.whatsapp.net',
]

client.on('connect', async ({ me }) => {
  console.log('Broadcasting from', me.id)

  const result = await client.broadcast(
    recipients,
    (builder) => builder.text('Announcement: scheduled maintenance tonight at 22:00.'),
    {
      rateLimitPerSec: 5,
      onProgress: (done, total, jid, ok) => {
        console.log(`[${done}/${total}] ${jid} ${ok ? 'sent' : 'failed'}`)
      },
    },
  )

  console.log(`Done. Sent ${result.sent.length}, failed ${result.failed.length}`)
})
