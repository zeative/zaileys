/**
 * Official Meta Cloud API provider on hono — the handler speaks Web Request/Response natively.
 *
 * Run: WA_TOKEN=... WA_PHONE_ID=... WA_VERIFY=... WA_APP_SECRET=... bun run examples/cloud-hono.ts
 */
import { Hono } from 'hono'
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

wa.on('text', (m) => void m.reply(`echo: ${m.text}`))
wa.on('button-click', (p) => console.log('button', p.buttonId))

const handler = wa.webhook()
const app = new Hono()
app.all('/webhook', (c) => handler(c.req.raw))

export default app
