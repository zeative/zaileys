import express from 'express'
import { Client } from 'zaileys'

const client = new Client({
  provider: 'cloud',
  cloud: {
    accessToken: process.env.WA_ACCESS_TOKEN!,
    phoneNumberId: process.env.WA_PHONE_NUMBER_ID!,
    verifyToken: process.env.WA_VERIFY_TOKEN!,
  },
})

client.on('text', async (msg) => {
  await msg.reply(`Halo! Pesan kamu: ${msg.text}`)
})

const webhook = client.webhook()
const app = express()

app.all('/webhook', express.raw({ type: '*/*' }), async (req, res) => {
  const url = `https://${req.get('host')}${req.originalUrl}`
  const headers = new Headers()
  for (const [key, value] of Object.entries(req.headers)) {
    if (typeof value === 'string') headers.set(key, value)
  }
  const body = req.method === 'POST' ? new Uint8Array(req.body as Buffer) : undefined
  const response = await webhook(new Request(url, { method: req.method, headers, body }))
  res.status(response.status).send(await response.text())
})

app.listen(3000)
