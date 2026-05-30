import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createMockSocket, type MockSocket } from '../_helpers/mock-socket.js'

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
  }
})

vi.mock('../../src/connection/qr-terminal.js', async () => {
  const actual = await vi.importActual<typeof import('../../src/connection/qr-terminal.js')>(
    '../../src/connection/qr-terminal.js',
  )
  return { ...actual, printQrToTerminal: printQrMock }
})

import { Client } from '../../src/client/client.js'
import { MemoryMessageStore } from '../../src/store/adapters/memory.js'
import type { AuthStore, AuthStoreBundle } from '../../src/auth/types.js'
import type { MessageStore, ScheduledJobRecord } from '../../src/store/types.js'

const A = 'a@s.whatsapp.net'
const B = 'b@s.whatsapp.net'

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

async function connected(
  options: ConstructorParameters<typeof Client>[0] = {},
): Promise<{ client: Client; sock: MockSocket }> {
  const sock = createMockSocket({ user: { id: '628111@s.whatsapp.net', name: 'Bot' } })
  makeWASocketMock.mockReturnValue(sock)
  const client = new Client({ auth: memAuth(), autoConnect: false, qrTerminal: false, ...options })
  const p = client.connect()
  sock.triggerConnectionUpdate({ connection: 'open' })
  await p
  return { client, sock }
}

