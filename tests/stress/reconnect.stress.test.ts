import { describe, expect, it, vi, beforeEach } from 'vitest'
import { makeIntegrationSocket, simulateBoomDisconnect } from '../_helpers/mock-socket-integration.js'

const { makeWASocketMock } = vi.hoisted(() => ({ makeWASocketMock: vi.fn() }))

vi.mock('baileys', () => ({
  default: makeWASocketMock,
  makeWASocket: makeWASocketMock,
  initAuthCreds: () => ({ registered: false }),
  DisconnectReason: {
    loggedOut: 401, forbidden: 403, connectionLost: 408, multideviceMismatch: 411,
    connectionClosed: 428, connectionReplaced: 440, badSession: 500,
    unavailableService: 503, restartRequired: 515, timedOut: 408,
  },
  makeCacheableSignalKeyStore: vi.fn((k: unknown) => k),
  BufferJSON: { replacer: (_k: string, v: unknown) => v, reviver: (_k: string, v: unknown) => v },
}))

import { Client } from '../../src/client/client.js'
import { MemoryAuthStore } from '../../src/auth/adapters/memory.js'

const REAL_CREDS = { me: { id: '628111@s.whatsapp.net' }, noiseKey: 'K', registered: true }

const heapMb = (): number => {
  global.gc?.()
  return process.memoryUsage().heapUsed / 1024 / 1024
}

beforeEach(() => makeWASocketMock.mockReset())

describe('stress: reconnect churn', () => {
  it('survives 200 disconnect/reconnect cycles with the session intact and no handle growth', async () => {
    const auth = new MemoryAuthStore()
    await auth.creds.writeCreds(REAL_CREDS as never)
    const client = new Client({
      sessionId: 'churn',
      auth,
      qrTerminal: false,
      autoConnect: false,
      statusLog: false,
      reconnect: { enabled: false },
    })

    const before = heapMb()
    const handlesBefore = (process as unknown as { _getActiveHandles(): unknown[] })._getActiveHandles().length

    for (let i = 0; i < 200; i += 1) {
      const sock = makeIntegrationSocket({ user: { id: REAL_CREDS.me.id } })
      makeWASocketMock.mockReturnValue(sock)
      const p = client.connect()
      await vi.waitFor(() => expect(makeWASocketMock).toHaveBeenCalledTimes(i + 1))
      sock.triggerConnectionUpdate({ connection: 'open' })
      await p
      simulateBoomDisconnect(sock, i % 2 === 0 ? 500 : 440)
      await new Promise((r) => setTimeout(r, 1))
    }

    const after = heapMb()
    const handlesAfter = (process as unknown as { _getActiveHandles(): unknown[] })._getActiveHandles().length

    const stored = await auth.creds.readCreds()
    expect(stored?.me).toEqual(REAL_CREDS.me)
    expect(after - before).toBeLessThan(150)
    expect(handlesAfter - handlesBefore).toBeLessThan(20)

    if (process.env['STRESS_METRICS_FILE'] !== undefined) {
      const { appendFileSync } = await import('node:fs')
      appendFileSync(
        process.env['STRESS_METRICS_FILE'],
        `reconnect: 200 cycles, heap delta ${(after - before).toFixed(1)} MB, handles ${handlesBefore} -> ${handlesAfter}\n`,
      )
    }
    await client.disconnect().catch(() => undefined)
  }, 180_000)

  it('presence auto-clear timers do not accumulate across disconnects', async () => {
    const auth = new MemoryAuthStore()
    await auth.creds.writeCreds(REAL_CREDS as never)
    const client = new Client({
      sessionId: 'presence', auth, qrTerminal: false, autoConnect: false,
      statusLog: false, reconnect: { enabled: false },
    })
    const sock = makeIntegrationSocket({ user: { id: REAL_CREDS.me.id } })
    makeWASocketMock.mockReturnValue(sock)
    const p = client.connect()
    await vi.waitFor(() => expect(makeWASocketMock).toHaveBeenCalled())
    sock.triggerConnectionUpdate({ connection: 'open' })
    await p

    for (let i = 0; i < 500; i += 1) {
      await client.presence.typing(`628${i}@s.whatsapp.net`, 60_000).catch(() => undefined)
    }
    const before = (process as unknown as { _getActiveHandles(): unknown[] })._getActiveHandles().length
    await client.disconnect().catch(() => undefined)
    const after = (process as unknown as { _getActiveHandles(): unknown[] })._getActiveHandles().length
    expect(after).toBeLessThanOrEqual(before)
  }, 120_000)
})
