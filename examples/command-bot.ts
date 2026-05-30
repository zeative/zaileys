import { Client, type Middleware } from '../src/index.js'

const client = new Client({ commandPrefix: ['/', '!'] })

const loggingMiddleware: Middleware = async (ctx, next) => {
  console.log(`[command] ${ctx.command} from ${ctx.sender.jid} args=${ctx.args.join(',')}`)
  await next()
}

client.use(loggingMiddleware)

client.command('ping', async (ctx) => {
  await ctx.reply('pong')
})

client.command('help|h|?', async (ctx) => {
  await ctx.reply('Commands: /ping, /weather <city>, /help')
})

client.command('weather', async (ctx) => {
  const city = ctx.args[0]
  if (!city) {
    await ctx.reply('Usage: /weather <city>')
    return
  }
  await ctx.reply(`Weather in ${city}: sunny, 28 degrees`)
})

client.on('connect', ({ me }) => {
  console.log('Command bot ready as', me.id)
})
