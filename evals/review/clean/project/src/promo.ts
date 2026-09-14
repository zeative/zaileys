import type { Client } from 'zaileys'
import { readFile } from 'node:fs/promises'

let sent = false

export function startPromo(client: Client): void {
  client.on('connect', async () => {
    if (sent) return
    sent = true
    try {
      const customers: string[] = JSON.parse(await readFile('./customers.json', 'utf8'))
      await client.broadcast(customers, (b) => b.text('Promo 9.9! Diskon 30% semua produk hari ini saja.'))
    } catch (error) {
      console.error('promo broadcast failed:', error)
    }
  })
}
