import { Client } from '../src/index.js'

const client = new Client({
  sessionId: 'plugins-demo',
  commandPrefix: '!',
  plugins: { dir: './examples/plugins', watch: true },
})

client.on('connect', ({ me }) => console.log('connected as', me.id))
