import { Client } from '../src/index.js'

const TO = process.env['AIRICH_TO'] ?? ''
if (!TO) {
  console.error('Set AIRICH_TO, e.g. AIRICH_TO=628xxxx@s.whatsapp.net bun run examples/airich-bot.ts')
  process.exit(1)
}

const client = new Client()

client.on('qr', ({ qrString }) => console.log('Scan QR:', qrString))

client.on('connect', async ({ me }) => {
  console.log('Connected as', me.id, '\n=== sending AIRich (experimental) ->', TO, '===\n')
  try {
    const key = await client.send(TO).aiRich(
      [
        { type: 'text', text: 'Halo! Ini hyperlink: [GitHub](https://github.com/zeative/zaileys) dan citation [](https://zaileys.dev)' },
        { type: 'code', language: 'javascript', content: "import { Client } from 'zaileys'\nconst c = new Client()" },
        {
          type: 'table',
          rows: [
            ['Fitur', 'Status', 'Versi'],
            ['Button', '✅ Ready', 'v4'],
            ['Carousel', '✅ Ready', 'v4'],
            ['AIRich', '🧪 Experimental', 'v4'],
          ],
        },
      ],
      { title: '🤖 Zaileys AIRich', footer: '#Zaileys' },
    )
    console.log('OK aiRich sent:', key.id)
  } catch (e) {
    console.log('FAIL aiRich:', e instanceof Error ? e.message : String(e))
  }
  console.log('\n[done] check your phone — does the rich card (hyperlink + code + table) render?\n')
})
