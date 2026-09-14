import type { Client } from 'zaileys'
import { findOrder } from '../orders.js'

export function registerOrder(client: Client): void {
  client.on('text', async (msg) => {
    // Order status is private: answer only in one-to-one chats, and only to the customer who placed the order.
    if (msg.roomId?.endsWith('@g.us')) return
    const match = msg.text.match(/^cek (\w+)$/i)
    if (!match) return
    try {
      const order = await findOrder(match[1]!)
      if (order.customerJid !== msg.senderId) {
        await msg.reply('Pesanan tidak ditemukan.')
        return
      }
      await msg.reply(`Status pesanan ${order.id}: ${order.status}`)
    } catch (error) {
      console.error('cek order failed:', error)
      await msg.reply('Maaf, pesanan tidak ditemukan.').catch(() => {})
    }
  })
}
