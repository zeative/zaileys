import { client } from './bot.js'

export interface Order {
  id: string
  phone: string
  customerName: string
  trackingNumber: string
}

// Called by the warehouse job when a parcel leaves, usually 2–3 days after checkout.
export async function notifyShipped(order: Order): Promise<void> {
  await client
    .send(order.phone)
    .text(`Halo ${order.customerName}, pesanan ${order.id} sudah dikirim. Resi: ${order.trackingNumber}`)
}
