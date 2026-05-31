import { Client } from '../src/index.js'

const client = new Client({

})

client.on('qr', ({ qrString }) => console.log('Scan QR:', qrString))
client.on('connect', ({ me }) => console.log('Connected as', me.id))
client.on('text', async (msg) => {
  if (msg.senderLid != "6285136635787@s.whatsapp.net") return;
  console.log('Received message:', msg)
  await client.send(msg.senderId).text('Halo!')
})
