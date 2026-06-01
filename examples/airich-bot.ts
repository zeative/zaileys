import { Client } from '../src/index.js'

const TO = process.env['AIRICH_TO'] ?? ''
if (!TO) {
  console.error('Set AIRICH_TO, e.g. AIRICH_TO=628xxxx@s.whatsapp.net bun run examples/airich-bot.ts')
  process.exit(1)
}

const IMG = 'https://placehold.co/512x512/png'
const VIDEO = 'https://test-videos.co.uk/vids/bigbuckbunny/mp4/h264/360/Big_Buck_Bunny_360_10s_1MB.mp4'

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

const client = new Client()

client.on('qr', ({ qrString }) => console.log('Scan QR:', qrString))

client.on('connect', async ({ me }) => {
  console.log('\n┌─ zaileys · AIRich demo')
  console.log('├─ from :', me.id)
  console.log('└─ to   :', TO, '\n')

  let step = 0
  let ok = 0
  const send = async (label: string, fn: () => unknown): Promise<void> => {
    step++
    try {
      const key = (await (fn() as Promise<{ id?: string }>)) ?? {}
      ok++
      console.log(`  ${String(step).padStart(2, '0')}. ✓ ${label.padEnd(28)} ${key.id ?? 'sent'}`)
    } catch (e) {
      console.log(`  ${String(step).padStart(2, '0')}. ✗ ${label.padEnd(28)} ${e instanceof Error ? e.message : String(e)}`)
    }
    await sleep(1800)
  }

  const intro = [
    '*AIRich — rich response dalam satu pesan*',
    '',
    'Repo: [GitHub](https://github.com/zeative/zaileys)',
    'Docs: [](https://github.com/zeative/zaileys)',
    '',
    'Teks + hyperlink + sitasi, code block ber-syntax, dan tabel — semua menyatu.',
  ].join('\n')

  const code = [
    "import { Client } from 'zaileys'",
    '',
    'const client = new Client()',
    '',
    "client.on('connect', ({ me }) => {",
    "  console.log('Connected as', me.id)",
    '})',
    '',
    "client.on('text', async (msg) => {",
    '  await client.send(msg.senderId).text(`Halo ${msg.senderName}!`)',
    '})',
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

  await send('text + code + table', () =>
    client.send(TO).aiRich(
      [
        { type: 'text', text: intro },
        { type: 'code', language: 'typescript', content: code },
        { type: 'table', rows: featureTable },
      ],
      {
        title: '🐙 zaileys Bot',
        footer: '💡 Powered by zaileys — github.com/zeative/zaileys',
        sources: [['https://avatars.githubusercontent.com/u/9919?s=64', 'https://github.com/zeative/zaileys', 'zaileys on GitHub']],
      },
    ),
  )

  await send('image + video + suggest', () =>
    client.send(TO).aiRich(
      [
        { type: 'text', text: '*Lihat perincian* — kartu image & video dalam satu rich response.' },
        { type: 'image', url: IMG },
        { type: 'video', url: VIDEO, duration: 10 },
        { type: 'tip', text: 'Gunakan zaileys <mode> untuk tes fitur spesifik' },
        { type: 'suggest', prompts: ['zaileys buttons', 'zaileys carousel', 'zaileys product', 'zaileys post'] },
      ],
      { title: '🐙 zaileys Bot', footer: '#zaileys' },
    ),
  )

  await send('product carousel', () =>
    client.send(TO).aiRich(
      [
        { type: 'text', text: 'Menu hari ini 👇' },
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

  console.log(`\n└─ done · ${ok}/${step} terkirim — cek WhatsApp kamu.\n`)
})
