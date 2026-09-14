import { Client } from 'zaileys'

const client = new Client({ sessionId: 'stiker' })

client.on('video', async (msg) => {
  if (msg.media?.type !== 'video') return
  try {
    const video = await msg.media.buffer()
    await msg.reply(msg.text || 'Stiker kamu:')
    await client.send(msg.roomId ?? msg.senderId).sticker(video)
  } catch (error) {
    console.error('sticker failed:', error)
  }
})
