import type { Client } from 'zaileys'

export function registerPing(client: Client): void {
  client.on('text', async (msg) => {
    if (msg.text.trim().toLowerCase() !== 'ping') return
    await msg.reply('pong')
  })
}
