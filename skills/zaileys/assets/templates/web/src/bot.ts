import { Client } from 'zaileys'

const pairingNumber = process.env.WA_PAIRING_NUMBER

const client = new Client({
  sessionId: process.env.WA_SESSION_ID ?? 'default',
  ...(pairingNumber ? { authType: 'pairing' as const, phoneNumber: pairingNumber } : {}),
})

client.on('connect', ({ me }) => console.log(`Bot online as ${me.id}`))

// Without this listener a failed automatic connect prints nothing.
client.on('error', ({ error }) => console.error('zaileys error:', error.message))

client.on('disconnect', ({ reason, willReconnect }) => {
  if (!willReconnect) console.error(`Stopped reconnecting: ${reason}`)
})

client.on('text', async (msg) => {
  if (msg.text.trim().toLowerCase() !== 'ping') return
  try {
    await msg.reply('pong')
  } catch (error) {
    console.error('reply failed:', error)
  }
})

const shutdown = async () => {
  await client.disconnect()
  process.exit(0)
}
process.once('SIGINT', shutdown)
process.once('SIGTERM', shutdown)
