import { Client } from '../src/index.js'

const TO = process.env['AIRICH_TO'] ?? ''
if (!TO) {
  console.error('Set AIRICH_TO, e.g. AIRICH_TO=628xxxx@s.whatsapp.net bun run examples/airich-bot.ts')
  process.exit(1)
}

const client = new Client()

client.on('qr', ({ qrString }) => console.log('Scan QR:', qrString))

client.on('connect', async ({ me }) => {
  console.log('Connected as', me.id, '\n=== sending AIRich full demo ->', TO, '===\n')

  const intro = [
    '*AIRich v4.5 Full Demo*',
    '',
    'Ini hyperlink: [GitHub](https://github.com/zeative/zaileys)',
    'Ini citation: [](https://github.com/zeative/zaileys)',
    '',
    'Rich response: teks + link + sitasi, code block, dan tabel — semua dalam satu pesan.',
  ].join('\n')

  const code = [
    "import { Client } from 'zaileys'",
    '',
    "const bot = 'ZaileysBOT'",
    "console.log('Hello dari ' + bot)",
    '',
    'class Bot {',
    '  static async reply(text) {',
    '    return await sock.sendMessage(jid, { text })',
    '  }',
    '}',
  ].join('\n')

  const featureTable = [
    ['Fitur', 'Status', 'Versi'],
    ['Button', '✅ Ready', 'v4'],
    ['ButtonV2 (CTA)', '✅ Ready', 'v4'],
    ['Carousel', '✅ Ready', 'v4'],
    ['Header Media', '✅ Ready', 'v4'],
    ['AIRich', '🧪 Experimental', 'v4'],
    ['Hyperlink', '🆕 New', 'v4'],
    ['Citation', '🆕 New', 'v4'],
    ['Code Block', '🆕 New', 'v4'],
    ['Table', '🆕 New', 'v4'],
  ]

  try {
    const key = await client.send(TO).aiRich(
      [
        { type: 'text', text: intro },
        { type: 'code', language: 'javascript', content: code },
        { type: 'table', rows: featureTable },
      ],
      {
        title: '🤖 ZaileysBOT',
        footer: '💡 Powered by zaileys — github.com/zeative/zaileys',
        sources: [
          ['https://avatars.githubusercontent.com/u/9919?s=64', 'https://github.com/zeative/zaileys', 'Zaileys on GitHub'],
        ],
      },
    )
    console.log('OK aiRich sent:', key.id)
  } catch (e) {
    console.log('FAIL aiRich:', e instanceof Error ? e.message : String(e))
  }

  console.log('\n[done] check your phone — rich card: title + hyperlink/citation + JS code block + feature table.\n')
})
