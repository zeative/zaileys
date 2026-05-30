import { Client } from '../src/index.js'

const client = new Client()

client.on('qr', ({ qrString }) => {
  console.log('Scan this QR to authenticate:', qrString)
})

client.on('connect', ({ me }) => {
  console.log('Connected as', me.id)
})

client.on('text', async (message) => {
  if (message.fromMe) return
  await client.send(message.jid).text(`Echo: ${message.content}`)
})

client.on('disconnect', ({ reason, willReconnect }) => {
  console.log('Disconnected:', reason, willReconnect ? '(reconnecting)' : '')
})
