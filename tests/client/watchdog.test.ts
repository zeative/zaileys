import { EventEmitter } from 'node:events'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createMockSocket, type MockSocket } from '../_helpers/mock-socket.js'

const { makeWASocketMock } = vi.hoisted(() => ({ makeWASocketMock: vi.fn() }))

vi.mock('baileys', () => ({
  default: makeWASocketMock,
  makeWASocket: makeWASocketMock,
  initAuthCreds: vi.fn(() => ({ fake: 'creds' })),
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

import { Client } from '../../src/client/client.js'
import type { ClientOptions } from '../../src/client/types.js'
import type { AuthStoreBundle } from '../../src/auth/types.js'
import { ZaileysConnectionError } from '../../src/connection/errors.js'

const MIN = 60_000
const OWN_JID = '628123:7@s.whatsapp.net'

interface TrackedAuth extends AuthStoreBundle {
  wipes: () => number
}

const memAuth = (): TrackedAuth => {
  let wipes = 0
  return {
    creds: {
      readCreds: async () => undefined,
      writeCreds: async () => undefined,
      deleteCreds: async () => {
        wipes += 1
      },
    },
    signal: {
      read: async () => ({}),
      write: async () => undefined,
      delete: async () => undefined,
      clear: async () => {
        wipes += 1
      },
      close: async () => undefined,
    },
    wipes: () => wipes,
  }
}

type WsSocket = MockSocket & { ws: EventEmitter }

/** Mirrors baileys: end(error) emits a close carrying that error. */
const deafSocket = (): WsSocket => {
  const sock = Object.assign(createMockSocket({ user: { id: OWN_JID } }), { ws: new EventEmitter() })
  sock.end.mockImplementation((error?: Error) => {
    sock.triggerConnectionUpdate({ connection: 'close', lastDisconnect: { error } })
  })
  return sock
}

const open = async (sock: MockSocket, options: Partial<ClientOptions>, auth = memAuth()) => {
  const client = new Client({
    auth,
    qrTerminal: false,
    statusLog: false,
    autoConnect: false,
    autoDelete: false,
    reconnect: { initialDelayMs: 10, jitterFactor: 0 },
    ...options,
  })
  const connected = client.connect()
  sock.triggerConnectionUpdate({ connection: 'open' })
  await connected
  return { client, auth }
}

beforeEach(() => {
  makeWASocketMock.mockReset()
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('Client watchdog — option boundary', () => {
  it('throws INVALID_OPTIONS from the constructor for an idleMs below one minute', () => {
    let caught: unknown
    try {
      new Client({ autoConnect: false, watchdog: { idleMs: 1_000 } })
    } catch (err) {
      caught = err
    }
    expect(caught).toBeInstanceOf(ZaileysConnectionError)
    expect((caught as ZaileysConnectionError).code).toBe('INVALID_OPTIONS')
  })
})

describe('Client watchdog — off by default', () => {
  it('adds no frame listener, no timer and no probe without the option', async () => {
    const sock = deafSocket()
    makeWASocketMock.mockReturnValue(sock)
    const before = vi.getTimerCount()
    const { client } = await open(sock, {})
    expect(sock.ws.listenerCount('frame')).toBe(0)
    expect(vi.getTimerCount()).toBe(before)
    await vi.advanceTimersByTimeAsync(60 * MIN)
    expect(sock.onWhatsApp).not.toHaveBeenCalled()
    expect(sock.end).not.toHaveBeenCalled()
    await client.disconnect()
  })
})

describe('Client watchdog — deaf session', () => {
  it('ends a silent socket whose probe fails and reconnects as connection-lost without touching credentials', async () => {
    const first = deafSocket()
    const second = deafSocket()
    makeWASocketMock.mockReturnValueOnce(first).mockReturnValueOnce(second)
    const warn = vi.fn()
    const logger = { debug: vi.fn(), info: vi.fn(), warn, error: vi.fn(), fatal: vi.fn() }
    const { client, auth } = await open(first, { watchdog: true, logger })
    const reconnecting = vi.fn()
    const disconnects: Array<{ reason: string; willReconnect: boolean }> = []
    client.on('reconnecting', reconnecting)
    client.on('disconnect', (e) => disconnects.push(e))

    await vi.advanceTimersByTimeAsync(15 * MIN)

    expect(first.onWhatsApp).toHaveBeenCalledWith(OWN_JID)
    expect(first.end).toHaveBeenCalledTimes(1)
    expect(warn).toHaveBeenCalledWith(
      expect.objectContaining({ sessionId: 'default' }),
      'watchdog: no inbound traffic for 15 min and the probe failed; reconnecting',
    )
    expect(disconnects).toEqual([{ sessionId: 'default', reason: 'connection-lost', willReconnect: true }])
    expect(reconnecting).toHaveBeenCalledWith(expect.objectContaining({ reason: 'connection-lost', attempt: 1 }))
    expect(first.ws.listenerCount('frame')).toBe(0)

    await vi.advanceTimersByTimeAsync(10)
    expect(makeWASocketMock).toHaveBeenCalledTimes(2)
    second.triggerConnectionUpdate({ connection: 'open' })
    await vi.waitFor(() => expect(client.state).toBe('connected'))
    expect(second.ws.listenerCount('frame')).toBe(1)
    expect(auth.wipes()).toBe(0)

    await client.disconnect()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('keeps a quiet session whose probe answers', async () => {
    const sock = deafSocket()
    sock.onWhatsApp.mockResolvedValue([{ jid: OWN_JID, exists: true }])
    makeWASocketMock.mockReturnValue(sock)
    const { client } = await open(sock, { watchdog: { idleMs: MIN } })
    await vi.advanceTimersByTimeAsync(10 * MIN)
    expect(sock.onWhatsApp).toHaveBeenCalledTimes(10)
    expect(sock.end).not.toHaveBeenCalled()
    await client.disconnect()
  })

  it('does not probe while messages keep arriving', async () => {
    const sock = deafSocket()
    makeWASocketMock.mockReturnValue(sock)
    const { client } = await open(sock, { watchdog: { idleMs: MIN } })
    for (let i = 0; i < 10; i += 1) {
      await vi.advanceTimersByTimeAsync(MIN / 2)
      sock.ws.emit('frame', { tag: 'message', attrs: {} })
    }
    expect(sock.onWhatsApp).not.toHaveBeenCalled()
    await client.disconnect()
  })
})

describe('Client watchdog — teardown', () => {
  it('disconnect() leaves no timers, even with a probe in flight', async () => {
    const sock = deafSocket()
    sock.onWhatsApp.mockImplementation(() => new Promise<never>(() => undefined))
    makeWASocketMock.mockReturnValue(sock)
    const { client } = await open(sock, { watchdog: { idleMs: MIN, probeTimeoutMs: 30_000 } })
    expect(vi.getTimerCount()).toBeGreaterThan(0)
    await vi.advanceTimersByTimeAsync(MIN)
    expect(sock.onWhatsApp).toHaveBeenCalledTimes(1)
    sock.end.mockImplementation(() => undefined)
    await client.disconnect()
    expect(vi.getTimerCount()).toBe(0)
    expect(sock.ws.listenerCount('frame')).toBe(0)
  })

  it('a close that will not reconnect stops the watchdog', async () => {
    const sock = deafSocket()
    makeWASocketMock.mockReturnValue(sock)
    const { client } = await open(sock, { watchdog: true, reconnect: { enabled: false } })
    const lost = Object.assign(new Error('lost'), { output: { statusCode: 428 } })
    sock.triggerConnectionUpdate({ connection: 'close', lastDisconnect: { error: lost } })
    await vi.waitFor(() => expect(client.state).toBe('disconnected'))
    expect(vi.getTimerCount()).toBe(0)
    expect(sock.ws.listenerCount('frame')).toBe(0)
    await client.disconnect()
  })
})
