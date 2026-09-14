import type { Client } from 'zaileys'

export function registerMenu(client: Client): void {
  client.command({ name: 'menu', description: 'Daftar menu' }, async (ctx) => {
    await ctx.reply('Kopi Susu 18rb\nAmericano 15rb\nCroissant 20rb')
  })
}
