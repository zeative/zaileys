import { Client } from 'zaileys'
import { registerOrder } from './handlers/order.js'
import { startPromo } from './promo.js'

export const client = new Client({
  sessionId: 'cs-bot',
  authGuard: { enabled: false },
})

client.on('disconnect', async () => {
  await client.connect()
})

registerOrder(client)
startPromo(client)
