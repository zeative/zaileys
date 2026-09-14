import express from 'express'
import { Client } from 'zaileys'

const client = new Client({
  provider: 'cloud',
  cloud: {
    accessToken: process.env.WA_ACCESS_TOKEN!,
    phoneNumberId: process.env.WA_PHONE_NUMBER_ID!,
    verifyToken: process.env.WA_VERIFY_TOKEN!,
    appSecret: process.env.WA_APP_SECRET!,
  },
})

client.on('text', async (msg) => {
  await msg.reply(`Terima kasih, pesan kamu: ${msg.text}`)
})

const webhook = client.webhook()
const app = express()
app.use(express.json())

app.all('/webhook', async (req, res) => {
  const url = `${req.protocol}://${req.get('host')}${req.originalUrl}`
  const init: RequestInit = { method: req.method, headers: req.headers as Record<string, string> }
  if (req.method === 'POST') init.body = JSON.stringify(req.body)
  const response = await webhook(new Request(url, init))
  res.status(response.status).send(await response.text())
})

app.listen(3000, () => console.log('listening on :3000'))
