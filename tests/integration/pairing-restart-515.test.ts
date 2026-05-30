import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import {
  makeIntegrationSocket,
  simulateBoomDisconnect,
  type IntegrationMockSocket,
} from '../_helpers/mock-socket-integration.js'

const { makeWASocketMock, initAuthCredsMock } = vi.hoisted(() => ({
  makeWASocketMock: vi.fn(),
  initAuthCredsMock: vi.fn(() => ({ fake: 'creds' })),
}))

vi.mock('baileys', () => ({
  default: makeWASocketMock,
  makeWASocket: makeWASocketMock,
  initAuthCreds: initAuthCredsMock,
  DisconnectReason: {
    loggedOut: 401,
    forbidden: 403,
    connectionLost: 408,
    multideviceMismatch: 411,
    connectionClosed: 428,
    connectionReplaced: 440,
    badSession: 500,
    unavailableService: 503,
    restartRequired: 515,
    timedOut: 408,
  },
  makeCacheableSignalKeyStore: vi.fn((k: unknown) => k),
  BufferJSON: { replacer: (_k: string, v: unknown) => v, reviver: (_k: string, v: unknown) => v },
}))

vi.mock('../../src/connection/qr-terminal.js', async () => {
  const actual = await vi.importActual<typeof import('../../src/connection/qr-terminal.js')>(
    '../../src/connection/qr-terminal.js',
  )
  return { ...actual, printQrToTerminal: vi.fn(async () => undefined) }
})

import { Client } from '../../src/client/client.js'
import { MemoryAuthStore } from '../../src/auth/adapters/memory.js'

beforeEach(() => {
  makeWASocketMock.mockReset()
  initAuthCredsMock.mockClear()
})

afterEach(() => {
  vi.useRealTimers()
})

async function tick(): Promise<void> {
  await Promise.resolve()
  await Promise.resolve()
}

describe('integration: first-pairing 515 restart before first open', () => {
  it('515 in qr-pending schedules reconnect and recreates the socket (does not exit)', async () => {
    vi.useFakeTimers()
    const sockets: IntegrationMockSocket[] = [
      makeIntegrationSocket({ user: { id: 'a@x' } }),
      makeIntegrationSocket({ user: { id: 'a@x' } }),
    ]
    let idx = 0
    makeWASocketMock.mockImplementation(
      () => sockets[idx++] ?? makeIntegrationSocket({ user: { id: 'fallback@x' } }),
    )

    const c = new Client({
      auth: new MemoryAuthStore(),
      qrTerminal: false,
      reconnect: { initialDelayMs: 100, jitterFactor: 0 },
      autoConnect: false,
    })

    const reconnecting = vi.fn()
    const connected = vi.fn()
    c.on('reconnecting', reconnecting)
    c.on('connect', connected)

    void c.connect()
    await tick()

    sockets[0]!.triggerConnectionUpdate({ qr: 'simulated-qr-payload' })
    await tick()
    expect(c.state).toBe('qr-pending')

    simulateBoomDisconnect(sockets[0]!, 515)
    await tick()

    expect(reconnecting).toHaveBeenCalledTimes(1)
    expect(c.state).toBe('reconnecting')
    expect(makeWASocketMock).toHaveBeenCalledTimes(1)

    vi.advanceTimersByTime(200)
    await tick()

    expect(makeWASocketMock).toHaveBeenCalledTimes(2)

    sockets[1]!.triggerConnectionUpdate({ connection: 'open' })
    await tick()

    expect(c.state).toBe('connected')
    expect(connected).toHaveBeenCalledTimes(1)

    await c.disconnect()
  })
})
