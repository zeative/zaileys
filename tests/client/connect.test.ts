import { describe, expect, it, vi, beforeEach } from 'vitest'
import { createMockSocket, type MockSocket } from '../_helpers/mock-socket.js'

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
import type { AuthStore, AuthStoreBundle } from '../../src/auth/types.js'

function memAuth(): AuthStoreBundle {
  const sig: AuthStore = {
    read: async () => ({}),
    write: async () => undefined,
    delete: async () => undefined,
    clear: async () => undefined,
    close: async () => undefined,
  }
  return {
    creds: {
      readCreds: async () => undefined,
      writeCreds: async () => undefined,
      deleteCreds: async () => undefined,
    },
    signal: sig,
  }
}

beforeEach(() => {
  makeWASocketMock.mockReset()
  initAuthCredsMock.mockClear()
  printQrMock.mockClear()
})

describe('Client.connect — happy path', () => {
  it('transitions idle -> connecting on connect()', async () => {
    const sock = createMockSocket({ user: { id: 'me@s.whatsapp.net' } })
    makeWASocketMock.mockReturnValue(sock)
    const c = new Client({ auth: memAuth() })
    const p = c.connect()
    expect(c.state).toBe('connecting')
    queueMicrotask(() => sock.triggerConnectionUpdate({ connection: 'open' }))
    await p
    expect(c.state).toBe('connected')
  })

  it('connection.update {qr} emits qr event with typed payload', async () => {
    const sock = createMockSocket()
    makeWASocketMock.mockReturnValue(sock)
    const c = new Client({ auth: memAuth(), qrTerminal: false })
    const events: Array<{ sessionId: string; qrString: string; expiresAt: number }> = []
    c.on('qr', (e) => events.push(e))
    const p = c.connect()
    sock.triggerConnectionUpdate({ qr: 'fake-qr' })
    await new Promise((r) => setTimeout(r, 5))
    sock.triggerConnectionUpdate({ connection: 'open' })
    await p
    expect(events).toHaveLength(1)
    expect(events[0]?.qrString).toBe('fake-qr')
    expect(events[0]?.sessionId).toBe('default')
    expect(typeof events[0]?.expiresAt).toBe('number')
  })

  it('qrTerminal: false suppresses terminal print but still emits qr', async () => {
    const sock = createMockSocket()
    makeWASocketMock.mockReturnValue(sock)
    const c = new Client({ auth: memAuth(), qrTerminal: false })
    const seen = vi.fn()
    c.on('qr', seen)
    const p = c.connect()
    sock.triggerConnectionUpdate({ qr: 'qr-x' })
    await new Promise((r) => setTimeout(r, 5))
    sock.triggerConnectionUpdate({ connection: 'open' })
    await p
    expect(printQrMock).not.toHaveBeenCalled()
    expect(seen).toHaveBeenCalled()
  })

  it('qrTerminal: true calls printQrToTerminal', async () => {
    const sock = createMockSocket()
    makeWASocketMock.mockReturnValue(sock)
    const c = new Client({ auth: memAuth(), qrTerminal: true })
    const p = c.connect()
    sock.triggerConnectionUpdate({ qr: 'qr-print' })
    await new Promise((r) => setTimeout(r, 5))
    sock.triggerConnectionUpdate({ connection: 'open' })
    await p
    expect(printQrMock).toHaveBeenCalledWith('qr-print')
  })

  it('connection "open" + user set emits connect with me', async () => {
    const sock = createMockSocket({ user: { id: 'wid@s.whatsapp.net', name: 'Me' } })
    makeWASocketMock.mockReturnValue(sock)
    const c = new Client({ auth: memAuth() })
    const seen: Array<{ sessionId: string; me: { id: string } }> = []
    c.on('connect', (e) => seen.push(e))
    const p = c.connect()
    queueMicrotask(() => sock.triggerConnectionUpdate({ connection: 'open' }))
    await p
    expect(seen).toHaveLength(1)
    expect(seen[0]?.me.id).toBe('wid@s.whatsapp.net')
  })

  it('connect() Promise resolves after open', async () => {
    const sock = createMockSocket({ user: { id: 'x' } })
    makeWASocketMock.mockReturnValue(sock)
    const c = new Client({ auth: memAuth() })
    let resolved = false
    const p = c.connect().then(() => { resolved = true })
    expect(resolved).toBe(false)
    sock.triggerConnectionUpdate({ connection: 'open' })
    await p
    expect(resolved).toBe(true)
  })
})

