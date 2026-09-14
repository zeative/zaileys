export interface Order {
  id: string
  status: 'dibayar' | 'dikirim' | 'selesai'
}

export async function findOrder(id: string): Promise<Order> {
  const res = await fetch(`https://api.toko.example/orders/${encodeURIComponent(id)}`)
  if (!res.ok) throw new Error(`order ${id} not found`)
  return (await res.json()) as Order
}
