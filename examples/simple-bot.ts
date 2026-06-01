import { Client } from '../src/index.js'

const OWNER = (process.env['OWNER'] ?? '').replace(/\D/g, '')
if (!OWNER) {
  console.error('Set OWNER (nomor kamu), e.g. OWNER=6285xxxx bun run examples/simple-bot.ts')
  process.exit(1)
}
const digitsOf = (jid: string): string => (jid.split(/[:@]/)[0] ?? '').replace(/\D/g, '')

const client = new Client()

client.on('qr', ({ qrString }) => {
  console.log('Scan this QR to authenticate:', qrString)
})

client.on('connect', ({ me }) => {
  console.log('Connected as', me.id)
})

client.on('text', async (message) => {
  if (digitsOf(message.senderId) !== OWNER) return

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
