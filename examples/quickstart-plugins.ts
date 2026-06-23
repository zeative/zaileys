import { Client } from '../src/index.js'

const client = new Client({
  sessionId: 'plugins-demo',
  commandPrefix: '!',
  plugins: { dir: './examples/plugins', watch: true },
  autoDelete: { maxAgeMs: 7 * 24 * 60 * 60 * 1000, maxPerChat: 500, intervalMs: 60_000 },
})

client.on('connect', ({ me }) => console.log('connected as', me.id))
