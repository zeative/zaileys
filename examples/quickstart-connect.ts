import { Client } from '../src/index.js'

const client = new Client({})

client.on('qr', ({ qrString }) => console.log('Scan QR:', qrString))
client.on('connect', ({ me }) => console.log('Connected as', me.id))
client.on('disconnect', ({ reason }) => console.log('Disconnected:', reason))

await client.connect()
