import { Client } from 'zaileys'

const client = new Client({
  sessionId: 'toko.utama',
  commandPrefix: '!',
  plugins: { dir: './plugins' },
})

client.on('connect', () => console.log('bot online'))
