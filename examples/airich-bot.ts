/**
 * Owner-triggered AIRich showcase: reply ".za oii" to render briefing, gallery,
 * social, and store cards from plain markdown.
 *
 * Run: OWNER=6285xxxx bun run examples/airich-bot.ts
 */
import { Client } from '../src/index.js'

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))
const digitsOf = (jid: string): string => (jid.split(/[:@]/)[0] ?? '').replace(/\D/g, '')

const OWNER = digitsOf(process.env['OWNER'] ?? '')
if (!OWNER) {
  console.error('Set OWNER (your number), e.g. OWNER=6285xxxx bun run examples/airich-bot.ts')
  process.exit(1)
}

const TRIGGER = '.za oii'
const POSTER = 'https://placehold.co/600x800/png'
const SHOT = 'https://placehold.co/512x512/png'
const CLIP = 'https://test-videos.co.uk/vids/bigbuckbunny/mp4/h264/360/Big_Buck_Bunny_360_10s_1MB.mp4'

const client = new Client({ ignoreMe: false })

const showcase = async (target: string): Promise<void> => {
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

  const briefingMd = [
    '*Tech Brief — Senin pagi* ☕',
    '',
    'Rangkuman harian dari [zaileys](https://github.com/zeative/zaileys).',
    'Sumber data dipantau otomatis. [](https://github.com/zeative/zaileys)',
    '',
    'Rumus hari ini: [E = mc^2|160|44]<https://latex.codecogs.com/png.image?E%20%3D%20mc%5E2>',
    '',
    '```typescript',
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
    '```',
    '',
    '| Repo | Stars | Δ 24h |',
    '|---|---|---|',
    '| zaileys | 12.4k | +318 |',
    '| baileys | 15.1k | +92 |',
    '| venom | 6.2k | +11 |',
  ].join('\n')

  await send('briefing', () =>
    client.send(target).text(briefingMd, {
      rich: true,
      title: '📰 zaileys Daily',
      footer: '💡 Dibuat dengan zaileys — github.com/zeative/zaileys',
      sources: [['https://avatars.githubusercontent.com/u/9919?s=64', 'https://github.com/zeative/zaileys', 'zaileys on GitHub']],
    }),
  )

  const galeriMd = [
    '*Galeri rilis v4* — geser untuk lihat tangkapan layar & klip.',
    '',
    `![shot](${POSTER})`,
    `![shot](${SHOT})`,
    '',
    ':::video',
    `${CLIP} | 10`,
    ':::',
    '',
    ':::tip',
    'Ketuk gambar untuk pratinjau penuh',
    ':::',
    '',
    ':::suggest',
    'Lihat changelog | Cara upgrade | Bandingkan v3 vs v4',
    ':::',
  ].join('\n')

  await send('galeri', () => client.send(target).text(galeriMd, { rich: true, title: '🖼️ zaileys v4', footer: '#zaileys' }))

  const sosialMd = [
    'Lagi ramai dibahas komunitas 👇',
    '',
    ':::reels',
    `- user: zeative | title: Demo nativeFlow buttons | url: ${CLIP} | thumb: ${SHOT} | views: 12400 | likes: 980 | verified: true`,
    `- user: zeative | title: AIRich rich response | url: ${CLIP} | thumb: ${POSTER} | views: 8800 | likes: 740 | verified: true`,
    ':::',
    '',
    ':::post',
    `- user: zeative | title: zaileys v4 is out | caption: Buttons, carousel, AIRich — semua built-in. | thumb: ${SHOT} | likes: 1500 | comments: 132 | verified: true | source: GITHUB`,
    ':::',
    '',
    ':::suggest',
    'Tonton lagi | Bagikan',
    ':::',
  ].join('\n')

  await send('sosial', () => client.send(target).text(sosialMd, { rich: true, title: '🔥 Trending' }))

  const tokoMd = [
    'Merch komunitas zaileys 🛍️',
    '',
    ':::product',
    `- title: Sticker Pack | price: Rp35.000 | sale: Rp25.000 | brand: zaileys | image: ${SHOT} | url: https://github.com/zeative/zaileys`,
    `- title: Hoodie Dev | price: Rp320.000 | sale: Rp275.000 | brand: zaileys | image: ${POSTER} | url: https://github.com/zeative/zaileys`,
    `- title: Mug Coder | price: Rp90.000 | sale: Rp69.000 | brand: zaileys | image: ${SHOT} | url: https://github.com/zeative/zaileys`,
    ':::',
    '',
    ':::suggest',
    'Lihat semua produk | Checkout',
    ':::',
  ].join('\n')

  await send('toko', () => client.send(target).text(tokoMd, { rich: true, title: '🛍️ zaileys Store' }))

  console.log(`  └─ ${ok}/${n} terkirim`)
}

client.on('qr', ({ qrString }) => console.log('Scan QR:', qrString))

client.on('connect', ({ me }) => {
  const bar = '═'.repeat(40)
  console.log(`\n${bar}\n  zaileys · AIRich trigger bot\n  online as ${me.id}\n  kirim "${TRIGGER}" (private/grup) dari ${OWNER}\n${bar}\n`)
})

client.on('text', async (msg) => {
  if (digitsOf(msg.senderId) !== OWNER) return
  if (msg.text.trim().toLowerCase() !== TRIGGER) return

  const target = msg.roomId ?? msg.senderId
  console.log(`\n[trigger] "${TRIGGER}" dari ${msg.senderId} → ${target}`)
  await showcase(target)
  console.log('[trigger] selesai\n')
})
