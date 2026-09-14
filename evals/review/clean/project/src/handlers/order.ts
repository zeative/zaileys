import type { Client } from 'zaileys'
import { findOrder } from '../orders.js'

export function registerOrder(client: Client): void {
  client.on('text', async (msg) => {
    const match = msg.text.match(/^cek (\w+)$/i)
    if (!match) return
    try {
      const order = await findOrder(match[1]!)
      await msg.reply(`Status pesanan ${order.id}: ${order.status}`)
    } catch (error) {
      console.error('cek order failed:', error)
      await msg.reply('Maaf, pesanan tidak ditemukan.').catch(() => {})
    }
  })
}
