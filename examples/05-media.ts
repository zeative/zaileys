import { createBot } from '../src'

const bot = createBot({} as any)

bot.command('image', async (ctx) => {
  // Send a simple image from URL
  await ctx.send({
    image: { url: 'https://placehold.co/600x400' },
    caption: 'Behold, an image!'
  })
})

bot.command('video', async (ctx) => {
  // Send a video with extra options
  await ctx.send({
    video: { url: 'https://www.w3schools.com/html/mov_bbb.mp4' },
    caption: 'Big Buck Bunny',
    gifPlayback: true
  })
})

console.log('Media example initialized.')
