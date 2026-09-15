/**
 * HTML app card: reply ".card" to get a live counter that runs inside the bubble on WhatsApp Android.
 * Other devices get a plain-text answer instead.
 *
 * Run: OWNER=6285xxxx bun run examples/html-app.ts
 */
import { Client, html, htmlJson } from '../src/index.js'

const digitsOf = (jid: string): string => (jid.split(/[:@]/)[0] ?? '').replace(/\D/g, '')

const OWNER = digitsOf(process.env['OWNER'] ?? '')
if (!OWNER) {
  console.error('Set OWNER (your number), e.g. OWNER=6285xxxx bun run examples/html-app.ts')
  process.exit(1)
}

const client = new Client({ ignoreMe: false })

const counterPage = (name: string, start: number) => html`
  <style>
    html, body { margin: 0; background: #0f1a15; color: #e3ece7; font: 15px system-ui, sans-serif }
    main { height: 180px; display: grid; place-items: center; align-content: center; gap: 12px }
    output { font: 700 48px ui-monospace, monospace }
    .row { display: flex; gap: 10px }
    button { width: 64px; height: 44px; border: 0; border-radius: 12px; font: 700 22px system-ui }
    button { background: #3fc49a; color: #0f1a15 }
  </style>
  <main>
    <div>Hi ${name}</div>
    <output id="count"></output>
    <div class="row"><button id="down">−</button><button id="up">+</button></div>
  </main>
  <script>
    const state = ${htmlJson({ count: start })}
    const out = document.getElementById('count')
    const render = () => { out.textContent = String(state.count) }
    document.getElementById('up').onclick = () => { state.count++; render() }
    document.getElementById('down').onclick = () => { state.count--; render() }
    render()
  </script>
`

client.on('connect', ({ me }) => console.log('Connected as', me.id))

client.on('text', async (msg) => {
  if (digitsOf(msg.senderId) !== OWNER || msg.text.trim().toLowerCase() !== '.card') return

  const page = counterPage(msg.senderName ?? 'there', 0)
  await client.send(msg.roomId ?? msg.senderId).htmlApp(page, {
    title: 'Counter',
    height: 180,
    device: msg.senderDevice,
    fallback: 'The counter card only opens on WhatsApp Android.',
  })
})
