import { Client } from 'zaileys'
import { registerOrder } from './handlers/order.js'
import { startPromo } from './promo.js'

export const client = new Client({ sessionId: 'cs-bot' })

client.on('error', ({ error }) => {
  console.error('zaileys error:', error.message)
})

client.on('disconnect', ({ reason, willReconnect }) => {
  if (!willReconnect) console.error(`stopped reconnecting: ${reason}`)
})

registerOrder(client)
startPromo(client)
