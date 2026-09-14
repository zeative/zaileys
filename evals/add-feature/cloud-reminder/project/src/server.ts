import express from 'express'
import { client } from './client.js'

client.on('text', async (msg) => {
  try {
    await msg.reply('Terima kasih, admin klinik akan membalas pesan kamu.')
  } catch (error) {
    console.error('auto reply failed:', error)
  }
})

const webhook = client.webhook()
const app = express()

app.all('/webhook', express.raw({ type: '*/*' }), async (req, res) => {
  const headers = new Headers()
  for (const [key, value] of Object.entries(req.headers)) {
    if (typeof value === 'string') headers.set(key, value)
  }
  const body = req.method === 'POST' ? new Uint8Array(req.body as Buffer) : undefined
  const response = await webhook(new Request(`https://${req.get('host')}${req.originalUrl}`, { method: req.method, headers, body }))
  res.status(response.status).send(await response.text())
})

app.listen(3000)
