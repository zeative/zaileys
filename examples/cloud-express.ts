/**
 * Official Meta Cloud API provider behind an express webhook endpoint.
 *
 * Run: WA_TOKEN=... WA_PHONE_ID=... WA_VERIFY=... WA_APP_SECRET=... bun run examples/cloud-express.ts
 * Point your Meta app webhook to https://<host>/webhook (subscribe to `messages`).
 */
import express from 'express'
import { Client } from '../src/index.js'

const wa = new Client({
  provider: 'cloud',
  cloud: {
    accessToken: process.env['WA_TOKEN'] ?? '',
    phoneNumberId: process.env['WA_PHONE_ID'] ?? '',
    verifyToken: process.env['WA_VERIFY'] ?? '',
    appSecret: process.env['WA_APP_SECRET'] ?? '',
  },
})

wa.on('connect', ({ me }) => console.log('cloud connected as', me.id))
wa.on('text', (m) => {
  void wa.markRead(m.chatId, { typing: true })
  void m.reply(`echo: ${m.text}`)
})
wa.on('message-status', (s) => console.log('status', s.id, s.status))

const handler = wa.webhook()
const app = express()
/** express must NOT parse the body — the handler verifies the raw payload signature itself. */
app.all('/webhook', express.raw({ type: '*/*' }), async (req, res) => {
  const url = `${req.protocol}://${req.get('host')}${req.originalUrl}`
  const request = new Request(url, {
    method: req.method,
    headers: req.headers as Record<string, string>,
    ...(req.method === 'POST' ? { body: req.body as Buffer } : {}),
  })
  const response = await handler(request)
  res.status(response.status).send(await response.text())
})

app.listen(Number(process.env['PORT'] ?? 3000), () => console.log('webhook listening'))
