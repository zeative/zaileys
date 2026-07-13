/**
 * Official Meta Cloud API provider as a Next.js App Router route handler.
 *
 * Save as app/api/whatsapp/route.ts — GET serves the verification challenge, POST receives events.
 */
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

const handler = wa.webhook()

export const GET = handler
export const POST = handler
