import { definePlugin } from '../../src/index.js'

export default definePlugin({
  name: 'greet',
  setup(ctx) {
    ctx.command('hello', async (c) => {
      await c.reply('hi there 👋')
    })
    ctx.on('text', (m) => ctx.logger?.info({ text: m.text }, 'greet saw text'))
    return () => ctx.logger?.info('greet unloaded')
  },
})
