import { Client } from '../src/index.js'

const TO = process.env['BUTTONS_TO'] ?? ''
if (!TO) {
  console.error('Set BUTTONS_TO, e.g. BUTTONS_TO=628xxxx@s.whatsapp.net bun run examples/buttons-bot.ts')
  process.exit(1)
}

const client = new Client()
const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

client.on('qr', ({ qrString }) => console.log('Scan QR:', qrString))

client.on('connect', async ({ me }) => {
  console.log('Connected as', me.id, '\n=== sending button variants ->', TO, '===\n')

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

  console.log('\n[done] check your phone. Tap any button to test the click round-trip.\n')
})

client.on('button-click', (ctx) => {
  console.log('>>> button-click FIRED | id:', ctx.buttonId, '| text:', ctx.buttonText, '| from:', ctx.sender.jid)
})
