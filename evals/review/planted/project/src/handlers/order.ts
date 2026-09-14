import type { Client } from 'zaileys'
import { findOrder } from '../orders.js'

export function registerOrder(client: Client): void {
  client.on('text', async (msg) => {
    const match = msg.text.match(/^cek (\w+)$/i)
    if (!match) return
    const order = await findOrder(match[1]!)
    await client.send(msg.chatId).text(`Status pesanan ${order.id}: ${order.status}`)
  })
}
