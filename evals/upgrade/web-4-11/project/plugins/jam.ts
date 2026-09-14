import { definePlugin } from 'zaileys'

export default definePlugin({
  name: 'jam',
  description: 'Jam buka toko',
  command: async (ctx) => {
    await ctx.reply('Buka setiap hari 08.00–22.00')
  },
})
