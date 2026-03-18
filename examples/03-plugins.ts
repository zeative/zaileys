import { definePlugin, createBot } from '../src'

// 1. Define a reusable plugin
const myPlugin = definePlugin((bot) => {
  bot.on('message', (ctx) => {
    console.log(`[Message] From: ${ctx.sender.id}, Content: ${ctx.content.text}`)
  })
})

// 2. Use it in a bot
const bot = createBot({} as any)
bot.use(myPlugin)

console.log('Plugin example initialized.')