describe('Client.connect — pairing', () => {
  it('pairing mode requests code and emits pairing-code', async () => {
    const sock = createMockSocket({ user: { id: 'p' } })
    sock.requestPairingCode.mockResolvedValue('PAIR1234')
    makeWASocketMock.mockReturnValue(sock)
    const c = new Client({ auth: memAuth(), authType: 'pairing', phoneNumber: '+62 812 3456 7890', qrTerminal: false })
    const got: Array<{ code: string }> = []
    c.on('pairing-code', (e) => got.push(e))
    const p = c.connect()
    sock.triggerConnectionUpdate({ qr: 'qr-ignored-by-pairing' })
    await new Promise((r) => setTimeout(r, 10))
    sock.triggerConnectionUpdate({ connection: 'open' })
    await p
    expect(sock.requestPairingCode).toHaveBeenCalledWith('6281234567890')
    expect(got).toHaveLength(1)
    expect(got[0]?.code).toBe('PAIR1234')
  })

  it('pairing without phoneNumber throws on connect', async () => {
    const c = new Client({ auth: memAuth(), authType: 'pairing' })
    await expect(c.connect()).rejects.toThrow(/phoneNumber/)
  })
})

describe('Client.connect — creds + auth wiring', () => {
  it('creds.update writes to auth.creds.writeCreds', async () => {
    const writeCreds = vi.fn(async () => undefined)
    const bundle = memAuth()
    bundle.creds.writeCreds = writeCreds
    const sock = createMockSocket({ user: { id: 'x' } })
    makeWASocketMock.mockReturnValue(sock)
    const c = new Client({ auth: bundle })
    const p = c.connect()
    sock.triggerCredsUpdate({ updated: true })
    sock.triggerConnectionUpdate({ connection: 'open' })
    await p
    await new Promise((r) => setTimeout(r, 5))
    expect(writeCreds).toHaveBeenCalledWith({ updated: true })
  })

  it('initAuthCreds invoked when readCreds returns undefined', async () => {
    const sock = createMockSocket({ user: { id: 'x' } })
    makeWASocketMock.mockReturnValue(sock)
    const c = new Client({ auth: memAuth() })
    const p = c.connect()
    sock.triggerConnectionUpdate({ connection: 'open' })
    await p
    expect(initAuthCredsMock).toHaveBeenCalled()
  })

  it('readCreds non-undefined skips initAuthCreds', async () => {
    const bundle = memAuth()
    bundle.creds.readCreds = async () => ({ existing: true } as never)
    const sock = createMockSocket({ user: { id: 'x' } })
    makeWASocketMock.mockReturnValue(sock)
    const c = new Client({ auth: bundle })
    initAuthCredsMock.mockClear()
    const p = c.connect()
    sock.triggerConnectionUpdate({ connection: 'open' })
    await p
    expect(initAuthCredsMock).not.toHaveBeenCalled()
  })
})

describe('Client — multi-instance isolation', () => {
  it('two clients have isolated emitters and sockets', async () => {
    const sockA = createMockSocket({ user: { id: 'a' } })
    const sockB = createMockSocket({ user: { id: 'b' } })
    let n = 0
    makeWASocketMock.mockImplementation(() => (n++ === 0 ? sockA : sockB))
    const cA = new Client({ sessionId: 'a', auth: memAuth() })
    const cB = new Client({ sessionId: 'b', auth: memAuth() })
    const sawA = vi.fn()
    const sawB = vi.fn()
    cA.on('connect', sawA)
    cB.on('connect', sawB)
    const pA = cA.connect()
    const pB = cB.connect()
    sockA.triggerConnectionUpdate({ connection: 'open' })
    sockB.triggerConnectionUpdate({ connection: 'open' })
    await pA
    await pB
    expect(sawA).toHaveBeenCalledTimes(1)
    expect(sawB).toHaveBeenCalledTimes(1)
    expect(cA.socket).toBe(sockA as unknown as MockSocket)
    expect(cB.socket).toBe(sockB as unknown as MockSocket)
  })
})
