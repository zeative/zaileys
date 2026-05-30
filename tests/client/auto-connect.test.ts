import { describe, expect, it, vi, beforeEach } from 'vitest'
import { makeInboundSocket } from '../_helpers/mock-socket-events.js'
import { createMockSocket } from '../_helpers/mock-socket.js'

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
    key: { remoteJid: '999@s.whatsapp.net', id: 'M1', fromMe: false },
    message: { conversation: text },
    messageTimestamp: 1700,
    pushName: 'Alice',
  }
}

async function flushMicrotasks(): Promise<void> {
  for (let i = 0; i < 8; i++) await Promise.resolve()
}

beforeEach(() => {
  makeWASocketMock.mockReset()
  initAuthCredsMock.mockClear()
  printQrMock.mockClear()
})

describe('Client auto-connect — DX', () => {
  it('connects without an explicit connect() call (default autoConnect)', async () => {
    const sock = createMockSocket({ user: { id: SELF } })
    makeWASocketMock.mockReturnValue(sock)
    const c = new Client({ auth: new MemoryAuthStore(), qrTerminal: false })
    expect(c.state).toBe('idle')
    await vi.waitFor(() => expect(c.state).not.toBe('idle'))
    expect(makeWASocketMock).toHaveBeenCalledTimes(1)
  })

  it('reaches connected after open without manual connect()', async () => {
    const sock = createMockSocket({ user: { id: SELF } })
    makeWASocketMock.mockReturnValue(sock)
    const c = new Client({ auth: new MemoryAuthStore(), qrTerminal: false })
    await vi.waitFor(() => expect(c.state).toBe('connecting'))
    sock.triggerConnectionUpdate({ connection: 'open' })
    await vi.waitFor(() => expect(c.state).toBe('connected'))
    expect(c.socket).toBeDefined()
  })

  it('stays idle synchronously in the construction frame', () => {
    const sock = createMockSocket({ user: { id: SELF } })
    makeWASocketMock.mockReturnValue(sock)
    const c = new Client({ auth: new MemoryAuthStore(), qrTerminal: false })
    expect(c.state).toBe('idle')
    expect(makeWASocketMock).not.toHaveBeenCalled()
  })

  it('autoConnect:false keeps the client idle after microtask flush', async () => {
    const sock = createMockSocket({ user: { id: SELF } })
    makeWASocketMock.mockReturnValue(sock)
    const c = new Client({ auth: new MemoryAuthStore(), qrTerminal: false, autoConnect: false })
    await flushMicrotasks()
    expect(c.state).toBe('idle')
    expect(makeWASocketMock).not.toHaveBeenCalled()
  })

  it('autoConnect:false still allows a later manual connect()', async () => {
    const sock = createMockSocket({ user: { id: SELF } })
    makeWASocketMock.mockReturnValue(sock)
    const c = new Client({ auth: new MemoryAuthStore(), qrTerminal: false, autoConnect: false })
    await flushMicrotasks()
    expect(c.state).toBe('idle')
    const p = c.connect()
    expect(c.state).toBe('connecting')
    sock.triggerConnectionUpdate({ connection: 'open' })
    await p
    expect(c.state).toBe('connected')
  })
})

describe('Client auto-connect — race safety', () => {
  it('a qr listener registered after construction still receives qr (race #1)', async () => {
    const sock = createMockSocket()
    makeWASocketMock.mockReturnValue(sock)
    const c = new Client({ auth: new MemoryAuthStore(), qrTerminal: false })
    const seen = vi.fn()
    c.on('qr', seen)
    await vi.waitFor(() => expect(c.state).toBe('connecting'))
    sock.triggerConnectionUpdate({ qr: 'deferred-qr' })
    await flushMicrotasks()
    expect(seen).toHaveBeenCalledTimes(1)
    expect(seen.mock.calls[0]?.[0]).toMatchObject({ qrString: 'deferred-qr' })
  })

  it('a connect listener registered after construction still fires (race #1b)', async () => {
    const sock = createMockSocket({ user: { id: SELF } })
    makeWASocketMock.mockReturnValue(sock)
    const c = new Client({ auth: new MemoryAuthStore(), qrTerminal: false })
    const seen = vi.fn()
    c.on('connect', seen)
    await vi.waitFor(() => expect(c.state).toBe('connecting'))
    sock.triggerConnectionUpdate({ connection: 'open' })
    await vi.waitFor(() => expect(c.state).toBe('connected'))
    expect(seen).toHaveBeenCalledTimes(1)
  })

  it('send() inside an inbound text handler succeeds (race #2)', async () => {
    const sock = makeInboundSocket({ user: { id: SELF } })
    makeWASocketMock.mockReturnValue(sock)
    const c = new Client({ auth: new MemoryAuthStore(), qrTerminal: false })
    const sent = vi.fn()
    c.on('text', async (msg) => {
      await c.send('111@s.whatsapp.net').text(`reply:${msg.content}`)
      sent()
    })
    await vi.waitFor(() => expect(c.state).toBe('connecting'))
    sock.triggerConnectionUpdate({ connection: 'open' })
    await vi.waitFor(() => expect(c.state).toBe('connected'))
    sock.triggerMessagesUpsert({ messages: [textMsg('ping')], type: 'notify' })
    await vi.waitFor(() => expect(sent).toHaveBeenCalledTimes(1))
    expect(sock.sendMessage).toHaveBeenCalledTimes(1)
    const [, content] = sock.sendMessage.mock.calls[0] as [string, Record<string, unknown>]
    expect(content.text).toBe('reply:ping')
  })

  it('send() inside handler does not throw "client not connected"', async () => {
    const sock = makeInboundSocket({ user: { id: SELF } })
    makeWASocketMock.mockReturnValue(sock)
    const c = new Client({ auth: new MemoryAuthStore(), qrTerminal: false })
    const errs: unknown[] = []
    c.on('text', async (msg) => {
      try {
        await c.send('111@s.whatsapp.net').text(msg.content)
      } catch (err) {
        errs.push(err)
      }
    })
    await vi.waitFor(() => expect(c.state).toBe('connecting'))
    sock.triggerConnectionUpdate({ connection: 'open' })
    await vi.waitFor(() => expect(c.state).toBe('connected'))
    sock.triggerMessagesUpsert({ messages: [textMsg('x')], type: 'notify' })
    await vi.waitFor(() => expect(sock.sendMessage).toHaveBeenCalledTimes(1))
    expect(errs).toHaveLength(0)
  })
})

