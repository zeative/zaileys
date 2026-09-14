export interface Order {
  id: string
  customerJid: string
  status: 'dibayar' | 'dikirim' | 'selesai'
}

export async function findOrder(id: string): Promise<Order> {
  const res = await fetch(`https://api.toko.example/orders/${encodeURIComponent(id)}`, { signal: AbortSignal.timeout(5000) })
  if (!res.ok) throw new Error(`order ${id} not found`)
  return (await res.json()) as Order
}
