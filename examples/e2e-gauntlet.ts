/**
 * End-to-end gauntlet: send every message type to one recipient and print a
 * pass/fail report. Useful for smoke-testing a build against a real account.
 *
 * Run: TO=628xxxx@s.whatsapp.net GAP_MS=1500 bun run examples/e2e-gauntlet.ts
 */
import type { WAMessageKey } from 'baileys'
import { Client } from '../src/index.js'

const TO = process.env['TO'] ?? ''
const GAP_MS = Number(process.env['GAP_MS'] ?? 1500)

if (!TO) {
  console.error('Set TO, e.g. TO=628xxxx@s.whatsapp.net bun run examples/e2e-gauntlet.ts')
  process.exit(1)
}

const PNG_1x1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
)
const WEBP_1x1 = Buffer.from('UklGRhIAAABXRUJQVlA4TAYAAAAvAAAAAAfQ//73v/+BiOh/AAA=', 'base64')
const DOC_BYTES = Buffer.from('Zaileys v4 E2E gauntlet — test document.\nIf you can open this, document send works.\n', 'utf8')

const VCARD = [
  'BEGIN:VCARD',
  'VERSION:3.0',
  'FN:Zaileys Bot',
  'TEL;type=CELL;type=VOICE;waid=6287833764462:+62 878-3376-4462',
  'END:VCARD',
].join('\n')

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

const fetchBuf = async (url: string): Promise<Buffer | null> => {
  try {
    const res = await fetch(url)
    if (!res.ok) return null
    return Buffer.from(await res.arrayBuffer())
  } catch {
    return null
  }
}

type Result = { feature: string; status: 'OK' | 'FAIL' | 'SKIP'; detail: string }
const results: Result[] = []

const client = new Client({ ignoreMe: true })

client.on('qr', ({ qrString }) => console.log('Scan QR:', qrString))

client.on('connect', async ({ me }) => {
  console.log(`Connected as ${me.id} — running E2E gauntlet against ${TO}\n`)

  const video = await fetchBuf('https://www.w3schools.com/html/mov_bbb.mp4')
  const audio = await fetchBuf('https://www.w3schools.com/html/horse.mp3')
  const realImage = (await fetchBuf('https://placehold.co/512x512/png')) ?? PNG_1x1
  const realSticker = (await fetchBuf('https://www.gstatic.com/webp/gallery/1.webp')) ?? WEBP_1x1

  let anchor: WAMessageKey | undefined

  const run = async (feature: string, fn: () => unknown, skip = false): Promise<void> => {
    if (skip) {
      results.push({ feature, status: 'SKIP', detail: 'asset unavailable' })
      console.log(`– ${feature} (asset unavailable)`)
      return
    }
    try {
      const key = (await (fn() as unknown as Promise<WAMessageKey | void>)) as WAMessageKey | undefined
      const id = key && typeof key === 'object' && 'id' in key ? String(key.id) : 'ok'
      results.push({ feature, status: 'OK', detail: id })
      console.log(`✓ ${feature} → ${id}`)
    } catch (e) {
      const detail = e instanceof Error ? e.message : String(e)
      results.push({ feature, status: 'FAIL', detail })
      console.log(`✗ ${feature} → ${detail}`)
    }
    await sleep(GAP_MS)
  }

  await run('text', async () => {
    anchor = await client.send(TO).text('zaileys e2e: text ✅')
    return anchor
  })
  await run('text + mentions', () => client.send(TO).text('zaileys e2e: mentions ✅').mentions([TO]))
  await run('reply (quote)', async () => {
    if (!anchor) throw new Error('no anchor')
    const full = await client.store.getMessage(anchor)
    return client.send(TO).text('zaileys e2e: reply ✅').reply(full ?? anchor)
  })
  await run('react 👍', () => (anchor ? client.react(anchor, '👍') : Promise.reject(new Error('no anchor'))))
  await run('image (real png)', () => client.send(TO).image(realImage, { caption: 'zaileys e2e: image ✅' }))
  await run('sticker (real webp)', () => client.send(TO).sticker(realSticker))
  await run('document (txt inline)', () => client.send(TO).document(DOC_BYTES, { fileName: 'zaileys-e2e.txt', mimetype: 'text/plain', caption: 'doc ✅' }))
  await run('video (fetched mp4)', () => client.send(TO).video(video as Buffer, { caption: 'zaileys e2e: video ✅' }), video === null)
  await run('gif (video gifPlayback)', () => client.send(TO).video(video as Buffer, { caption: 'gif ✅', gifPlayback: true }), video === null)
  await run('audio (fetched mp3)', () => client.send(TO).audio(audio as Buffer), audio === null)
  await run('voice note (ptt)', () => client.send(TO).audio(audio as Buffer, { ptt: true }), audio === null)
  await run('album (2 images)', () => client.send(TO).album([
    { type: 'image', src: realImage, caption: 'album 1' },
    { type: 'image', src: realImage, caption: 'album 2' },
  ]))
  await run('location', () => client.send(TO).location(-6.2, 106.816666, { name: 'Jakarta', address: 'Indonesia' }))
  await run('contact (vcard)', () => client.send(TO).contact(VCARD))
  await run('poll', () => client.send(TO).poll('zaileys e2e poll?', ['A', 'B', 'C'], { multipleChoice: false }))
  await run('buttons', () => client.send(TO).buttons([{ id: 'b1', text: 'Yes' }, { id: 'b2', text: 'No' }], { text: 'zaileys e2e: buttons', footer: 'pick one' }))
  await run('list', () => client.send(TO).list({
    title: 'zaileys e2e list', description: 'choose', buttonText: 'Open', footerText: 'footer',
    sections: [{ title: 'Section', rows: [{ id: 'r1', title: 'Row 1', description: 'first' }, { id: 'r2', title: 'Row 2' }] }],
  }))
  await run('forward', () => (anchor ? client.forward(anchor, TO) : Promise.reject(new Error('no anchor'))))
  await run('edit', async () => {
    if (!anchor) throw new Error('no anchor')
    await client.edit(anchor).text('zaileys e2e: text ✅ (edited)')
  })
  await run('delete (for everyone)', async () => {
    const k = await client.send(TO).text('zaileys e2e: this will be deleted')
    await sleep(800)
    await client.delete(k)
  })

  const ok = results.filter((r) => r.status === 'OK').length
  const fail = results.filter((r) => r.status === 'FAIL').length
  const skip = results.filter((r) => r.status === 'SKIP').length
  console.log('\n================ GAUNTLET REPORT ================')
  for (const r of results) console.log(`${r.status.padEnd(5)} ${r.feature.padEnd(26)} ${r.detail}`)
  console.log('-------------------------------------------------')
  console.log(`TOTAL ${results.length} | OK ${ok} | FAIL ${fail} | SKIP ${skip}`)
  console.log('=================================================\n')
})
