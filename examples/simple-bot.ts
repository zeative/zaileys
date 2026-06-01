/**
 * Owner-only echo bot: reacts, echoes text, and replies "rich" on demand.
 *
 * Run: OWNER=6285xxxx bun run examples/simple-bot.ts
 */
import { Client } from '../src/index.js'

const digitsOf = (jid: string): string => (jid.split(/[:@]/)[0] ?? '').replace(/\D/g, '')

const OWNER = digitsOf(process.env['OWNER'] ?? '')
if (!OWNER) {
  console.error('Set OWNER (your number), e.g. OWNER=6285xxxx bun run examples/simple-bot.ts')
  process.exit(1)
}

const client = new Client()

client.on('qr', ({ qrString }) => console.log('Scan QR:', qrString))
client.on('connect', ({ me }) => console.log('Connected as', me.id))

client.on('disconnect', ({ reason, willReconnect }) => {
  console.log('Disconnected:', reason, willReconnect ? '(reconnecting)' : '')
})

client.on('text', async (msg) => {
  if (digitsOf(msg.senderId) !== OWNER) return

  await msg.react('👀')

  if (msg.text.trim().toLowerCase() === 'rich') {
    await msg.reply(
      ['*Contoh rich reply* ✨', '', '```ts', 'const x = 1', '```', '', ':::suggest', 'Lagi | Tutup', ':::'].join('\n'),
      { rich: true, title: '🤖 zaileys' },
    )
    return
  }

  await msg.reply(`Echo: ${msg.text}`)
})
