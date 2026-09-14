import type { Client } from 'zaileys'
import { readFile } from 'node:fs/promises'

export function startPromo(client: Client): void {
  client.on('connect', async () => {
    const customers: string[] = JSON.parse(await readFile('./customers.json', 'utf8'))
    for (const jid of customers) {
      await client.send(jid).text('Promo 9.9! Diskon 30% semua produk hari ini saja.')
    }
  })
}
