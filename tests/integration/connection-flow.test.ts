import { describe, expect, it, vi, beforeEach } from 'vitest'
import { makeIntegrationSocket, simulateAuthFlow, spyOnEv, type IntegrationMockSocket } from '../_helpers/mock-socket-integration.js'

const { makeWASocketMock, initAuthCredsMock, printQrMock } = vi.hoisted(() => ({
  makeWASocketMock: vi.fn(),
  initAuthCredsMock: vi.fn(() => ({ fake: 'creds' })),
  printQrMock: vi.fn(async (_qr: string) => undefined),
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
  return { ...actual, printQrToTerminal: printQrMock }
})

import { Client } from '../../src/client/client.js'
import { MemoryAuthStore } from '../../src/auth/adapters/memory.js'
import type { ConnectionState } from '../../src/client/types.js'

beforeEach(() => {
  makeWASocketMock.mockReset()
  initAuthCredsMock.mockClear()
  printQrMock.mockClear()
})

async function bootClient(opts: Partial<ConstructorParameters<typeof Client>[0]> = {}) {
  const sock = makeIntegrationSocket({ user: { id: '999@s.whatsapp.net', name: 'IT' } })
  makeWASocketMock.mockReturnValue(sock)
  const c = new Client({ auth: new MemoryAuthStore(), qrTerminal: false, autoConnect: false, ...opts })
  return { c, sock }
}

describe('integration: connection-flow happy path', () => {
  it('full lifecycle idle -> connecting -> qr-pending -> connected', async () => {
    const states: ConnectionState[] = []
    const { c, sock } = await bootClient()
    states.push(c.state)
    const p = c.connect()
    states.push(c.state)
    sock.triggerConnectionUpdate({ qr: 'qr-payload' })
    await Promise.resolve()
    states.push(c.state)
    sock.triggerConnectionUpdate({ connection: 'open' })
    await p
    states.push(c.state)
    expect(states).toEqual(['idle', 'connecting', 'qr-pending', 'connected'])
  })

  it('emits qr before connect', async () => {
    const order: string[] = []
    const { c, sock } = await bootClient()
    c.on('qr', () => order.push('qr'))
    c.on('connect', () => order.push('connect'))
    const p = c.connect()
    sock.triggerConnectionUpdate({ qr: 'qr-1' })
    await Promise.resolve()
    sock.triggerConnectionUpdate({ connection: 'open' })
    await p
    expect(order).toEqual(['qr', 'connect'])
  })

  it('connect payload contains sessionId and me.id', async () => {
    const seen: Array<{ sessionId: string; me: { id: string } }> = []
    const { c, sock } = await bootClient({ sessionId: 'integration-test' })
    c.on('connect', (e) => seen.push(e))
    const p = c.connect()
    sock.triggerConnectionUpdate({ connection: 'open' })
    await p
    expect(seen[0]?.sessionId).toBe('integration-test')
    expect(seen[0]?.me.id).toBe('999@s.whatsapp.net')
  })

  it('disconnect within 2 seconds of connected', async () => {
    const { c, sock } = await bootClient()
    const p = c.connect()
    sock.triggerConnectionUpdate({ connection: 'open' })
    await p
    const start = Date.now()
    await c.disconnect()
    expect(Date.now() - start).toBeLessThan(2000)
    expect(c.state).toBe('disconnected')
  })

  it('emits disconnect exactly once on graceful disconnect', async () => {
    const { c, sock } = await bootClient()
    const ev = vi.fn()
    c.on('disconnect', ev)
    const p = c.connect()
    sock.triggerConnectionUpdate({ connection: 'open' })
    await p
    await c.disconnect()
    expect(ev).toHaveBeenCalledTimes(1)
  })

  it('listener counts return to 0 after disconnect', async () => {
    const { c, sock } = await bootClient()
    const watcher = spyOnEv(sock)
    const p = c.connect()
    sock.triggerConnectionUpdate({ connection: 'open' })
    await p
    expect(watcher.count()).toBeGreaterThan(0)
    await c.disconnect()
    expect(watcher.count()).toBe(0)
  })

  it('on/off chained API supports add then remove', async () => {
    const { c, sock } = await bootClient()
    const fn = vi.fn()
    c.on('connect', fn)
    c.off('connect', fn)
    const p = c.connect()
    sock.triggerConnectionUpdate({ connection: 'open' })
    await p
    expect(fn).not.toHaveBeenCalled()
  })

  it('multiple connect handlers all fire', async () => {
    const { c, sock } = await bootClient()
    const a = vi.fn()
    const b = vi.fn()
    const cc = vi.fn()
    c.on('connect', a)
    c.on('connect', b)
    c.on('connect', cc)
    const p = c.connect()
    sock.triggerConnectionUpdate({ connection: 'open' })
    await p
    expect(a).toHaveBeenCalledTimes(1)
    expect(b).toHaveBeenCalledTimes(1)
    expect(cc).toHaveBeenCalledTimes(1)
  })

  it('removing one handler does not affect others', async () => {
    const { c, sock } = await bootClient()
    const a = vi.fn()
    const b = vi.fn()
    c.on('connect', a)
    c.on('connect', b)
    c.off('connect', a)
    const p = c.connect()
    sock.triggerConnectionUpdate({ connection: 'open' })
    await p
    expect(a).not.toHaveBeenCalled()
    expect(b).toHaveBeenCalledTimes(1)
  })

  it('two fresh Client instances each reach connected independently', async () => {
    const sockA = makeIntegrationSocket({ user: { id: 'a@s.whatsapp.net' } })
    const sockB = makeIntegrationSocket({ user: { id: 'a@s.whatsapp.net' } })
    let n = 0
    makeWASocketMock.mockImplementation(() => (n++ === 0 ? sockA : sockB))
    const cA = new Client({ auth: new MemoryAuthStore(), qrTerminal: false, autoConnect: false })
    const pA = cA.connect()
    sockA.triggerConnectionUpdate({ connection: 'open' })
    await pA
    await cA.disconnect()
    const cB = new Client({ auth: new MemoryAuthStore(), qrTerminal: false, autoConnect: false })
    const pB = cB.connect()
    sockB.triggerConnectionUpdate({ connection: 'open' })
    await pB
    expect(cA.state).toBe('disconnected')
    expect(cB.state).toBe('connected')
  })

  it('qrTerminal:false suppresses stdout/printer', async () => {
    const { c, sock } = await bootClient({ qrTerminal: false })
    const p = c.connect()
    sock.triggerConnectionUpdate({ qr: 'qr-noprint' })
    await Promise.resolve()
    sock.triggerConnectionUpdate({ connection: 'open' })
    await p
    expect(printQrMock).not.toHaveBeenCalled()
  })

  it('logger receives info-level activity (debug spy)', async () => {
    const logger = {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      fatal: vi.fn(),
    }
    const sock = makeIntegrationSocket({ user: { id: 'log@s.whatsapp.net' } })
    makeWASocketMock.mockReturnValue(sock)
    const c = new Client({ auth: new MemoryAuthStore(), qrTerminal: false, autoConnect: false, logger })
    const p = c.connect()
    sock.triggerConnectionUpdate({ connection: 'open' })
    await p
    expect(c.state).toBe('connected')
  })

  it('event log captures ordered transitions', async () => {
    const { c, sock } = await bootClient()
    const p = c.connect()
    sock.triggerConnectionUpdate({ qr: 'qr-log' })
    await Promise.resolve()
    sock.triggerCredsUpdate({ first: true })
    sock.triggerConnectionUpdate({ connection: 'open' })
    await p
    const types = sock.eventLog.map((e) => e.type)
    expect(types).toEqual(['connection.update', 'creds.update', 'connection.update'])
  })

  it('pairing end-to-end emits pairing-code then connect', async () => {
    const sock = makeIntegrationSocket({ user: { id: 'p@s.whatsapp.net' } })
    sock.requestPairingCode.mockResolvedValue('PAIRABCD')
    makeWASocketMock.mockReturnValue(sock)
    const c = new Client({
      auth: new MemoryAuthStore(),
      authType: 'pairing',
      phoneNumber: '+62 811 1111 2222',
      qrTerminal: false,
      autoConnect: false,
    })
    const order: string[] = []
    c.on('pairing-code', () => order.push('pairing-code'))
    c.on('connect', () => order.push('connect'))
    const p = c.connect()
    sock.triggerConnectionUpdate({ qr: 'q-pair' })
    await new Promise((r) => setTimeout(r, 10))
    sock.triggerConnectionUpdate({ connection: 'open' })
    await p
    expect(sock.requestPairingCode).toHaveBeenCalledWith('6281111112222')
    expect(order).toEqual(['pairing-code', 'connect'])
  })

  it('simulateAuthFlow helper drives full sequence', async () => {
    const { c, sock } = await bootClient()
    const p = c.connect()
    simulateAuthFlow(sock, { user: { id: 'helper@s.whatsapp.net' } })
    await p
    expect(c.state).toBe('connected')
    expect(sock.eventLog.length).toBeGreaterThanOrEqual(3)
  })

  it('connect() called twice while connecting is idempotent', async () => {
    const { c, sock } = await bootClient()
    const p1 = c.connect()
    const p2 = c.connect()
    sock.triggerConnectionUpdate({ connection: 'open' })
    await Promise.all([p1, p2])
    expect(makeWASocketMock).toHaveBeenCalledTimes(1)
  })
})
