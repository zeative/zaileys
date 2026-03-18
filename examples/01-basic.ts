import { createBot } from '../src'

// Note: In real usage, you would pass a Baileys socket
const bot = createBot({} as any)

bot.on('message', async (ctx) => {
  if (ctx.content.text === 'ping') {
    await ctx.send('pong!')
  }
})

console.log('Bot is running with basic listener...')
