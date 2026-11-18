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
import type { AuthStore, AuthStoreBundle } from '../../src/auth/types.js'
import type { ZaileysCommandError } from '../../src/command/index.js'
import type { MessageContext } from '../../src/events/context.js'

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
const OTHER = '628333@s.whatsapp.net'

let seq = 0
const inbound = (sock: MockSocket, content: string, from = SENDER): void => {
  seq += 1
  sock.ev.emit('messages.upsert', {
    type: 'notify',
    messages: [
      {
        key: { remoteJid: from, fromMe: false, id: `IN${seq}` },
        messageTimestamp: 1700000000,
        pushName: 'Alice',
        message: { conversation: content },
      },
    ],
  })
}

const sentTexts = (sock: MockSocket): string[] =>
  sock.sendMessage.mock.calls
    .map((c) => (c[1] as { text?: unknown }).text)
    .filter((t): t is string => typeof t === 'string')

const silentLogger = () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(), fatal: vi.fn() })

async function connected(): Promise<{ client: Client; sock: MockSocket; logger: ReturnType<typeof silentLogger> }> {
  const sock = createMockSocket({ user: { id: '628111@s.whatsapp.net', name: 'Bot' } })
  makeWASocketMock.mockReturnValue(sock)
  const logger = silentLogger()
  const client = new Client({
    auth: memAuth(),
    autoConnect: false,
    qrTerminal: false,
    statusLog: false,
    commandPrefix: '/',
    logger,
  })
  const p = client.connect()
  sock.triggerConnectionUpdate({ connection: 'open' })
  await p
  return { client, sock, logger }
}

beforeEach(() => {
  makeWASocketMock.mockReset()
  initAuthCredsMock.mockClear()
  printQrMock.mockClear()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('Client ctx.ask — multi-step conversation', () => {
  it('asks two questions and collects both answers', async () => {
    const { client, sock } = await connected()
    const answers: string[] = []
    client.command('daftar', async (ctx) => {
      const name = await ctx.ask('Nama kamu?')
      answers.push(name.text)
      const age = await ctx.ask('Umur?', { filter: (m) => /^\d+$/.test(m.text) })
      answers.push(age.text)
      await ctx.reply(`Terdaftar: ${name.text}, ${age.text}`)
    })

    inbound(sock, '/daftar')
    await vi.waitFor(() => expect(sentTexts(sock)).toEqual(['Nama kamu?']))
    inbound(sock, 'Budi')
    await vi.waitFor(() => expect(sentTexts(sock)).toEqual(['Nama kamu?', 'Umur?']))
    inbound(sock, 'dua puluh')
    inbound(sock, '20')
    await vi.waitFor(() => expect(sentTexts(sock)).toContain('Terdaftar: Budi, 20'))
    expect(answers).toEqual(['Budi', '20'])
  })

  it('quotes the command message when it asks', async () => {
    const { client, sock } = await connected()
    client.command('daftar', async (ctx) => {
      await ctx.ask('Nama kamu?')
    })
    inbound(sock, '/daftar')
    await vi.waitFor(() => expect(sock.sendMessage).toHaveBeenCalled())
    const [jid, , opts] = sock.sendMessage.mock.calls[0] as [string, unknown, { quoted: { key: { id: string } } }]
    expect(jid).toBe(SENDER)
    expect(opts.quoted.key.id).toBe(`IN${seq}`)
  })

  it('only accepts the answer from the user who ran the command', async () => {
    const { client, sock } = await connected()
    let answer: MessageContext | undefined
    client.command('daftar', async (ctx) => {
      answer = await ctx.ask('Nama kamu?')
    })
    inbound(sock, '/daftar')
    await vi.waitFor(() => expect(sentTexts(sock)).toEqual(['Nama kamu?']))
    inbound(sock, 'Mallory', OTHER)
    inbound(sock, 'Budi')
    await vi.waitFor(() => expect(answer?.text).toBe('Budi'))
  })
})

describe('Client ctx.ask — answers are not commands', () => {
  it('does not dispatch a prefixed answer as a command, but text listeners still get it', async () => {
    const { client, sock } = await connected()
    const runs = vi.fn()
    const texts: string[] = []
    let answer: string | undefined
    client.on('text', (m) => texts.push(m.text))
    client.command('daftar', async (ctx) => {
      runs()
      answer = (await ctx.ask('Ketik /daftar lagi untuk konfirmasi')).text
    })

    inbound(sock, '/daftar')
    await vi.waitFor(() => expect(sentTexts(sock)).toHaveLength(1))
    inbound(sock, '/daftar')
    await vi.waitFor(() => expect(answer).toBe('/daftar'))
    expect(runs).toHaveBeenCalledTimes(1)
    expect(texts).toEqual(['/daftar', '/daftar'])
  })

  it('runs a command the filter rejected as an answer', async () => {
    const { client, sock } = await connected()
    const help = vi.fn()
    client.command('help', help)
    client.command('daftar', async (ctx) => {
      await ctx.ask('Umur?', { filter: (m) => /^\d+$/.test(m.text) })
    })
    inbound(sock, '/daftar')
    await vi.waitFor(() => expect(sentTexts(sock)).toHaveLength(1))
    inbound(sock, '/help')
    await vi.waitFor(() => expect(help).toHaveBeenCalledTimes(1))
  })
})

describe('Client ctx.ask — timeout', () => {
  it('ends the command silently and sends timeoutMessage', async () => {
    const { client, sock, logger } = await connected()
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] })
    const commandError = vi.fn()
    const after = vi.fn()
    client.on('command-error', commandError)
    client.command('daftar', async (ctx) => {
      await ctx.ask('Nama kamu?', { timeout: 30_000, timeoutMessage: 'Waktu habis, ketik /daftar lagi.' })
      after()
    })

    inbound(sock, '/daftar')
    await vi.waitFor(() => expect(sentTexts(sock)).toEqual(['Nama kamu?']))
    await vi.advanceTimersByTimeAsync(30_000)
    await vi.waitFor(() => expect(sentTexts(sock)).toEqual(['Nama kamu?', 'Waktu habis, ketik /daftar lagi.']))
    expect(after).not.toHaveBeenCalled()
    expect(commandError).not.toHaveBeenCalled()
    expect(logger.error).not.toHaveBeenCalled()
  })

  it('times out after 60 seconds by default and sends nothing more without timeoutMessage', async () => {
    const { client, sock, logger } = await connected()
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] })
    let code: string | undefined
    client.command('daftar', async (ctx) => {
      try {
        await ctx.ask('Nama kamu?')
      } catch (err) {
        code = (err as ZaileysCommandError).code
        throw err
      }
    })
    inbound(sock, '/daftar')
    await vi.waitFor(() => expect(sentTexts(sock)).toHaveLength(1))
    expect(code).toBeUndefined()
    await vi.advanceTimersByTimeAsync(60_000)
    expect(code).toBe('ASK_TIMEOUT')
    expect(sentTexts(sock)).toHaveLength(1)
    expect(logger.error).not.toHaveBeenCalled()
  })
})

