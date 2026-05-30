import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { makeInboundSocket, type InboundMockSocket } from '../_helpers/mock-socket-events.js'
import { simulateBoomDisconnect } from '../_helpers/mock-socket-integration.js'

const { makeWASocketMock, initAuthCredsMock, printQrMock } = vi.hoisted(() => ({
  makeWASocketMock: vi.fn(),
  initAuthCredsMock: vi.fn(() => ({ fake: 'creds' })),
  printQrMock: vi.fn(async (_qr: string) => undefined),
}))

vi.mock('baileys', async () => {
  const actual = await vi.importActual<typeof import('baileys')>('baileys')
  return {
    ...actual,
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
  }
})

vi.mock('../../src/connection/qr-terminal.js', async () => {
  const actual = await vi.importActual<typeof import('../../src/connection/qr-terminal.js')>(
    '../../src/connection/qr-terminal.js',
  )
  return { ...actual, printQrToTerminal: printQrMock }
})

import { Client } from '../../src/client/client.js'
import { MemoryAuthStore } from '../../src/auth/adapters/memory.js'

const SELF = 'me@s.whatsapp.net'

function textMsg(text: string): Record<string, unknown> {
  return {
    key: { remoteJid: '111@s.whatsapp.net', id: 'AGG1', fromMe: false },
    message: { conversation: text },
    messageTimestamp: 1700,
    pushName: 'Sentinel',
  }
}

beforeEach(() => {
  makeWASocketMock.mockReset()
  initAuthCredsMock.mockClear()
  printQrMock.mockClear()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('phase8 aggregate — cross-phase mocked-socket sentinel', () => {
  it('TEST-08: typed text event fires with full payload shape over mock socket', async () => {
    const sock = makeInboundSocket({ user: { id: SELF } })
    makeWASocketMock.mockReturnValue(sock)
    const c = new Client({ auth: new MemoryAuthStore(), qrTerminal: false, autoConnect: false })
    const p = c.connect()
    sock.triggerConnectionUpdate({ connection: 'open' })
    await p

    const seen = vi.fn()
    c.on('text', seen)
    sock.triggerMessagesUpsert({ messages: [textMsg('aggregate-hi')], type: 'notify' })

    expect(seen).toHaveBeenCalledTimes(1)
    const payload = seen.mock.calls[0]?.[0]
    expect(payload).toMatchObject({
      jid: '111@s.whatsapp.net',
      content: 'aggregate-hi',
      fromMe: false,
      isGroup: false,
    })
    expect(typeof payload.sender?.jid).toBe('string')
    expect(typeof payload.timestamp).toBe('number')

    await c.disconnect()
  })

  it('TEST-09: reconnect strategy backs off with increasing delay then recovers', async () => {
    vi.useFakeTimers()
    const socks = [
      makeInboundSocket({ user: { id: SELF } }),
      makeInboundSocket({ user: { id: SELF } }),
      makeInboundSocket({ user: { id: SELF } }),
    ]
    let idx = 0
    makeWASocketMock.mockImplementation(() => socks[idx++] as InboundMockSocket)
    const c = new Client({ auth: new MemoryAuthStore(), qrTerminal: false, autoConnect: false })

    const reconnects: number[] = []
    c.on('reconnecting', (e) => reconnects.push(e.delayMs))

    const p = c.connect()
    socks[0]!.triggerConnectionUpdate({ connection: 'open' })
    await p

    simulateBoomDisconnect(socks[0]!, 428)
    await vi.advanceTimersByTimeAsync(reconnects[0] ?? 0)
    simulateBoomDisconnect(socks[1]!, 428)
    await vi.advanceTimersByTimeAsync(reconnects[1] ?? 0)

    expect(reconnects.length).toBeGreaterThanOrEqual(2)
    expect(reconnects[1]).toBeGreaterThan(reconnects[0]!)

    socks[2]!.triggerConnectionUpdate({ connection: 'open' })
    await Promise.resolve()
    expect(c.state).toBe('connected')

    vi.useRealTimers()
    await c.disconnect()
  })
})
