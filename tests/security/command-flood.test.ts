import { describe, expect, it, vi } from 'vitest'
import { MemoryAuthStore } from '../../src/auth/adapters/memory.js'
import { Client } from '../../src/client/client.js'
import { FloodGuard } from '../../src/command/flood-guard.js'
import type { MessageContext } from '../../src/events/context.js'

const ATTACKER = '628111@s.whatsapp.net'
const VICTIM = '628222@s.whatsapp.net'
const GROUP = '120@g.us'

const groupMsg = (text: string, sender: string): MessageContext =>
  ({
    text,
    senderId: sender,
    roomId: GROUP,
    isGroup: true,
    message: () => ({ key: { remoteJid: GROUP, id: 'M1', fromMe: false, participant: sender } }),
  }) as unknown as MessageContext

describe('command flood from one sender', () => {
  it('never blocks another sender in the same group', async () => {
    const client = new Client({
      auth: new MemoryAuthStore(),
      qrTerminal: false,
      autoConnect: false,
      commandPrefix: '!',
    })
    ;(client as unknown as { _socket: unknown })._socket = { user: { id: '628SELF@s.whatsapp.net' } }
    const ran: string[] = []
    const blocked: string[] = []
    client.command('ping', (ctx) => {
      ran.push(ctx.senderId)
    })
    client.on('command-blocked', ({ ctx }) => blocked.push(ctx.senderId))
    for (let i = 0; i < 1_000; i += 1) client.emit('message', groupMsg('!ping', ATTACKER))
    client.emit('message', groupMsg('!ping', VICTIM))
    await new Promise((r) => setTimeout(r, 20))
    expect(ran.filter((s) => s === ATTACKER)).toHaveLength(20)
    expect(ran.filter((s) => s === VICTIM)).toHaveLength(1)
    expect(blocked.every((s) => s === ATTACKER)).toBe(true)
  })

  it('cannot reset its budget by rotating device suffixes', () => {
    const guard = new FloodGuard({ maxCommands: 5 })
    let allowed = 0
    for (let device = 0; device < 100; device += 1) {
      if (guard.take(`628111:${device}@s.whatsapp.net`, 0) === null) allowed += 1
    }
    expect(allowed).toBe(5)
  })

  it('cannot exhaust memory by spraying fresh sender ids', () => {
    const guard = new FloodGuard()
    for (let i = 0; i < 50_000; i += 1) guard.take(`${i}@lid`, 0)
    expect(guard.size).toBeLessThanOrEqual(10_000)
  })

  it('cannot get the notice sent more than once per window', () => {
    const guard = new FloodGuard({ maxCommands: 1, notice: 'stop' })
    const notices = vi.fn()
    for (let i = 0; i < 500; i += 1) {
      if (guard.take(ATTACKER, i)?.notice !== undefined) notices()
    }
    expect(notices).toHaveBeenCalledTimes(1)
  })
})