describe('Client auto-connect — error surface', () => {
  it('emits error when socket construction throws', async () => {
    makeWASocketMock.mockImplementation(() => {
      throw new Error('socket boom')
    })
    const c = new Client({ auth: new MemoryAuthStore(), qrTerminal: false })
    const seen: Array<{ sessionId: string; error: Error }> = []
    c.on('error', (e) => seen.push(e))
    await vi.waitFor(() => expect(seen).toHaveLength(1))
    expect(seen[0]?.sessionId).toBe('default')
    expect(seen[0]?.error).toBeInstanceOf(Error)
    expect(seen[0]?.error.message).toBe('socket boom')
  })

  it('emits error with the configured sessionId on failure', async () => {
    makeWASocketMock.mockImplementation(() => {
      throw new Error('nope')
    })
    const c = new Client({ sessionId: 'sx', auth: new MemoryAuthStore(), qrTerminal: false })
    const seen: Array<{ sessionId: string }> = []
    c.on('error', (e) => seen.push(e))
    await vi.waitFor(() => expect(seen).toHaveLength(1))
    expect(seen[0]?.sessionId).toBe('sx')
  })

  it('auto-connect failure with no error listener does not reject unhandled', async () => {
    const rejections: unknown[] = []
    const onRejection = (err: unknown): void => {
      rejections.push(err)
    }
    process.on('unhandledRejection', onRejection)
    makeWASocketMock.mockImplementation(() => {
      throw new Error('silent boom')
    })
    const c = new Client({ auth: new MemoryAuthStore(), qrTerminal: false })
    expect(c.state).toBe('idle')
    await flushMicrotasks()
    await new Promise((r) => setTimeout(r, 10))
    process.off('unhandledRejection', onRejection)
    expect(rejections).toHaveLength(0)
  })

  it('emits error when readCreds rejects during auto-connect', async () => {
    const sock = createMockSocket({ user: { id: SELF } })
    makeWASocketMock.mockReturnValue(sock)
    const auth = new MemoryAuthStore()
    auth.creds.readCreds = vi.fn(async () => {
      throw new Error('creds read failed')
    })
    const c = new Client({ auth, qrTerminal: false })
    const seen: Array<{ error: Error }> = []
    c.on('error', (e) => seen.push(e))
    await vi.waitFor(() => expect(seen).toHaveLength(1))
    expect(seen[0]?.error.message).toBe('creds read failed')
  })
})

describe('Client auto-connect — idempotency', () => {
  it('a manual connect() racing auto-connect yields a single socket', async () => {
    const sock = createMockSocket({ user: { id: SELF } })
    makeWASocketMock.mockReturnValue(sock)
    const c = new Client({ auth: new MemoryAuthStore(), qrTerminal: false })
    const p = c.connect()
    expect(c.state).toBe('connecting')
    sock.triggerConnectionUpdate({ connection: 'open' })
    await p
    await flushMicrotasks()
    expect(makeWASocketMock).toHaveBeenCalledTimes(1)
    expect(c.state).toBe('connected')
  })

  it('auto-connect then manual connect() after connected stays a single socket', async () => {
    const sock = createMockSocket({ user: { id: SELF } })
    makeWASocketMock.mockReturnValue(sock)
    const c = new Client({ auth: new MemoryAuthStore(), qrTerminal: false })
    await vi.waitFor(() => expect(c.state).toBe('connecting'))
    sock.triggerConnectionUpdate({ connection: 'open' })
    await vi.waitFor(() => expect(c.state).toBe('connected'))
    await c.connect()
    expect(makeWASocketMock).toHaveBeenCalledTimes(1)
  })

  it('multiple instances auto-connect independently', async () => {
    const sockA = createMockSocket({ user: { id: 'a@s.whatsapp.net' } })
    const sockB = createMockSocket({ user: { id: 'b@s.whatsapp.net' } })
    let n = 0
    makeWASocketMock.mockImplementation(() => (n++ === 0 ? sockA : sockB))
    const cA = new Client({ sessionId: 'a', auth: new MemoryAuthStore(), qrTerminal: false })
    const cB = new Client({ sessionId: 'b', auth: new MemoryAuthStore(), qrTerminal: false })
    await vi.waitFor(() => expect(cA.state).toBe('connecting'))
    await vi.waitFor(() => expect(cB.state).toBe('connecting'))
    sockA.triggerConnectionUpdate({ connection: 'open' })
    sockB.triggerConnectionUpdate({ connection: 'open' })
    await vi.waitFor(() => expect(cA.state).toBe('connected'))
    await vi.waitFor(() => expect(cB.state).toBe('connected'))
    expect(makeWASocketMock).toHaveBeenCalledTimes(2)
  })
})
