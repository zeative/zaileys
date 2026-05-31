import { Client } from '../src/index.js'

const primary = new Client({ sessionId: 'account-a' })
const secondary = new Client({ sessionId: 'account-b' })

primary.on('connect', ({ me }) => console.log('[account-a] connected as', me.id))
secondary.on('connect', ({ me }) => console.log('[account-b] connected as', me.id))

primary.on('text', async (message) => {
  if (message.isFromMe) return
  await primary.send(message.senderId).text('Reply from account A')
})

secondary.on('text', async (message) => {
  if (message.isFromMe) return
  await secondary.send(message.senderId).text('Reply from account B')
})

process.on('SIGINT', async () => {
  await Promise.all([primary.disconnect(), secondary.disconnect()])
  process.exit(0)
})
