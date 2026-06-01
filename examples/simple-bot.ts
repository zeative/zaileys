import { Client } from '../src/index.js'

const client = new Client()

client.on('qr', ({ qrString }) => {
  console.log('Scan this QR to authenticate:', qrString)
})

client.on('connect', ({ me }) => {
  console.log('Connected as', me.id)
})

client.on('text', async (message) => {
  if (message.isFromMe) return

  await message.react('👀')

  if (message.text.trim().toLowerCase() === 'rich') {
    await message.reply(
      ['*Contoh rich reply* ✨', '', '```ts', 'const x = 1', '```', '', ':::suggest', 'Lagi | Tutup', ':::'].join('\n'),
      { rich: true, title: '🤖 zaileys' },
    )
    return
  }

  await message.reply(`Echo: ${message.text}`)
})

client.on('disconnect', ({ reason, willReconnect }) => {
  console.log('Disconnected:', reason, willReconnect ? '(reconnecting)' : '')
})
