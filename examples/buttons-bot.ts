import { Client } from '../src/index.js'

const TO = process.env['BUTTONS_TO'] ?? ''
if (!TO) {
  console.error('Set BUTTONS_TO, e.g. BUTTONS_TO=628xxxx@s.whatsapp.net bun run examples/buttons-bot.ts')
  process.exit(1)
}

const client = new Client()
const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

client.on('qr', ({ qrString }) => console.log('Scan QR:', qrString))

const fetchBuf = async (url: string): Promise<Buffer | undefined> => {
  try {
    const res = await fetch(url)
    return res.ok ? Buffer.from(await res.arrayBuffer()) : undefined
  } catch {
    return undefined
  }
}

client.on('connect', async ({ me }) => {
  console.log('Connected as', me.id, '\n=== sending button variants ->', TO, '===\n')
  const headerImage = await fetchBuf('https://placehold.co/512x512/png')

  const send = async (label: string, fn: () => unknown): Promise<void> => {
    try {
      const key = (await (fn() as Promise<{ id?: string }>)) ?? {}
      console.log('OK   ', label, '|', key.id ?? 'sent')
    } catch (e) {
      console.log('FAIL ', label, '->', e instanceof Error ? e.message : String(e))
    }
    await sleep(1800)
  }

  await send('buttons x2 (Yes/No)', () =>
    client.send(TO).buttons([{ id: 'yes', text: 'Yes' }, { id: 'no', text: 'No' }], {
      text: 'zaileys buttons: pick one',
      footer: 'tap a button',
    }),
  )
  await send('buttons x3 (Alpha/Beta/Gamma)', () =>
    client.send(TO).buttons(
      [
        { id: 'a', text: 'Alpha' },
        { id: 'b', text: 'Beta' },
        { id: 'c', text: 'Gamma' },
      ],
      { text: 'zaileys buttons: three options' },
    ),
  )
  await send('buttons x1 (single)', () =>
    client.send(TO).buttons([{ id: 'ok', text: 'OK' }], { text: 'zaileys buttons: single' }),
  )
  await send('template (header/body/footer + 2 buttons)', () =>
    client.send(TO).template({
      header: 'Zaileys',
      body: 'zaileys template message body',
      footer: 'template footer',
      buttons: [
        { id: 't1', text: 'Action 1' },
        { id: 't2', text: 'Action 2' },
      ],
    }),
  )
  await send('header (title + subtitle) + reply buttons', () =>
    client.send(TO).buttons([{ id: 'go', text: 'Go' }, { id: 'skip', text: 'Skip' }], {
      title: '💡 Tip & Suggest',
      subtitle: 'header subtitle line',
      text: 'body text under the header',
      footer: 'footer',
    }),
  )
  await send('CTA: url + copy + call', () =>
    client.send(TO).buttons(
      [
        { type: 'url', text: 'Open GitHub', url: 'https://github.com/zeative/zaileys', webview: true },
        { type: 'copy', text: 'Copy code', code: 'ZAILEYS-2026' },
        { type: 'call', text: 'Call us', phone: '6287833764462' },
      ],
      { text: 'zaileys CTA buttons: link / copy / call', footer: 'tap any' },
    ),
  )
  await send('mixed: reply + url + copy', () =>
    client.send(TO).buttons(
      [
        { id: 'yes', text: 'Yes' },
        { type: 'url', text: 'Docs', url: 'https://github.com/zeative/zaileys' },
        { type: 'copy', text: 'Copy ID', code: 'ABC123' },
      ],
      { title: 'Mixed buttons', text: 'reply + url + copy in one message' },
    ),
  )

  await send('reminder + cancel-reminder', () =>
    client.send(TO).buttons(
      [
        { type: 'reminder', text: 'Ingatkan saya', id: 'remind_1' },
        { type: 'cancel-reminder', text: 'Batalkan' },
      ],
      { title: '⏰ Reminder', text: 'Set / batalkan pengingat WhatsApp' },
    ),
  )
  await send('location + address request', () =>
    client.send(TO).buttons(
      [
        { type: 'location', text: 'Kirim lokasi' },
        { type: 'address', text: 'Isi alamat', id: 'addr_1' },
      ],
      { title: '📍 Checkout', text: 'Bagikan lokasi atau alamat pengiriman' },
    ),
  )
  await send('bottomSheet (overflow → sheet)', () =>
    client.send(TO).buttons(
      [
        { id: 's1', text: 'Opsi 1' },
        { id: 's2', text: 'Opsi 2' },
        { id: 's3', text: 'Opsi 3' },
        { id: 's4', text: 'Opsi 4' },
        { id: 's5', text: 'Opsi 5' },
      ],
      { text: 'Banyak opsi — dikelompokkan jadi bottom sheet', bottomSheet: { listTitle: 'Semua opsi', buttonTitle: 'Lihat 5 opsi', buttonsLimit: 2 } },
    ),
  )
  await send('limitedTimeOffer (countdown CTA)', () =>
    client.send(TO).buttons(
      [{ type: 'url', text: 'Ambil promo', url: 'https://github.com/zeative/zaileys' }, { type: 'copy', text: 'Salin kode', code: 'FLASH50' }],
      {
        title: '⚡ Flash Sale',
        text: 'Diskon 50% — berakhir sebentar lagi!',
        limitedTimeOffer: { text: 'Promo berakhir dalam', copyCode: 'FLASH50', expiresAt: Math.floor(Date.now() / 1000) + 3600 },
      },
    ),
  )
  await send('list (single_select)', () =>
    client.send(TO).list({
      title: '🍔 Menu',
      description: 'Pilih pesananmu',
      buttonText: 'Lihat menu',
      footerText: 'zaileys',
      sections: [
        { title: 'Makanan', rows: [{ id: 'pizza', title: 'Pizza', description: '$6' }, { id: 'ramen', title: 'Ramen', description: '$5' }] },
        { title: 'Minuman', rows: [{ id: 'coffee', title: 'Kopi', description: '$2' }, { id: 'tea', title: 'Teh', description: '$1' }] },
      ],
    }),
  )

  if (headerImage) {
    await send('IMAGE header + reply buttons', () =>
      client.send(TO).buttons([{ id: 'ok', text: 'OK' }, { id: 'no', text: 'No' }], {
        image: headerImage,
        title: '🖼️ Image header',
        text: 'interactive message with an image header',
        footer: 'zaileys',
      }),
    )
    await send('carousel (2 product cards)', () =>
      client.send(TO).carousel(
        [
          {
            title: 'Pizza Mozzarella',
            body: '$6',
            footer: 'zaileys',
            image: headerImage,
            buttons: [{ id: 'buy_pizza', text: 'Order' }, { type: 'url', text: 'Detail', url: 'https://github.com/zeative/zaileys' }],
          },
          {
            title: 'Ramen Kaldu',
            body: '$5',
            footer: 'zaileys',
            image: headerImage,
            buttons: [{ id: 'buy_ramen', text: 'Order' }, { type: 'copy', text: 'Promo', code: 'RAMEN5' }],
          },
        ],
        { text: '🛍️ Product Carousel' },
      ),
    )
  }

  console.log('\n[done] check your phone. Tap any button to test the click round-trip.\n')
})

client.on('button-click', (ctx) => {
  console.log('>>> button-click FIRED | id:', ctx.buttonId, '| text:', ctx.buttonText, '| from:', ctx.sender.jid)
})

client.on('list-select', (ctx) => {
  console.log('>>> list-select FIRED | rowId:', ctx.rowId, '| title:', ctx.title, '| from:', ctx.sender.jid)
})