describe('Client waitForMessage — lifecycle', () => {
  it('resolves with the next message in the chat without any command', async () => {
    const { client, sock } = await connected()
    const wait = client.waitForMessage({ chat: SENDER, from: SENDER })
    inbound(sock, 'halo')
    await expect(wait).resolves.toMatchObject({ text: 'halo', senderId: SENDER })
  })

  it('disconnect cancels a pending ctx.ask quietly', async () => {
    const { client, sock, logger } = await connected()
    let code: string | undefined
    client.command('daftar', async (ctx) => {
      try {
        await ctx.ask('Nama kamu?')
      } catch (err) {
        code = (err as ZaileysCommandError).code
        throw err
      }
    })
    inbound(sock, '/daftar')
    await vi.waitFor(() => expect(sentTexts(sock)).toHaveLength(1))
    await client.disconnect()
    await vi.waitFor(() => expect(code).toBe('ASK_CANCELLED'))
    expect(logger.error).not.toHaveBeenCalled()
  })

  it('disconnect rejects a pending waitForMessage with ASK_CANCELLED', async () => {
    const { client } = await connected()
    const wait = client.waitForMessage({ chat: SENDER })
    await client.disconnect()
    await expect(wait).rejects.toMatchObject({ code: 'ASK_CANCELLED' })
  })

  it('rejects ASK_CANCELLED at once after disconnect', async () => {
    const { client } = await connected()
    await client.disconnect()
    await expect(client.waitForMessage({ chat: SENDER })).rejects.toMatchObject({ code: 'ASK_CANCELLED' })
  })

  it('a newer ctx.ask from the same user supersedes the older one', async () => {
    const { client, sock } = await connected()
    const codes: string[] = []
    const answers: string[] = []
    client.command('daftar', async (ctx) => {
      try {
        answers.push((await ctx.ask('Nama kamu?', { filter: (m) => !m.text.startsWith('/') })).text)
      } catch (err) {
        codes.push((err as ZaileysCommandError).code)
        throw err
      }
    })
    client.command('ulang', async (ctx) => {
      answers.push((await ctx.ask('Nama baru?')).text)
    })
    inbound(sock, '/daftar')
    await vi.waitFor(() => expect(sentTexts(sock)).toHaveLength(1))
    inbound(sock, '/ulang')
    await vi.waitFor(() => expect(codes).toEqual(['ASK_CANCELLED']))
    await vi.waitFor(() => expect(sentTexts(sock)).toHaveLength(2))
    inbound(sock, 'Budi')
    await vi.waitFor(() => expect(answers).toEqual(['Budi']))
  })
})
