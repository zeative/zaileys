import { afterEach, describe, expect, it, vi } from 'vitest'
import { Client } from '../../src/client/client.js'
import { MemoryAuthStore } from '../../src/auth/adapters/memory.js'
import type { ClientOptions } from '../../src/client/types.js'
import type { MessageContext } from '../../src/events/context.js'

const SELF = '628SELF@s.whatsapp.net'
const SPAMMER = '628111@s.whatsapp.net'
const NORMAL = '628222@s.whatsapp.net'

const msg = (text: string, sender: string): MessageContext =>
  ({
    text,
    senderId: sender,
    roomId: sender,
    isGroup: false,
    message: () => ({ key: { remoteJid: sender, id: 'M1', fromMe: false }, message: { conversation: text } }),
  }) as unknown as MessageContext

const connected = (options: Partial<ClientOptions> = {}) => {
  const sendMessage = vi.fn(async (jid: string) => ({ key: { remoteJid: jid, id: 'OUT', fromMe: true } }))
  const client = new Client({
    auth: new MemoryAuthStore(),
    qrTerminal: false,
    autoConnect: false,
    commandPrefix: '!',
    ...options,
  })
  ;(client as unknown as { _socket: unknown })._socket = { user: { id: SELF }, sendMessage }
  return { client, sendMessage }
}

const send = async (client: Client, text: string, sender = SPAMMER, times = 1): Promise<void> => {
  for (let i = 0; i < times; i += 1) client.emit('message', msg(text, sender))
  await new Promise((r) => setTimeout(r, 10))
}

const sentTexts = (sendMessage: ReturnType<typeof connected>['sendMessage']): string[] =>
  sendMessage.mock.calls.map((call) => ((call as unknown[])[1] as { text?: string }).text ?? '')

describe('command flood guard through the client', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('blocks the 21st command from one sender within a minute with reason flood', async () => {
    const { client } = connected()
    const run = vi.fn()
    const blocked = vi.fn()
    client.on('command-blocked', blocked)
    client.command('ping', run)
    await send(client, '!ping', SPAMMER, 21)
    expect(run).toHaveBeenCalledTimes(20)
    expect(blocked).toHaveBeenCalledTimes(1)
    const payload = blocked.mock.calls[0]![0] as { command: string; reason: string; retryIn: number }
    expect(payload).toMatchObject({ command: 'ping', reason: 'flood' })
    expect(payload.retryIn).toBeGreaterThan(0)
    expect(payload.retryIn).toBeLessThanOrEqual(60)
  })

  it('counts every command, not each command separately', async () => {
    const { client } = connected({ commandFlood: { maxCommands: 2 } })
    const ping = vi.fn()
    const menu = vi.fn()
    client.command('ping', ping)
    client.command('menu', menu)
    await send(client, '!ping')
    await send(client, '!menu')
    await send(client, '!ping')
    expect(ping).toHaveBeenCalledTimes(1)
    expect(menu).toHaveBeenCalledTimes(1)
  })

  it('sends the notice once however long the flood lasts', async () => {
    const { client, sendMessage } = connected({ commandFlood: { maxCommands: 2, notice: 'Too many commands' } })
    client.command('ping', vi.fn())
    await send(client, '!ping', SPAMMER, 10)
    expect(sentTexts(sendMessage)).toEqual(['Too many commands'])
  })

  it('stays silent by default', async () => {
    const { client, sendMessage } = connected({ commandFlood: { maxCommands: 1 } })
    client.command('ping', vi.fn())
    await send(client, '!ping', SPAMMER, 5)
    expect(sendMessage).not.toHaveBeenCalled()
  })

  it('lets the sender run commands again after the window', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(0)
    const { client, sendMessage } = connected({ commandFlood: { maxCommands: 1, windowMs: 5_000, notice: 'wait' } })
    const run = vi.fn()
    client.command('ping', run)
    await send(client, '!ping', SPAMMER, 3)
    vi.setSystemTime(5_000)
    await send(client, '!ping', SPAMMER, 3)
    expect(run).toHaveBeenCalledTimes(2)
    expect(sentTexts(sendMessage)).toEqual(['wait', 'wait'])
  })

  it('runs every command when commandFlood is false', async () => {
    const { client } = connected({ commandFlood: false })
    const run = vi.fn()
    const blocked = vi.fn()
    client.on('command-blocked', blocked)
    client.command('ping', run)
    await send(client, '!ping', SPAMMER, 100)
    expect(run).toHaveBeenCalledTimes(100)
    expect(blocked).not.toHaveBeenCalled()
  })

  it('leaves a normal user alone while another sender floods', async () => {
    const { client } = connected()
    const seen: string[] = []
    client.command('ping', (ctx) => {
      seen.push(ctx.senderId)
    })
    await send(client, '!ping', SPAMMER, 50)
    await send(client, '!ping', NORMAL, 3)
    expect(seen.filter((s) => s === SPAMMER)).toHaveLength(20)
    expect(seen.filter((s) => s === NORMAL)).toHaveLength(3)
  })

  it('never touches messages that are not commands', async () => {
    const { client } = connected({ commandFlood: { maxCommands: 1 } })
    const onMessage = vi.fn()
    client.on('message', onMessage)
    client.command('ping', vi.fn())
    await send(client, '!ping', SPAMMER, 3)
    await send(client, 'just chatting', SPAMMER, 5)
    expect(onMessage).toHaveBeenCalledTimes(8)
  })

  it('throws INVALID_OPTIONS from the constructor for a bad limit', () => {
    expect(() => connected({ commandFlood: { maxCommands: 0 } })).toThrow(
      expect.objectContaining({ code: 'INVALID_OPTIONS', name: 'ZaileysCommandError' }),
    )
    expect(() => connected({ commandFlood: { windowMs: Number.NaN } })).toThrow(/commandFlood\.windowMs/)
  })
})
