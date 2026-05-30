import { describe, expect, it } from 'vitest'
import { Client } from '../../src/client/client.js'

const E2E_ENABLED = process.env.ZAILEYS_E2E === '1'
const E2E_AUTH = (process.env.ZAILEYS_E2E_AUTH as 'qr' | 'pairing' | undefined) ?? 'qr'
const E2E_PHONE = process.env.ZAILEYS_E2E_PHONE
const E2E_TARGET = process.env.ZAILEYS_E2E_TARGET
const E2E_SESSION = process.env.ZAILEYS_E2E_SESSION ?? 'e2e-smoke'

describe.skipIf(!E2E_ENABLED)('e2e: real-connection smoke', () => {
  it(
    'connects to a real WA account and disconnects cleanly',
    async () => {
      const client = new Client({
        sessionId: E2E_SESSION,
        authType: E2E_AUTH,
        phoneNumber: E2E_PHONE,
        autoConnect: false,
      })

      client.on('qr', (e) => {
        console.log(`[e2e] scan QR for session ${e.sessionId}`)
      })
      client.on('pairing-code', (e) => {
        console.log(`[e2e] pairing code: ${e.code}`)
      })

      const connected = new Promise<void>((resolve, reject) => {
        client.on('connect', () => resolve())
        client.on('error', (e) => reject(e.error))
      })

      await client.connect()
      await connected

      expect(client.state).toBe('connected')
      expect(client.socket).toBeDefined()

      if (E2E_TARGET) {
        await client.send(E2E_TARGET).text(`zaileys e2e smoke ${Date.now()}`)
      }

      await client.disconnect()
      expect(client.state).toBe('disconnected')
    },
    120_000,
  )
})
