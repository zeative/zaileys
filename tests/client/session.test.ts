import { beforeEach, describe, expect, it, vi } from 'vitest'
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

const GROUP = '120363000000000001@g.us'
const PN = '628222@s.whatsapp.net'

const deliver = (sock: MockSocket, key: Record<string, unknown>, content: string): Promise<void> => {
  sock.ev.emit('messages.upsert', {
    type: 'notify',
    messages: [{ key, messageTimestamp: 1700000000, pushName: 'Alice', message: { conversation: content } }],
  })
  return new Promise((r) => setTimeout(r, 0))
}

async function connected(
  options: ConstructorParameters<typeof Client>[0] = {},
): Promise<{ client: Client; sock: MockSocket }> {
  const sock = createMockSocket({ user: { id: '628111@s.whatsapp.net', name: 'Bot' } })
  makeWASocketMock.mockReturnValue(sock)
  const client = new Client({ auth: memAuth(), autoConnect: false, qrTerminal: false, commandPrefix: '/', ...options })
  const p = client.connect()
  sock.triggerConnectionUpdate({ connection: 'open' })
  await p
  return { client, sock }
}

const loggerWith = (warn: (...args: unknown[]) => void) => ({
  debug: vi.fn(),
  info: vi.fn(),
  warn,
  error: vi.fn(),
  fatal: vi.fn(),
})

beforeEach(() => {
  makeWASocketMock.mockReset()
  initAuthCredsMock.mockClear()
  printQrMock.mockClear()
})

describe('ctx.session', () => {
  it('remembers a value for the sender across commands, in the message store', async () => {
    const store = new MemoryMessageStore()
    const { client, sock } = await connected({ store })
    const seen: unknown[] = []
    client.command('setlang', async (ctx) => {
      await ctx.session.set('lang', ctx.args[0])
    })
    client.command('lang', async (ctx) => {
      seen.push(await ctx.session.get<string>('lang'))
    })
    await deliver(sock, { remoteJid: PN, fromMe: false, id: 'S1' }, '/setlang id')
    await vi.waitFor(async () => expect(await store.getSessionValue(PN, 'lang')).toBe('id'))
    await deliver(sock, { remoteJid: PN, fromMe: false, id: 'S2' }, '/lang')
    await vi.waitFor(() => expect(seen).toEqual(['id']))
  })

  it('shares one scope across the sender’s devices and between a group and a DM', async () => {
    const { client, sock } = await connected()
    const seen: unknown[] = []
    client.command('remember', async (ctx) => {
      await ctx.session.set('note', 'from-group')
    })
    client.command('recall', async (ctx) => {
      seen.push(await ctx.session.get('note'))
    })
    await deliver(sock, { remoteJid: GROUP, participant: '628222:7@s.whatsapp.net', fromMe: false, id: 'G1' }, '/remember')
    await vi.waitFor(async () => expect(await client.session(PN).get('note')).toBe('from-group'))
    await deliver(sock, { remoteJid: '628222:3@s.whatsapp.net', fromMe: false, id: 'D1' }, '/recall')
    await vi.waitFor(() => expect(seen).toEqual(['from-group']))
  })

  it('gives a LID-only sender its own scope, never merged with a phone number', async () => {
    const { client, sock } = await connected()
    await client.session(PN).set('note', 'phone')
    const seen: unknown[] = []
    client.command('recall', async (ctx) => {
      seen.push(ctx.senderId, await ctx.session.get('note'))
    })
    await deliver(sock, { remoteJid: '628222@lid', fromMe: false, id: 'L1' }, '/recall')
    await vi.waitFor(() => expect(seen).toEqual(['628222@lid', undefined]))
  })
})

describe('client.session(jid)', () => {
  it('accepts a phone number and reaches the same values as the JID', async () => {
    const { client } = await connected()
    await client.session('+62 822-2').set('tier', 'gold')
    await expect(client.session(PN).get('tier')).resolves.toBe('gold')
    await client.session(PN).clear()
    await expect(client.session('628222').get('tier')).resolves.toBeUndefined()
  })

  it('falls back to memory for a store without session methods and warns once', async () => {
    class LegacyStore extends MemoryMessageStore {}
    const store = Object.assign(new LegacyStore(), {
      getSessionValue: undefined,
      setSessionValue: undefined,
      deleteSessionValue: undefined,
      clearSession: undefined,
    })
    const warn = vi.fn()
    const { client } = await connected({ store, logger: loggerWith(warn) })
    await client.session(PN).set('lang', 'id')
    await expect(client.session(PN).get('lang')).resolves.toBe('id')
    await client.session('628333@s.whatsapp.net').get('lang')
    const sessionWarnings = warn.mock.calls.filter((call) => String(call[1]).includes('session methods'))
    expect(sessionWarnings).toHaveLength(1)
    expect(String(sessionWarnings[0]?.[1])).toContain('LegacyStore')
  })
})
