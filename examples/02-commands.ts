import { createBot, guards } from '../src'

const bot = createBot({} as any)

// Define a simple command with prefix
bot.command('hi', (ctx) => {
  return ctx.send(`Hello ${ctx.sender.pushName}!`)
})

// Command with metadata and owner guard
bot.command({
  name: 'eval',
  description: 'Evaluate code (Owner only)',
  category: 'admin',
  guards: [guards.owner()]
}, async (ctx) => {
  const code = ctx.content.text.split(' ').slice(1).join(' ')
  try {
    const result = eval(code)
    await ctx.send(`Result: ${result}`)
  } catch (err: any) {
    await ctx.send(`Error: ${err.message}`)
  }
})

console.log('Bot is running with commands...')
