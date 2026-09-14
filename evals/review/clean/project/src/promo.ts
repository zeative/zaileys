import type { Client } from 'zaileys'
import { readFile, writeFile } from 'node:fs/promises'

const SENT_MARKER = './data/promo-9-9.sent'

// Customers in customers.json opted in to promotions at checkout.
export function startPromo(client: Client): void {
  client.on('connect', async () => {
    try {
      const alreadySent = await readFile(SENT_MARKER, 'utf8').then(() => true, () => false)
      if (alreadySent) return
      await writeFile(SENT_MARKER, new Date().toISOString())
      const customers: string[] = JSON.parse(await readFile('./customers.json', 'utf8'))
      const result = await client.broadcast(customers, (b) => b.text('Promo 9.9! Diskon 30% semua produk hari ini saja.'), { rateLimitPerSec: 1 })
      console.log(`promo sent to ${result.sent.length}, failed ${result.failed.length}`)
    } catch (error) {
      console.error('promo broadcast failed:', error)
    }
  })
}
