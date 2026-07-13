/**
 * Live Cloud API smoke — sends real messages, maintainer-only, never in CI.
 *
 * Run: WHATSAPP_ACCESS_TOKEN=... WHATSAPP_PHONE_NUMBER_ID=... WHATSAPP_TEST_NUMBER=... pnpm tsx scripts/smoke-cloud.mts
 */
import { Client } from '../src/index.js'

const token = process.env['WHATSAPP_ACCESS_TOKEN']
const phoneNumberId = process.env['WHATSAPP_PHONE_NUMBER_ID']
const to = process.env['WHATSAPP_TEST_NUMBER']

if (!token || !phoneNumberId || !to) {
  console.error('smoke-cloud: set WHATSAPP_ACCESS_TOKEN, WHATSAPP_PHONE_NUMBER_ID, WHATSAPP_TEST_NUMBER')
  process.exit(1)
}

const wa = new Client({
  provider: 'cloud',
  cloud: { accessToken: token, phoneNumberId },
  autoConnect: false,
  statusLog: false,
})

await wa.connect()
console.log('connected')

const text = await wa.send(to).text('zaileys cloud smoke ✅')
console.log('text:', text.id)

const react = await wa.react(text, '🔥')
console.log('react:', react.id)

const buttons = await wa
  .send(to)
  .buttons([{ text: 'Oke', id: 'ok' }], { text: 'smoke buttons', footer: 'zaileys' })
console.log('buttons:', buttons.id)

await wa.disconnect()
console.log('done')
