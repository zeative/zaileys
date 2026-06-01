import { Client } from '../src/index.js'

const TO = process.env['AIRICH_TO'] ?? ''
if (!TO) {
  console.error('Set AIRICH_TO, e.g. AIRICH_TO=628xxxx@s.whatsapp.net bun run examples/airich-bot.ts')
  process.exit(1)
}

const POSTER = 'https://placehold.co/600x800/png'
const SHOT = 'https://placehold.co/512x512/png'
const CLIP = 'https://test-videos.co.uk/vids/bigbuckbunny/mp4/h264/360/Big_Buck_Bunny_360_10s_1MB.mp4'

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

const client = new Client()

client.on('qr', ({ qrString }) => console.log('Scan QR:', qrString))

client.on('connect', async ({ me }) => {
  const bar = '═'.repeat(34)
  console.log(`\n${bar}\n  zaileys · AIRich showcase\n  ${me.id} → ${TO}\n${bar}\n`)

  let n = 0
  let ok = 0
  const send = async (label: string, fn: () => unknown): Promise<void> => {
    n++
    try {
      const key = (await (fn() as Promise<{ id?: string }>)) ?? {}
      ok++
      console.log(`  [${n}/4] ✓ ${label.padEnd(22)} → ${key.id ?? 'sent'}`)
    } catch (e) {
      console.log(`  [${n}/4] ✗ ${label.padEnd(22)} → ${e instanceof Error ? e.message : String(e)}`)
    }
    await sleep(1800)
  }

  const brief = [
    '*Tech Brief — Senin pagi* ☕',
    '',
    'Rangkuman harian dari [zaileys](https://github.com/zeative/zaileys).',
    'Sumber data dipantau otomatis. [](https://github.com/zeative/zaileys)',
    '',
    'Tiga sorotan utama hari ini, plus cuplikan kode untuk bikin bot interaktif.',
  ].join('\n')

  const code = [
    "import { Client } from 'zaileys'",
    '',
    'const client = new Client()',
    '',
    "client.on('message', async (msg) => {",
    '  await client.send(msg.senderId).buttons(',
    "    [{ id: 'yes', text: 'Ya' }, { id: 'no', text: 'Tidak' }],",
    "    { text: 'Lanjut order?' },",
    '  )',
    '})',
    '',
    "client.on('button-click', (ctx) => {",
    "  console.log('clicked:', ctx.buttonId)",
    '})',
  ].join('\n')

  const leaderboard = [
    ['Repo', 'Stars', 'Δ 24h'],
    ['zaileys', '12.4k', '+318'],
    ['baileys', '15.1k', '+92'],
    ['venom', '6.2k', '+11'],
  ]

  await send('briefing', () =>
    client.send(TO).aiRich(
      [
        { type: 'text', text: brief },
        { type: 'code', language: 'typescript', content: code },
        { type: 'table', rows: leaderboard },
      ],
      {
        title: '📰 zaileys Daily',
        footer: '💡 Dibuat dengan zaileys — github.com/zeative/zaileys',
        sources: [['https://avatars.githubusercontent.com/u/9919?s=64', 'https://github.com/zeative/zaileys', 'zaileys on GitHub']],
      },
    ),
  )

  await send('galeri', () =>
    client.send(TO).aiRich(
      [
        { type: 'text', text: '*Galeri rilis v4* — geser untuk lihat tangkapan layar & klip.' },
        { type: 'image', url: [POSTER, SHOT] },
        { type: 'video', url: CLIP, duration: 10 },
        { type: 'tip', text: 'Ketuk gambar untuk pratinjau penuh' },
        { type: 'suggest', prompts: ['Lihat changelog', 'Cara upgrade', 'Bandingkan v3 vs v4'] },
      ],
      { title: '🖼️ zaileys v4', footer: '#zaileys' },
    ),
  )

  await send('sosial', () =>
    client.send(TO).aiRich(
      [
        { type: 'text', text: 'Lagi ramai dibahas komunitas 👇' },
        {
          type: 'reels',
          reels: [
            { username: 'zeative', title: 'Demo nativeFlow buttons', url: CLIP, thumbnail: SHOT, views: 12400, likes: 980, verified: true },
            { username: 'zeative', title: 'AIRich rich response', url: CLIP, thumbnail: POSTER, views: 8800, likes: 740, verified: true },
          ],
        },
        {
          type: 'post',
          posts: [
            { username: 'zeative', title: 'zaileys v4 is out', caption: 'Buttons, carousel, AIRich — semua built-in.', thumbnail: SHOT, likes: 1500, comments: 132, verified: true, source: 'GITHUB' },
          ],
        },
        { type: 'suggest', prompts: ['Tonton lagi', 'Bagikan'] },
      ],
      { title: '🔥 Trending' },
    ),
  )

  await send('toko', () =>
    client.send(TO).aiRich(
      [
        { type: 'text', text: 'Merch komunitas zaileys 🛍️' },
        {
          type: 'product',
          products: [
            { title: 'Sticker Pack', price: 'Rp35.000', salePrice: 'Rp25.000', brand: 'zaileys', image: SHOT, url: 'https://github.com/zeative/zaileys' },
            { title: 'Hoodie Dev', price: 'Rp320.000', salePrice: 'Rp275.000', brand: 'zaileys', image: POSTER, url: 'https://github.com/zeative/zaileys' },
            { title: 'Mug Coder', price: 'Rp90.000', salePrice: 'Rp69.000', brand: 'zaileys', image: SHOT, url: 'https://github.com/zeative/zaileys' },
          ],
        },
        { type: 'suggest', prompts: ['Lihat semua produk', 'Checkout'] },
      ],
      { title: '🛍️ zaileys Store' },
    ),
  )

  console.log(`\n${bar}\n  selesai · ${ok}/${n} terkirim — cek WhatsApp kamu\n${bar}\n`)
})
