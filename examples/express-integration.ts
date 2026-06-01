/**
 * Expose an HTTP gateway (POST /send, GET /health) backed by a WhatsApp client.
 *
 * Run: PORT=4252 bun run examples/express-integration.ts
 */
import express, { type Request, type Response } from 'express'
import { Client } from '../src/index.js'

const client = new Client()
let connected = false

client.on('qr', ({ qrString }) => console.log('Scan QR:', qrString))

client.on('connect', ({ me }) => {
  connected = true
  console.log('WhatsApp connected as', me.id)
})

client.on('disconnect', () => {
  connected = false
})

const app = express()
app.use(express.json())

interface SendBody {
  jid?: string
  text?: string
}

app.post('/send', async (req: Request, res: Response) => {
  if (!connected) {
    res.status(503).json({ error: 'whatsapp not connected' })
    return
  }
  const { jid, text } = req.body as SendBody
  if (!jid || !text) {
    res.status(400).json({ error: 'jid and text are required' })
    return
  }
  try {
    const key = await client.send(jid).text(text)
    res.json({ ok: true, id: key.id })
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : String(error) })
  }
})

app.get('/health', (_req: Request, res: Response) => {
  res.json({ connected })
})

const port = Number(process.env['PORT'] ?? 4252)
app.listen(port, () => {
  console.log(`HTTP send gateway listening on :${port}`)
})
