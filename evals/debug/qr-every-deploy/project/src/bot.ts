import { Client } from 'zaileys'

const client = new Client({ sessionId: 'toko' })

client.on('text', async (msg) => {
  if (msg.text === 'ping') await msg.reply('pong')
})
