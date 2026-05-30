import { describe, expect, it } from 'vitest'
import { Client } from '../../src/client/client.js'
import { ZaileysBuilderError } from '../../src/builder/index.js'
import { MemoryAuthStore } from '../../src/auth/adapters/memory.js'
import { createMockSocket, type MockSocket } from '../_helpers/mock-socket.js'

const JID = 'alice@s.whatsapp.net'

const makeClient = (): Client =>
  new Client({ auth: new MemoryAuthStore(), qrTerminal: false, autoConnect: false })

const connected = (): { c: Client; sock: MockSocket } => {
  const c = makeClient()
  const sock = createMockSocket()
  ;(c as unknown as { _socket: unknown })._socket = sock
  return { c, sock }
}

describe('GRP-12: client.send username resolution', () => {
  it('resolves a username to a JID via onWhatsApp before dispatch', async () => {
    const { c, sock } = connected()
    sock.onWhatsApp.mockResolvedValueOnce([{ jid: JID, exists: true }])
    await c.send('alice').text('hi')
    expect(sock.onWhatsApp).toHaveBeenCalledWith('alice')
    const [jid] = sock.sendMessage.mock.calls[sock.sendMessage.mock.calls.length - 1] as [string]
    expect(jid).toBe(JID)
  })

  it('does not query onWhatsApp for a fully-qualified JID recipient', async () => {
    const { c, sock } = connected()
    await c.send('123@s.whatsapp.net').text('hi')
    expect(sock.onWhatsApp).not.toHaveBeenCalled()
    const [jid] = sock.sendMessage.mock.calls[sock.sendMessage.mock.calls.length - 1] as [string]
    expect(jid).toBe('123@s.whatsapp.net')
  })

  it('rejects with USERNAME_NOT_FOUND when onWhatsApp returns an empty list', async () => {
    const { c, sock } = connected()
    sock.onWhatsApp.mockResolvedValueOnce([])
    await expect(c.send('ghost').text('hi')).rejects.toMatchObject({
      code: 'USERNAME_NOT_FOUND',
    })
    expect(sock.sendMessage).not.toHaveBeenCalled()
  })

  it('rejects with USERNAME_NOT_FOUND when the contact does not exist', async () => {
    const { c, sock } = connected()
    sock.onWhatsApp.mockResolvedValueOnce([{ jid: '', exists: false }])
    await expect(c.send('ghost').text('hi')).rejects.toMatchObject({
      code: 'USERNAME_NOT_FOUND',
    })
  })

  it('exposes the unresolvable failure as a ZaileysBuilderError', async () => {
    const { c, sock } = connected()
    sock.onWhatsApp.mockResolvedValueOnce(undefined)
    await expect(c.send('ghost').text('hi')).rejects.toBeInstanceOf(ZaileysBuilderError)
  })

  it('caches a resolved username across repeated sends (single onWhatsApp call)', async () => {
    const { c, sock } = connected()
    sock.onWhatsApp.mockResolvedValueOnce([{ jid: JID, exists: true }])
    await c.send('alice').text('one')
    await c.send('alice').text('two')
    expect(sock.onWhatsApp).toHaveBeenCalledTimes(1)
    expect(sock.sendMessage).toHaveBeenCalledTimes(2)
  })

  it('sends both messages to the resolved JID after a cache hit', async () => {
    const { c, sock } = connected()
    sock.onWhatsApp.mockResolvedValueOnce([{ jid: JID, exists: true }])
    await c.send('alice').text('one')
    await c.send('alice').text('two')
    for (const call of sock.sendMessage.mock.calls) {
      expect(call[0]).toBe(JID)
    }
  })

  it('throws INVALID_OPTIONS when sending before connect', () => {
    expect(() => makeClient().send('alice')).toThrow(ZaileysBuilderError)
  })

  it('forwards a username recipient through the same resolution path', async () => {
    const { c, sock } = connected()
    sock.onWhatsApp.mockResolvedValueOnce([{ jid: JID, exists: true }])
    const key = { remoteJid: '1@s.whatsapp.net', id: 'M1', fromMe: false } as const
    await c.store.saveMessage({ key, message: { conversation: 'x' } } as never)
    await c.forward(key, 'alice')
    expect(sock.onWhatsApp).toHaveBeenCalledWith('alice')
    const [jid] = sock.sendMessage.mock.calls[sock.sendMessage.mock.calls.length - 1] as [string]
    expect(jid).toBe(JID)
  })
})
