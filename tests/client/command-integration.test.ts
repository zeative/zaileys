import { describe, expect, it, vi, beforeEach } from 'vitest'
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
import type { AuthStore, AuthStoreBundle } from '../../src/auth/types.js'
import type { CommandContext } from '../../src/command/index.js'

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

const SENDER = '628222@s.whatsapp.net'

const textMsg = (content: string) => ({
  key: { remoteJid: SENDER, fromMe: false, id: 'CMD1' },
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

describe('Client command framework — dispatch', () => {
  it('dispatches a registered command on inbound text', async () => {
    const { client, sock } = await connected({ commandPrefix: '/' })
    const handler = vi.fn()
    client.command('ping', handler)
    await emitText(sock, '/ping')
    expect(handler).toHaveBeenCalledTimes(1)
  })

  it('parses positional args into ctx.args', async () => {
    const { client, sock } = await connected({ commandPrefix: '/' })
    const handler = vi.fn()
    client.command('weather', handler)
    await emitText(sock, '/weather Jakarta')
    const ctx = handler.mock.calls[0]?.[0] as CommandContext
    expect(ctx.args).toEqual(['Jakarta'])
    expect(ctx.command).toBe('weather')
  })

  it('command() is chainable', async () => {
    const { client } = await connected({ commandPrefix: '/' })
    expect(client.command('a', vi.fn())).toBe(client)
  })

  it('use() is chainable', async () => {
    const { client } = await connected({ commandPrefix: '/' })
    expect(client.use(async (_c, n) => n())).toBe(client)
  })

  it('supports an array of prefixes', async () => {
    const { client, sock } = await connected({ commandPrefix: ['/', '!'] })
    const handler = vi.fn()
    client.command('hi', handler)
    await emitText(sock, '!hi')
    await emitText(sock, '/hi')
    expect(handler).toHaveBeenCalledTimes(2)
  })

  it('dispatches a sub-command', async () => {
    const { client, sock } = await connected({ commandPrefix: '/' })
    const handler = vi.fn()
    client.command('group create', handler)
    await emitText(sock, '/group create Team')
    const ctx = handler.mock.calls[0]?.[0] as CommandContext
    expect(ctx.command).toBe('group create')
    expect(ctx.args).toEqual(['Team'])
  })

  it('registers commands before connect and dispatches after open', async () => {
    const sock = createMockSocket({ user: { id: '628111@s.whatsapp.net' } })
    makeWASocketMock.mockReturnValue(sock)
    const client = new Client({ auth: memAuth(), autoConnect: false, qrTerminal: false, commandPrefix: '/' })
    const handler = vi.fn()
    client.command('early', handler)
    const p = client.connect()
    sock.triggerConnectionUpdate({ connection: 'open' })
    await p
    await emitText(sock, '/early')
    expect(handler).toHaveBeenCalledTimes(1)
  })
})

describe('Client command framework — additive', () => {
  it('non-command text still fires on(text) listeners', async () => {
    const { client, sock } = await connected({ commandPrefix: '/' })
    const onText = vi.fn()
    client.on('text', onText)
    client.command('ping', vi.fn())
    await emitText(sock, 'hello there')
    expect(onText).toHaveBeenCalledTimes(1)
  })

  it('command text also fires on(text) listeners (non-consuming)', async () => {
    const { client, sock } = await connected({ commandPrefix: '/' })
    const onText = vi.fn()
    client.on('text', onText)
    client.command('ping', vi.fn())
    await emitText(sock, '/ping')
    expect(onText).toHaveBeenCalledTimes(1)
  })

  it('without commandPrefix, /ping does not fire the handler', async () => {
    const { client, sock } = await connected({})
    const handler = vi.fn()
    client.command('ping', handler)
    await emitText(sock, '/ping')
    expect(handler).not.toHaveBeenCalled()
  })

  it('without commandPrefix, on(text) still fires for command-like text', async () => {
    const { client, sock } = await connected({})
    const onText = vi.fn()
    client.on('text', onText)
    client.command('ping', vi.fn())
    await emitText(sock, '/ping')
    expect(onText).toHaveBeenCalledTimes(1)
  })
})

describe('Client command framework — middleware', () => {
  it('runs middleware before the handler', async () => {
    const { client, sock } = await connected({ commandPrefix: '/' })
    const order: string[] = []
    client.use(async (_c, n) => {
      order.push('mw')
      await n()
    })
    client.command('ping', () => order.push('handler'))
    await emitText(sock, '/ping')
    expect(order).toEqual(['mw', 'handler'])
  })

  it('short-circuits the handler when middleware skips next()', async () => {
    const { client, sock } = await connected({ commandPrefix: '/' })
    const handler = vi.fn()
    client.use(() => {
      /* no next */
    })
    client.command('ping', handler)
    await emitText(sock, '/ping')
    expect(handler).not.toHaveBeenCalled()
  })
})

describe('Client command framework — ctx helpers', () => {
  it('ctx.reply sends text quoting the command message', async () => {
    const { client, sock } = await connected({ commandPrefix: '/' })
    client.command('ping', async (ctx) => {
      await ctx.reply('pong')
    })
    await emitText(sock, '/ping')
    await new Promise((r) => setTimeout(r, 0))
    expect(sock.sendMessage).toHaveBeenCalled()
    const [jid, content, opts] = sock.sendMessage.mock.calls[0] as [string, Record<string, unknown>, Record<string, unknown>]
    expect(jid).toBe(SENDER)
    expect(content.text).toBe('pong')
    expect((opts.quoted as { id: string }).id).toBe('CMD1')
  })

  it('ctx.react reacts to the command message key', async () => {
    const { client, sock } = await connected({ commandPrefix: '/' })
    client.command('ping', async (ctx) => {
      await ctx.react('👍')
    })
    await emitText(sock, '/ping')
    await new Promise((r) => setTimeout(r, 0))
    const reactionCall = sock.sendMessage.mock.calls.find(
      (c) => (c[1] as { react?: unknown }).react !== undefined,
    )
    expect(reactionCall).toBeDefined()
    const react = (reactionCall?.[1] as { react: { text: string; key: { id: string } } }).react
    expect(react.text).toBe('👍')
    expect(react.key.id).toBe('CMD1')
  })

  it('ctx.edit edits the prior ctx.reply message', async () => {
    const { client, sock } = await connected({ commandPrefix: '/' })
    client.command('ping', async (ctx) => {
      await ctx.reply('first')
      await ctx.edit('edited')
    })
    await emitText(sock, '/ping')
    await new Promise((r) => setTimeout(r, 0))
    const editCall = sock.sendMessage.mock.calls.find(
      (c) => (c[1] as { edit?: unknown }).edit !== undefined,
    )
    expect(editCall).toBeDefined()
    expect((editCall?.[1] as { text: string }).text).toBe('edited')
  })

  it('ctx.edit without a prior reply throws NO_SENT_MESSAGE (logged, not crashing)', async () => {
    const errorLog = vi.fn()
    const logger = { debug() {}, info() {}, warn() {}, error: errorLog, fatal() {} }
    const { client, sock } = await connected({ commandPrefix: '/', logger })
    client.command('ping', async (ctx) => {
      await ctx.edit('no prior reply')
    })
    await emitText(sock, '/ping')
    await new Promise((r) => setTimeout(r, 0))
    expect(errorLog).toHaveBeenCalled()
  })

  it('each dispatch gets a fresh lastSentKey (no cross-invocation bleed)', async () => {
    const { client, sock } = await connected({ commandPrefix: '/' })
    let threw = false
    client.command('ping', async (ctx) => {
      try {
        await ctx.edit('x')
      } catch {
        threw = true
      }
    })
    client.command('greet', async (ctx) => {
      await ctx.reply('hi')
    })
    await emitText(sock, '/greet')
    await new Promise((r) => setTimeout(r, 0))
    await emitText(sock, '/ping')
    await new Promise((r) => setTimeout(r, 0))
    expect(threw).toBe(true)
  })
})
