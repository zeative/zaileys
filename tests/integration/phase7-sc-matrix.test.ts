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
import type { CommandContext } from '../../src/command/index.js'

const SENDER = '628222@s.whatsapp.net'

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

const textMsg = (content: string) => ({
  key: { remoteJid: SENDER, fromMe: false, id: 'SC1' },
  messageTimestamp: 1700000000,
  pushName: 'Alice',
  message: { conversation: content },
})

const emitText = (sock: MockSocket, content: string): Promise<void> => {
  sock.ev.emit('messages.upsert', { type: 'notify', messages: [textMsg(content)] })
  return new Promise((r) => setTimeout(r, 0))
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

describe('SC#1 — prefix + arg parsing end-to-end (CMD-01, CMD-02)', () => {
  it('triggers handler with ctx.args parsed from /weather Jakarta', async () => {
    const { client, sock } = await connected({ commandPrefix: ['/', '!'] })
    let captured: CommandContext | undefined
    client.command('weather', (ctx) => {
      captured = ctx
    })
    await emitText(sock, '/weather Jakarta')
    expect(captured?.command).toBe('weather')
    expect(captured?.args).toContain('Jakarta')
  })

  it('parses quoted strings, --flags, and JSON args together', async () => {
    const { client, sock } = await connected({ commandPrefix: ['/', '!'] })
    let captured: CommandContext | undefined
    client.command('weather', (ctx) => {
      captured = ctx
    })
    await emitText(sock, '/weather Jakarta "New York" --unit metric {"a":1}')
    expect(captured?.args).toContain('Jakarta')
    expect(captured?.args).toContain('New York')
    expect(captured?.flags.unit).toBe('metric')
    expect(captured?.json).toEqual({ a: 1 })
  })

  it('dispatches via the alternate prefix !weather', async () => {
    const { client, sock } = await connected({ commandPrefix: ['/', '!'] })
    const handler = vi.fn()
    client.command('weather', handler)
    await emitText(sock, '!weather Bandung')
    expect(handler).toHaveBeenCalledTimes(1)
  })

  it('does not dispatch unprefixed text as a command', async () => {
    const { client, sock } = await connected({ commandPrefix: ['/', '!'] })
    const handler = vi.fn()
    client.command('weather', handler)
    await emitText(sock, 'weather Jakarta')
    expect(handler).not.toHaveBeenCalled()
  })
})

describe('SC#2 — middleware order + short-circuit + typed ctx (CMD-04, CMD-05)', () => {
  it('runs middleware in registration order before the handler', async () => {
    const { client, sock } = await connected({ commandPrefix: '/' })
    const order: string[] = []
    client.use(async (_c, n) => {
      order.push('mw1')
      await n()
    })
    client.use(async (_c, n) => {
      order.push('mw2')
      await n()
    })
    client.command('ping', () => order.push('handler'))
    await emitText(sock, '/ping')
    expect(order).toEqual(['mw1', 'mw2', 'handler'])
  })

  it('short-circuits the handler when a middleware skips next()', async () => {
    const { client, sock } = await connected({ commandPrefix: '/' })
    const handler = vi.fn()
    client.use(() => {
      return undefined
    })
    client.command('ping', handler)
    await emitText(sock, '/ping')
    expect(handler).not.toHaveBeenCalled()
  })

  it('exposes a typed ctx.reply that sends quoting the command message', async () => {
    const { client, sock } = await connected({ commandPrefix: '/' })
    client.command('ping', async (ctx) => {
      await ctx.reply('pong')
    })
    await emitText(sock, '/ping')
    await new Promise((r) => setTimeout(r, 0))
    const [jid, content, opts] = sock.sendMessage.mock.calls[0] as [
      string,
      Record<string, unknown>,
      Record<string, unknown>,
    ]
    expect(jid).toBe(SENDER)
    expect(content.text).toBe('pong')
    expect((opts.quoted as { id: string }).id).toBe('SC1')
  })

  it('exposes typed ctx.react and ctx.edit helpers', async () => {
    const { client, sock } = await connected({ commandPrefix: '/' })
    client.command('ping', async (ctx) => {
      await ctx.reply('first')
      await ctx.react('👍')
      await ctx.edit('edited')
    })
    await emitText(sock, '/ping')
    await new Promise((r) => setTimeout(r, 0))
    const reactCall = sock.sendMessage.mock.calls.find(
      (c) => (c[1] as { react?: unknown }).react !== undefined,
    )
    const editCall = sock.sendMessage.mock.calls.find(
      (c) => (c[1] as { edit?: unknown }).edit !== undefined,
    )
    expect((reactCall?.[1] as { react: { text: string } }).react.text).toBe('👍')
    expect((editCall?.[1] as { text: string }).text).toBe('edited')
  })
})

describe('SC#3 — sub-commands + aliases (CMD-03, CMD-06)', () => {
  it('dispatches an alias help|h|? via /h', async () => {
    const { client, sock } = await connected({ commandPrefix: '/' })
    const handler = vi.fn()
    client.command('help|h|?', handler)
    await emitText(sock, '/h')
    expect(handler).toHaveBeenCalledTimes(1)
  })

  it('dispatches the same handler via the /? alias', async () => {
    const { client, sock } = await connected({ commandPrefix: '/' })
    const handler = vi.fn()
    client.command('help|h|?', handler)
    await emitText(sock, '/?')
    expect(handler).toHaveBeenCalledTimes(1)
  })

  it('dispatches a sub-command group create with trailing args', async () => {
    const { client, sock } = await connected({ commandPrefix: '/' })
    let captured: CommandContext | undefined
    client.command('group create', (ctx) => {
      captured = ctx
    })
    await emitText(sock, '/group create X')
    expect(captured?.command).toBe('group create')
    expect(captured?.args).toEqual(['X'])
  })

  it('does not collide a sub-command with a same-prefixed bare command', async () => {
    const { client, sock } = await connected({ commandPrefix: '/' })
    const create = vi.fn()
    const group = vi.fn()
    client.command('group create', create)
    client.command('group', group)
    await emitText(sock, '/group')
    expect(group).toHaveBeenCalledTimes(1)
    expect(create).not.toHaveBeenCalled()
  })
})

describe('SC#4 — broadcast pacing + progress + retry + outcomes (AUTO-01, AUTO-02)', () => {
  const jids = (n: number): string[] => Array.from({ length: n }, (_, i) => `u${i}@s.whatsapp.net`)

  it('reaches every recipient and reports per-recipient outcomes', async () => {
    const { client, sock } = await connected()
    const targets = jids(20)
    const result = await client.broadcast(targets, (b) => b.text('hi'))
    expect(sock.sendMessage).toHaveBeenCalledTimes(20)
    expect(result.sent).toHaveLength(20)
    expect(result.failed).toHaveLength(0)
  })

  it('fires the progress callback once per recipient', async () => {
    const { client } = await connected()
    const onProgress = vi.fn()
    await client.broadcast(jids(20), (b) => b.text('hi'), { onProgress })
    expect(onProgress).toHaveBeenCalledTimes(20)
  })

  it('paces sends at rateLimitPerSec instead of firing them instantly', async () => {
    vi.useFakeTimers({ now: 0 })
    const { client, sock } = await connected()
    const run = client.broadcast(jids(20), (b) => b.text('hi'), { rateLimitPerSec: 5 })
    await vi.advanceTimersByTimeAsync(0)
    const earlyCount = sock.sendMessage.mock.calls.length
    expect(earlyCount).toBeLessThan(20)
    await vi.advanceTimersByTimeAsync(5000)
    const result = await run
    expect(result.sent).toHaveLength(20)
  })

  it('isolates a failing recipient and keeps delivering the rest', async () => {
    const { client, sock } = await connected()
    const targets = jids(20)
    sock.sendMessage.mockImplementation(async (jid: string) => {
      if (jid === 'u1@s.whatsapp.net') throw new Error('blocked')
      return { key: { remoteJid: jid, id: 'x', fromMe: true } }
    })
    const result = await client.broadcast(targets, (b) => b.text('hi'))
    expect(result.failed).toHaveLength(1)
    expect(result.failed[0]?.jid).toBe('u1@s.whatsapp.net')
    expect(result.sent).toHaveLength(19)
  })

  it('retries a transiently failing recipient per the retry policy', async () => {
    const { client, sock } = await connected()
    let attempts = 0
    sock.sendMessage.mockImplementation(async (jid: string) => {
      if (jid === 'u0@s.whatsapp.net') {
        attempts += 1
        if (attempts < 2) throw new Error('transient')
      }
      return { key: { remoteJid: jid, id: 'x', fromMe: true } }
    })
    const result = await client.broadcast(['u0@s.whatsapp.net'], (b) => b.text('hi'), {
      retry: { maxRetries: 2, backoffMs: () => 0 },
    })
    expect(attempts).toBe(2)
    expect(result.sent).toEqual(['u0@s.whatsapp.net'])
  })
})

describe('SC#5 — scheduleAt builder-callback persist + restart + presence (AUTO-03, AUTO-04, AUTO-05)', () => {
  const A = 'a@s.whatsapp.net'

  it('evaluates the builder eagerly into a serializable snapshot persisted to the store', async () => {
    const saved: ScheduledJobRecord[] = []
    const store = new MemoryMessageStore() as unknown as MessageStore
    store.saveScheduledJob = vi.fn(async (j: ScheduledJobRecord) => {
      saved.push(j)
    })
    store.listScheduledJobs = vi.fn(async () => saved.slice())
    store.deleteScheduledJob = vi.fn(async () => undefined)
    const { client } = await connected({ store })
    await client.scheduleAt(new Date(Date.now() + 1000), (b) => b.to(A).text('later'))
    expect(saved).toHaveLength(1)
    expect(saved[0]?.recipient).toBe(A)
    expect((saved[0]?.payload as { content: { text: string } }).content.text).toBe('later')
  })

  it('fires the scheduled snapshot via the socket at the configured time', async () => {
    vi.useFakeTimers({ now: 0 })
    const { client, sock } = await connected()
    sock.sendMessage.mockClear()
    await client.scheduleAt(new Date(1000), (b) => b.to(A).text('later'))
    expect(sock.sendMessage).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1000)
    expect(sock.sendMessage).toHaveBeenCalledTimes(1)
    expect(sock.sendMessage.mock.calls[0]?.[0]).toBe(A)
  })

  it('survives a restart: a fresh Client over the persisted jobs reloads and fires the job', async () => {
    vi.useFakeTimers({ now: 0 })
    const records: ScheduledJobRecord[] = []
    const bootStore = (): MessageStore => {
      const store = new MemoryMessageStore() as unknown as MessageStore
      store.saveScheduledJob = vi.fn(async (j: ScheduledJobRecord) => {
        records.push(j)
      })
      store.listScheduledJobs = vi.fn(async () => records.slice())
      store.deleteScheduledJob = vi.fn(async (id: string) => {
        const i = records.findIndex((r) => r.id === id)
        if (i !== -1) records.splice(i, 1)
      })
      return store
    }

    const first = await connected({ store: bootStore() })
    await first.client.scheduleAt(new Date(2000), (b) => b.to(A).text('survives'))
    await first.client.disconnect()
    expect(records).toHaveLength(1)

    const second = await connected({ store: bootStore() })
    second.sock.sendMessage.mockClear()
    await vi.advanceTimersByTimeAsync(2000)
    expect(second.sock.sendMessage).toHaveBeenCalledTimes(1)
    expect(second.sock.sendMessage.mock.calls[0]?.[0]).toBe(A)
  })

  it('cancel prevents a scheduled send from firing', async () => {
    vi.useFakeTimers({ now: 0 })
    const { client, sock } = await connected()
    sock.sendMessage.mockClear()
    const handle = await client.scheduleAt(new Date(1000), (b) => b.to(A).text('later'))
    handle.cancel()
    await vi.advanceTimersByTimeAsync(1000)
    expect(sock.sendMessage).not.toHaveBeenCalled()
  })

  it('presence helpers reach the socket for any jid', async () => {
    const { client, sock } = await connected()
    await client.presence.online()
    await client.presence.typing(A)
    await client.presence.recording(A)
    expect(sock.sendPresenceUpdate).toHaveBeenCalledWith('available')
    expect(sock.sendPresenceUpdate).toHaveBeenCalledWith('composing', A)
    expect(sock.sendPresenceUpdate).toHaveBeenCalledWith('recording', A)
  })
})
