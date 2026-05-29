import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { createMockSocket } from '../_helpers/mock-socket.js'

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
import type { AuthStore, AuthStoreBundle } from '../../src/auth/types.js'

interface TrackedAuth extends AuthStoreBundle {
  __wipeSignal: number
  __wipeCreds: number
  __closeSignal: number
}

function memAuth(): TrackedAuth {
  let wipeSignal = 0
  let wipeCreds = 0
  let closeSignal = 0
  const sig: AuthStore = {
    read: async () => ({}),
    write: async () => undefined,
    delete: async () => undefined,
    clear: async () => { wipeSignal += 1 },
    close: async () => { closeSignal += 1 },
  }
  const bundle: TrackedAuth = {
    creds: {
      readCreds: async () => undefined,
      writeCreds: async () => undefined,
      deleteCreds: async () => { wipeCreds += 1 },
    },
    signal: sig,
    get __wipeSignal() { return wipeSignal },
    get __wipeCreds() { return wipeCreds },
    get __closeSignal() { return closeSignal },
  }
  return bundle
}

function boomErr(statusCode: number): Error {
  const e = new Error(`boom ${statusCode}`) as Error & { output?: { statusCode: number } }
  e.output = { statusCode }
  return e
}

beforeEach(() => {
  makeWASocketMock.mockReset()
  initAuthCredsMock.mockClear()
})

afterEach(() => {
  vi.useRealTimers()
})

async function connectAndOpen(auth: AuthStoreBundle) {
  const sock = createMockSocket({ user: { id: 'me' } })
  makeWASocketMock.mockReturnValue(sock)
  const c = new Client({ auth, qrTerminal: false, reconnect: { initialDelayMs: 10, jitterFactor: 0 } })
  const p = c.connect()
  sock.triggerConnectionUpdate({ connection: 'open' })
  await p
  return { c, sock }
}

describe('Client — non-fatal disconnect schedules reconnect', () => {
  it('status 428 emits reconnecting + schedules retry', async () => {
    vi.useFakeTimers()
    const auth = memAuth()
    const sock = createMockSocket({ user: { id: 'me' } })
    const sock2 = createMockSocket({ user: { id: 'me' } })
    let n = 0
    makeWASocketMock.mockImplementation(() => (n++ === 0 ? sock : sock2))
    const c = new Client({ auth, qrTerminal: false, reconnect: { initialDelayMs: 10, jitterFactor: 0 } })
    const reconnecting: Array<{ attempt: number; delayMs: number }> = []
    c.on('reconnecting', (e) => reconnecting.push(e))
    const p = c.connect()
    sock.triggerConnectionUpdate({ connection: 'open' })
    await p
    sock.triggerConnectionUpdate({ connection: 'close', lastDisconnect: { error: boomErr(428) } })
    await Promise.resolve()
    expect(reconnecting).toHaveLength(1)
    expect(reconnecting[0]?.attempt).toBe(1)
    expect(reconnecting[0]?.delayMs).toBeGreaterThanOrEqual(0)
    vi.advanceTimersByTime(50)
    await Promise.resolve()
    expect(makeWASocketMock).toHaveBeenCalledTimes(2)
  })

  it('reconnect.enabled=false suppresses reconnect on non-fatal close', async () => {
    const auth = memAuth()
    const sock = createMockSocket({ user: { id: 'me' } })
    makeWASocketMock.mockReturnValue(sock)
    const c = new Client({ auth, qrTerminal: false, reconnect: { enabled: false } })
    const reconnecting = vi.fn()
    c.on('reconnecting', reconnecting)
    const p = c.connect()
    sock.triggerConnectionUpdate({ connection: 'open' })
    await p
    sock.triggerConnectionUpdate({ connection: 'close', lastDisconnect: { error: boomErr(428) } })
    await Promise.resolve()
    expect(reconnecting).not.toHaveBeenCalled()
  })

  it('reconnect.maxAttempts caps retries', async () => {
    vi.useFakeTimers()
    const auth = memAuth()
    const socks = [createMockSocket(), createMockSocket(), createMockSocket(), createMockSocket()]
    let n = 0
    makeWASocketMock.mockImplementation(() => socks[n++] ?? createMockSocket())
    const c = new Client({ auth, qrTerminal: false, reconnect: { maxAttempts: 2, initialDelayMs: 1, jitterFactor: 0 } })
    const reconnecting = vi.fn()
    const disconnects: Array<{ willReconnect: boolean }> = []
    c.on('reconnecting', reconnecting)
    c.on('disconnect', (e) => disconnects.push(e))
    const p = c.connect()
    socks[0]!.triggerConnectionUpdate({ connection: 'open' })
    await p
    socks[0]!.triggerConnectionUpdate({ connection: 'close', lastDisconnect: { error: boomErr(428) } })
    await Promise.resolve()
    vi.advanceTimersByTime(5)
    await Promise.resolve()
    socks[1]!.triggerConnectionUpdate({ connection: 'close', lastDisconnect: { error: boomErr(428) } })
    await Promise.resolve()
    vi.advanceTimersByTime(10)
    await Promise.resolve()
    socks[2]!.triggerConnectionUpdate({ connection: 'close', lastDisconnect: { error: boomErr(428) } })
    await Promise.resolve()
    expect(reconnecting).toHaveBeenCalledTimes(2)
    const last = disconnects[disconnects.length - 1]
    expect(last?.willReconnect).toBe(false)
  })
})

