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

  const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))
  const IMG = 'https://placehold.co/512x512/png'

  const send = async (label: string, fn: () => unknown): Promise<void> => {
    try {
      const key = (await (fn() as Promise<{ id?: string }>)) ?? {}
      console.log('OK   ', label, '|', key.id ?? 'sent')
    } catch (e) {
      console.log('FAIL ', label, '->', e instanceof Error ? e.message : String(e))
    }
    await sleep(1800)
  }

  await send('rich (text + code + table)', () =>
    client.send(TO).aiRich(
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
    ),
  )

  await send('media + suggest (image + video + tip + chips)', () =>
    client.send(TO).aiRich(
      [
        { type: 'text', text: '*Lihat perincian* — image & video card di dalam satu rich response.' },
        { type: 'image', url: IMG },
        { type: 'video', url: 'https://test-videos.co.uk/vids/bigbuckbunny/mp4/h264/360/Big_Buck_Bunny_360_10s_1MB.mp4', duration: 10 },
        { type: 'tip', text: 'Gunakan zaileys <mode> untuk tes fitur spesifik' },
        { type: 'suggest', prompts: ['zaileys buttons', 'zaileys carousel', 'zaileys product', 'zaileys post'] },
      ],
      { title: '🐙 zaileys Bot', footer: '#zaileys' },
    ),
  )

  await send('product carousel (2 cards)', () =>
    client.send(TO).aiRich(
      [
        { type: 'text', text: 'Test Product' },
        {
          type: 'product',
          products: [
            { title: 'Pizza Mozzarella', price: '$7', salePrice: '$6', brand: 'zaileys', image: IMG, url: 'https://github.com/zeative/zaileys' },
            { title: 'Ramen Kaldu', price: '$6', salePrice: '$5', brand: 'zaileys', image: IMG, url: 'https://github.com/zeative/zaileys' },
          ],
        },
        { type: 'suggest', prompts: ['Lihat semua produk', 'Pesan sekarang'] },
      ],
      { title: '🛍️ Product Carousel' },
    ),
  )

  console.log('\n[done] check your phone — rich text/code/table, media+suggest card, and a product carousel.\n')
})