beforeEach(() => {
  makeWASocketMock.mockReset()
  initAuthCredsMock.mockClear()
  printQrMock.mockClear()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('Client automation — presence', () => {
  it('client.presence is defined', async () => {
    const { client } = await connected()
    expect(client.presence).toBeDefined()
  })

  it('online() forwards available to the socket', async () => {
    const { client, sock } = await connected()
    await client.presence.online()
    expect(sock.sendPresenceUpdate).toHaveBeenCalledWith('available')
  })

  it('offline() forwards unavailable', async () => {
    const { client, sock } = await connected()
    await client.presence.offline()
    expect(sock.sendPresenceUpdate).toHaveBeenCalledWith('unavailable')
  })

  it('typing(jid) forwards composing', async () => {
    const { client, sock } = await connected()
    await client.presence.typing(A)
    expect(sock.sendPresenceUpdate).toHaveBeenCalledWith('composing', A)
  })

  it('presence getter is cached (same instance)', async () => {
    const { client } = await connected()
    expect(client.presence).toBe(client.presence)
  })

  it('presence throws NOT_CONNECTED before connect', async () => {
    const client = new Client({ auth: memAuth(), autoConnect: false, qrTerminal: false })
    await expect(client.presence.online()).rejects.toMatchObject({ code: 'NOT_CONNECTED' })
  })
})

describe('Client automation — broadcast', () => {
  it('sends to every jid and reports them as sent', async () => {
    const { client, sock } = await connected()
    const result = await client.broadcast([A, B], (b) => b.text('hi'))
    expect(sock.sendMessage).toHaveBeenCalledTimes(2)
    expect(result.sent).toHaveLength(2)
    expect(result.failed).toHaveLength(0)
  })

  it('isolates a failing recipient', async () => {
    const { client, sock } = await connected()
    sock.sendMessage.mockImplementation(async (jid: string) => {
      if (jid === B) throw new Error('blocked')
      return { key: { remoteJid: jid, id: 'x', fromMe: true } }
    })
    const result = await client.broadcast([A, B], (b) => b.text('hi'))
    expect(result.sent).toEqual([A])
    expect(result.failed).toHaveLength(1)
    expect(result.failed[0]?.jid).toBe(B)
  })

  it('reports progress per recipient', async () => {
    const { client } = await connected()
    const onProgress = vi.fn()
    await client.broadcast([A, B], (b) => b.text('hi'), { onProgress })
    expect(onProgress).toHaveBeenCalledTimes(2)
  })

  it('empty jids resolves with empty result', async () => {
    const { client } = await connected()
    const result = await client.broadcast([], (b) => b.text('hi'))
    expect(result.sent).toHaveLength(0)
  })

  it('throws when detached', async () => {
    const client = new Client({ auth: memAuth(), autoConnect: false, qrTerminal: false })
    await expect(client.broadcast([A], (b) => b.text('hi'))).rejects.toBeTruthy()
  })
})

describe('Client automation — scheduleAt', () => {
  it('returns an id and cancel handle', async () => {
    const { client } = await connected()
    const handle = await client.scheduleAt(new Date(Date.now() + 1000), (b) => b.to(A).text('later'))
    expect(typeof handle.id).toBe('string')
    expect(typeof handle.cancel).toBe('function')
  })

  it('fires the snapshot via the socket after the delay', async () => {
    vi.useFakeTimers({ now: 0 })
    const { client, sock } = await connected()
    sock.sendMessage.mockClear()
    await client.scheduleAt(new Date(1000), (b) => b.to(A).text('later'))
    expect(sock.sendMessage).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1000)
    expect(sock.sendMessage).toHaveBeenCalledTimes(1)
    expect(sock.sendMessage.mock.calls[0]?.[0]).toBe(A)
  })

  it('cancel prevents the send', async () => {
    vi.useFakeTimers({ now: 0 })
    const { client, sock } = await connected()
    sock.sendMessage.mockClear()
    const handle = await client.scheduleAt(new Date(1000), (b) => b.to(A).text('later'))
    handle.cancel()
    await vi.advanceTimersByTimeAsync(1000)
    expect(sock.sendMessage).not.toHaveBeenCalled()
  })

  it('persists via a store that implements schedule methods', async () => {
    const saved: ScheduledJobRecord[] = []
    const store = new MemoryMessageStore() as unknown as MessageStore
    store.saveScheduledJob = vi.fn(async (j: ScheduledJobRecord) => {
      saved.push(j)
    })
    store.listScheduledJobs = vi.fn(async () => saved.slice())
    store.deleteScheduledJob = vi.fn(async () => undefined)
    const { client } = await connected({ store })
    await client.scheduleAt(new Date(Date.now() + 1000), (b) => b.to(A).text('persist'))
    expect(saved).toHaveLength(1)
    expect(saved[0]?.recipient).toBe(A)
  })
})

describe('Client automation — loadPending on connect', () => {
  it('fires an overdue persisted job when the connection opens', async () => {
    vi.useFakeTimers({ now: 5000 })
    const overdue: ScheduledJobRecord = {
      id: 'overdue-1',
      fireAt: 1000,
      recipient: A,
      payload: { recipient: A, content: { text: 'reload' } },
    }
    const store = new MemoryMessageStore() as unknown as MessageStore
    store.listScheduledJobs = vi.fn(async () => [overdue])
    store.deleteScheduledJob = vi.fn(async () => undefined)
    const { sock } = await connected({ store })
    await vi.advanceTimersByTimeAsync(0)
    expect(sock.sendMessage).toHaveBeenCalledTimes(1)
    expect(sock.sendMessage.mock.calls[0]?.[0]).toBe(A)
  })

  it('arms a future persisted job timer on connect', async () => {
    vi.useFakeTimers({ now: 0 })
    const future: ScheduledJobRecord = {
      id: 'future-1',
      fireAt: 2000,
      recipient: B,
      payload: { recipient: B, content: { text: 'soon' } },
    }
    const store = new MemoryMessageStore() as unknown as MessageStore
    store.listScheduledJobs = vi.fn(async () => [future])
    store.deleteScheduledJob = vi.fn(async () => undefined)
    const { sock } = await connected({ store })
    await vi.advanceTimersByTimeAsync(0)
    expect(sock.sendMessage).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(2000)
    expect(sock.sendMessage).toHaveBeenCalledTimes(1)
    expect(sock.sendMessage.mock.calls[0]?.[0]).toBe(B)
  })
})
