import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import { Client } from 'zaileys'

const required = (name: string): string => {
  const value = process.env[name]
  if (!value) throw new Error(`Missing environment variable ${name} (see .env.example)`)
  return value
}

const client = new Client({
  provider: 'cloud',
  cloud: {
    accessToken: required('WA_TOKEN'),
    phoneNumberId: required('WA_PHONE_ID'),
    verifyToken: required('WA_VERIFY_TOKEN'),
    appSecret: required('WA_APP_SECRET'),
  },
})

client.on('connect', () => console.log('Meta accepted the access token'))
client.on('error', ({ error }) => console.error('zaileys error:', error.message))

client.on('text', async (msg) => {
  try {
    await msg.reply(`You said: ${msg.text}`)
  } catch (error) {
    console.error('reply failed:', error)
  }
})

client.on('message-status', (status) => {
  if (status.status === 'failed') console.error('delivery failed:', status.error)
})

const webhook = client.webhook()
const app = new Hono()
// c.req.raw is the untouched Web Request, so the signature is checked against the exact bytes Meta sent.
app.all('/webhook', (c) => webhook(c.req.raw))
app.get('/health', (c) => c.text('ok'))

const port = Number(process.env.PORT ?? 3000)
serve({ fetch: app.fetch, port }, () => console.log(`Webhook listening on http://localhost:${port}/webhook`))
