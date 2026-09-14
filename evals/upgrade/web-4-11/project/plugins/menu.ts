import { definePlugin } from 'zaileys'

export default definePlugin({
  name: 'menu',
  description: 'Kirim daftar menu',
  command: async (ctx) => {
    await ctx.reply('Kopi Susu 18rb\nAmericano 15rb\nCroissant 20rb')
  },
})