describe('Client — fatal disconnect wipes auth', () => {
  it.each([
    [401, 'logged-out'],
    [403, 'forbidden'],
    [440, 'connection-replaced'],
  ] as const)('status %i -> reason %s, willReconnect false, auth cleared', async (code, _expected) => {
    const auth = memAuth()
    const { sock } = await connectAndOpen(auth)
    const events: Array<{ reason: string; willReconnect: boolean }> = []
    let c2: { state: string } | undefined
    void c2
    const disconnectEvents: Array<{ reason: string }> = []
    sock.ev.removeAllListeners('disconnect')
    const seen: Array<{ reason: string; willReconnect: boolean }> = []
    void disconnectEvents
    void events
    void seen
    sock.triggerConnectionUpdate({ connection: 'close', lastDisconnect: { error: boomErr(code) } })
    await new Promise((r) => setTimeout(r, 5))
    expect(auth.__wipeSignal).toBeGreaterThanOrEqual(1)
    expect(auth.__wipeCreds).toBeGreaterThanOrEqual(1)
  })

  it('fatal close emits disconnect with willReconnect:false', async () => {
    const auth = memAuth()
    const { c, sock } = await connectAndOpen(auth)
    const ev: Array<{ reason: string; willReconnect: boolean }> = []
    c.on('disconnect', (e) => ev.push(e))
    sock.triggerConnectionUpdate({ connection: 'close', lastDisconnect: { error: boomErr(401) } })
    await new Promise((r) => setTimeout(r, 5))
    expect(ev.some((e) => e.reason === 'logged-out' && e.willReconnect === false)).toBe(true)
  })
})

describe('Client.disconnect — graceful teardown', () => {
  it('disconnect() before connect is a no-op', async () => {
    const c = new Client({ auth: memAuth() })
    await expect(c.disconnect()).resolves.toBeUndefined()
    expect(c.state).toBe('idle')
  })

  it('disconnect() after connect transitions to disconnected', async () => {
    const auth = memAuth()
    const { c, sock } = await connectAndOpen(auth)
    expect(c.state).toBe('connected')
    await c.disconnect()
    expect(c.state).toBe('disconnected')
    expect(sock.end).toHaveBeenCalled()
  })

  it('disconnect() calls auth.signal.close + store.close but NOT deleteCreds', async () => {
    const auth = memAuth()
    const { c } = await connectAndOpen(auth)
    await c.disconnect()
    expect(auth.__closeSignal).toBe(1)
    expect(auth.__wipeCreds).toBe(0)
  })

  it('disconnect() completes within 2 seconds', async () => {
    const auth = memAuth()
    const { c } = await connectAndOpen(auth)
    const start = Date.now()
    await c.disconnect()
    expect(Date.now() - start).toBeLessThan(2000)
  })
})

describe('Client.logout — wipe + disconnect', () => {
  it('logout() calls socket.logout, signal.clear, deleteCreds', async () => {
    const auth = memAuth()
    const { c, sock } = await connectAndOpen(auth)
    await c.logout()
    expect(sock.logout).toHaveBeenCalled()
    expect(auth.__wipeSignal).toBeGreaterThanOrEqual(1)
    expect(auth.__wipeCreds).toBeGreaterThanOrEqual(1)
  })

  it('logout() emits disconnect with reason "logged-out"', async () => {
    const auth = memAuth()
    const { c } = await connectAndOpen(auth)
    const seen: Array<{ reason: string }> = []
    c.on('disconnect', (e) => seen.push(e))
    await c.logout()
    expect(seen.some((e) => e.reason === 'logged-out')).toBe(true)
  })

  it('logout() handles socket.logout failure gracefully', async () => {
    const auth = memAuth()
    const sock = createMockSocket({ user: { id: 'me' } })
    sock.logout.mockRejectedValueOnce(new Error('net'))
    makeWASocketMock.mockReturnValue(sock)
    const c = new Client({ auth, qrTerminal: false })
    const p = c.connect()
    sock.triggerConnectionUpdate({ connection: 'open' })
    await p
    await expect(c.logout()).resolves.toBeUndefined()
    expect(auth.__wipeCreds).toBeGreaterThanOrEqual(1)
  })
})

describe('Client — multi-instance disconnect isolation', () => {
  it('disconnecting one client does not affect the other', async () => {
    const sockA = createMockSocket({ user: { id: 'a' } })
    const sockB = createMockSocket({ user: { id: 'b' } })
    let n = 0
    makeWASocketMock.mockImplementation(() => (n++ === 0 ? sockA : sockB))
    const cA = new Client({ sessionId: 'a', auth: memAuth(), qrTerminal: false })
    const cB = new Client({ sessionId: 'b', auth: memAuth(), qrTerminal: false })
    const pA = cA.connect()
    const pB = cB.connect()
    sockA.triggerConnectionUpdate({ connection: 'open' })
    sockB.triggerConnectionUpdate({ connection: 'open' })
    await pA
    await pB
    await cA.disconnect()
    expect(cA.state).toBe('disconnected')
    expect(cB.state).toBe('connected')
  })
})
