import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Client } from '../../src/client/client.js'
import { MemoryAuthStore } from '../../src/auth/adapters/memory.js'
import { resetCooldowns } from '../../src/command/guards.js'
import type { MessageContext } from '../../src/events/context.js'

const SELF = '628SELF@s.whatsapp.net'
const SENDER = '628111@s.whatsapp.net'
const GROUP = '120@g.us'

const msg = (text: string, isGroup: boolean): MessageContext =>
  ({
    text,
    senderId: SENDER,
    roomId: isGroup ? GROUP : SENDER,
    isGroup,
    message: () => ({ key: { remoteJid: isGroup ? GROUP : SENDER, id: 'M1', fromMe: false } }),
  }) as unknown as MessageContext

const connected = () => {
  const client = new Client({
    auth: new MemoryAuthStore(),
    qrTerminal: false,
    autoConnect: false,
    commandPrefix: '!',
  })
  ;(client as unknown as { _socket: unknown })._socket = { user: { id: SELF } }
  return client
}

/** Fires a text message through the real dispatcher and waits for the async guard chain. */
const send = async (client: Client, text: string, isGroup = true): Promise<void> => {
  client.emit('text', msg(text, isGroup))
  await new Promise((r) => setTimeout(r, 10))
}

describe('command guards through the client', () => {
  beforeEach(() => resetCooldowns())

  it('runs a command whose guards all pass', async () => {
    const client = connected()
    const run = vi.fn()
    client.command({ name: 'ping', group: true }, run)
    await send(client, '!ping')
    expect(run).toHaveBeenCalledTimes(1)
  })

  it('blocks a group-only command in a DM and emits command-blocked instead', async () => {
    const client = connected()
    const run = vi.fn()
    const blocked = vi.fn()
    client.on('command-blocked', blocked)
    client.command({ name: 'kick', group: true }, run)
    await send(client, '!kick', false)
    expect(run).not.toHaveBeenCalled()
    expect(blocked).toHaveBeenCalledTimes(1)
    expect(blocked.mock.calls[0]![0]).toMatchObject({ command: 'kick', reason: 'group-only' })
  })

  it('reports the remaining wait when a cooldown blocks the call', async () => {
    const client = connected()
    const run = vi.fn()
    const blocked = vi.fn()
    client.on('command-blocked', blocked)
    client.command({ name: 'spam', cooldown: 60 }, run)
    await send(client, '!spam')
    await send(client, '!spam')
    expect(run).toHaveBeenCalledTimes(1)
    const payload = blocked.mock.calls[0]![0] as { reason: string; retryIn: number }
    expect(payload.reason).toBe('cooldown')
    expect(payload.retryIn).toBeGreaterThan(0)
  })

  it('blocks an admin-only command when the group cannot be read', async () => {
    const client = connected()
    const run = vi.fn()
    const blocked = vi.fn()
    client.on('command-blocked', blocked)
    client.command({ name: 'promote', admin: true }, run)
    await send(client, '!promote')
    expect(run).not.toHaveBeenCalled()
    expect(blocked.mock.calls[0]![0]).toMatchObject({ reason: 'admin-only' })
  })

  it('still runs a plain string command, which has no guards', async () => {
    const client = connected()
    const run = vi.fn()
    client.command('hello', run)
    await send(client, '!hello', false)
    expect(run).toHaveBeenCalledTimes(1)
  })

  it('lists registered commands for a menu', () => {
    const client = connected()
    client.command({ name: 'ping', description: 'Cek bot', category: 'info' }, vi.fn())
    client.command({ name: 'kick', description: 'Keluarkan', category: 'group', hidden: true }, vi.fn())
    expect(client.commands()).toEqual([
      { name: 'ping', aliases: [], description: 'Cek bot', category: 'info' },
      { name: 'kick', aliases: [], description: 'Keluarkan', category: 'group', hidden: true },
    ])
  })

  it('returns an empty list before any command is registered', () => {
    expect(connected().commands()).toEqual([])
  })
})

describe('command-error', () => {
  it('hands a throwing handler to the listener', async () => {
    const client = connected()
    const seen = vi.fn()
    client.on('command-error', seen)
    client.command('boom', () => {
      throw new Error('kaboom')
    })
    await send(client, '!boom')
    expect(seen).toHaveBeenCalledTimes(1)
    expect(seen.mock.calls[0]![0]).toMatchObject({ command: 'boom' })
  })

  it('catches a rejected async handler too', async () => {
    const client = connected()
    const seen = vi.fn()
    client.on('command-error', seen)
    client.command('boom', async () => {
      await Promise.reject(new Error('kaboom'))
    })
    await send(client, '!boom')
    expect(seen).toHaveBeenCalledTimes(1)
  })

  it('keeps the bot alive when nothing is listening', async () => {
    const client = connected()
    const after = vi.fn()
    client.command('boom', () => {
      throw new Error('kaboom')
    })
    client.command('ok', after)
    await send(client, '!boom')
    await send(client, '!ok')
    expect(after).toHaveBeenCalledTimes(1)
  })
})

describe('command-not-found', () => {
  it('reports a prefixed message that matches nothing', async () => {
    const client = connected()
    const seen = vi.fn()
    client.on('command-not-found', seen)
    client.command('ping', vi.fn())
    await send(client, '!nope')
    expect(seen).toHaveBeenCalledTimes(1)
    expect(seen.mock.calls[0]![0]).toMatchObject({ command: 'nope' })
  })

  it('stays quiet for a command that does exist', async () => {
    const client = connected()
    const seen = vi.fn()
    client.on('command-not-found', seen)
    client.command('ping', vi.fn())
    await send(client, '!ping')
    expect(seen).not.toHaveBeenCalled()
  })

  it('ignores a message with no prefix at all', async () => {
    const client = connected()
    const seen = vi.fn()
    client.on('command-not-found', seen)
    client.command('ping', vi.fn())
    await send(client, 'halo apa kabar')
    expect(seen).not.toHaveBeenCalled()
  })
})
