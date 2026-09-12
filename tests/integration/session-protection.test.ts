import { describe, expect, it, vi, beforeEach } from 'vitest'
import { makeIntegrationSocket } from '../_helpers/mock-socket-integration.js'

const { makeWASocketMock, initAuthCredsMock } = vi.hoisted(() => ({
  makeWASocketMock: vi.fn(),
  initAuthCredsMock: vi.fn(() => ({ fresh: true })),
}))

vi.mock('baileys', () => ({
  default: makeWASocketMock,
  makeWASocket: makeWASocketMock,
  initAuthCreds: initAuthCredsMock,
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
import type { AuthenticationCreds } from 'baileys'

const REAL_CREDS = {
  me: { id: '628111@s.whatsapp.net' },
  noiseKey: 'REAL-NOISE',
  routingInfo: 'ROUTE-A',
  registered: true,
} as unknown as AuthenticationCreds

/** Auth store whose readCreds resolves only when released — models a slow pg/redis/disk read. */
class SlowAuthStore extends MemoryAuthStore {
  release!: () => void
  reject!: (err: Error) => void
  stored: AuthenticationCreds | undefined = REAL_CREDS
  private gate = new Promise<void>((res, rej) => {
    this.release = res
    this.reject = () => rej(new Error('store unavailable'))
  })
  override readonly creds = {
    readCreds: async (): Promise<AuthenticationCreds | undefined> => {
      await this.gate
      return this.stored
    },
    writeCreds: async (n: AuthenticationCreds): Promise<void> => {
      this.stored = n
    },
    deleteCreds: async (): Promise<void> => {
      this.stored = undefined
    },
  }
}

beforeEach(() => {
  makeWASocketMock.mockReset()
  initAuthCredsMock.mockClear()
})

describe('session protection: credentials are loaded before the socket exists', () => {
  it('never hands makeWASocket an empty creds object', async () => {
    const sock = makeIntegrationSocket()
    makeWASocketMock.mockReturnValue(sock)
    const auth = new SlowAuthStore()
    const c = new Client({ auth, qrTerminal: false, autoConnect: false })

    const p = c.connect()
    await new Promise((r) => setTimeout(r, 10))
    expect(makeWASocketMock).not.toHaveBeenCalled()

    auth.release()
    sock.triggerConnectionUpdate({ connection: 'open' })
    await p

    const passed = makeWASocketMock.mock.calls[0]![0].auth.creds
    expect(passed.me).toEqual(REAL_CREDS.me)
    expect(passed.noiseKey).toBe('REAL-NOISE')
    await c.disconnect().catch(() => undefined)
  })

  it('forwards routingInfo so the reconnect reaches the same edge', async () => {
    const sock = makeIntegrationSocket()
    makeWASocketMock.mockReturnValue(sock)
    const auth = new SlowAuthStore()
    const c = new Client({ auth, qrTerminal: false, autoConnect: false })
    auth.release()
    const p = c.connect()
    await new Promise((r) => setTimeout(r, 10))
    sock.triggerConnectionUpdate({ connection: 'open' })
    await p
    expect(makeWASocketMock.mock.calls[0]![0].auth.creds.routingInfo).toBe('ROUTE-A')
    await c.disconnect().catch(() => undefined)
  })

  it('a failing readCreds aborts the connect and creates no socket', async () => {
    const sock = makeIntegrationSocket()
    makeWASocketMock.mockReturnValue(sock)
    const auth = new SlowAuthStore()
    const c = new Client({ auth, qrTerminal: false, autoConnect: false })

    const p = c.connect()
    auth.reject(new Error('store unavailable'))
    await expect(p).rejects.toThrow()
    expect(makeWASocketMock).not.toHaveBeenCalled()
    expect(c.state).toBe('disconnected')
  })

  it('a stored session survives a creds.update that arrives during connect', async () => {
    const sock = makeIntegrationSocket()
    makeWASocketMock.mockReturnValue(sock)
    const auth = new SlowAuthStore()
    const c = new Client({ auth, qrTerminal: false, autoConnect: false })
    auth.release()
    const p = c.connect()
    await new Promise((r) => setTimeout(r, 10))
    sock.triggerCredsUpdate({ lastAccountSyncTimestamp: 1 })
    sock.triggerConnectionUpdate({ connection: 'open' })
    await p
    await new Promise((r) => setTimeout(r, 10))
    expect(auth.stored?.me).toEqual(REAL_CREDS.me)
    expect((auth.stored as unknown as { noiseKey?: string }).noiseKey).toBe('REAL-NOISE')
    await c.disconnect().catch(() => undefined)
  })
})

describe('session protection: a registered identity is never silently replaced', () => {
  it('aborts instead of pairing again when a QR arrives for a registered session', async () => {
    const sock = makeIntegrationSocket()
    makeWASocketMock.mockReturnValue(sock)
    const auth = new SlowAuthStore()
    auth.release()
    const c = new Client({ auth, qrTerminal: false, autoConnect: false, reconnect: { enabled: false } })
    const qr = vi.fn()
    const errors = vi.fn()
    c.on('qr', qr)
    c.on('error', errors)
    const p = c.connect().catch(() => undefined)
    await vi.waitFor(() => expect(makeWASocketMock).toHaveBeenCalled())
    sock.triggerConnectionUpdate({ qr: 'SHOULD-NOT-PAIR' })
    await new Promise((r) => setTimeout(r, 20))
    expect(qr).not.toHaveBeenCalled()
    expect(errors).toHaveBeenCalled()
    expect(auth.stored?.me).toEqual(REAL_CREDS.me)
    await p
    await c.disconnect().catch(() => undefined)
  })

  it('still shows a QR for a fresh session with no stored creds', async () => {
    const sock = makeIntegrationSocket()
    makeWASocketMock.mockReturnValue(sock)
    const auth = new SlowAuthStore()
    auth.stored = undefined
    auth.release()
    const c = new Client({ auth, qrTerminal: false, autoConnect: false })
    const qr = vi.fn()
    c.on('qr', qr)
    void c.connect().catch(() => undefined)
    await vi.waitFor(() => expect(makeWASocketMock).toHaveBeenCalled())
    sock.triggerConnectionUpdate({ qr: 'PAIR-ME' })
    await new Promise((r) => setTimeout(r, 20))
    expect(qr).toHaveBeenCalled()
    await c.disconnect().catch(() => undefined)
  })

  it('refuses a creds update that would de-register the session', async () => {
    const sock = makeIntegrationSocket()
    makeWASocketMock.mockReturnValue(sock)
    const auth = new SlowAuthStore()
    auth.release()
    const c = new Client({ auth, qrTerminal: false, autoConnect: false })
    const p = c.connect()
    await vi.waitFor(() => expect(makeWASocketMock).toHaveBeenCalled())
    sock.triggerConnectionUpdate({ connection: 'open' })
    await p
    sock.triggerCredsUpdate({ registered: false, me: undefined })
    await new Promise((r) => setTimeout(r, 20))
    expect(auth.stored?.me).toEqual(REAL_CREDS.me)
    expect((auth.stored as unknown as { registered?: boolean }).registered).toBe(true)
    await c.disconnect().catch(() => undefined)
  })

  it('still accepts an ordinary creds update', async () => {
    const sock = makeIntegrationSocket()
    makeWASocketMock.mockReturnValue(sock)
    const auth = new SlowAuthStore()
    auth.release()
    const c = new Client({ auth, qrTerminal: false, autoConnect: false })
    const p = c.connect()
    await vi.waitFor(() => expect(makeWASocketMock).toHaveBeenCalled())
    sock.triggerConnectionUpdate({ connection: 'open' })
    await p
    sock.triggerCredsUpdate({ lastAccountSyncTimestamp: 4242 })
    await new Promise((r) => setTimeout(r, 20))
    expect((auth.stored as unknown as { lastAccountSyncTimestamp?: number }).lastAccountSyncTimestamp).toBe(4242)
    expect(auth.stored?.me).toEqual(REAL_CREDS.me)
    await c.disconnect().catch(() => undefined)
  })
})
