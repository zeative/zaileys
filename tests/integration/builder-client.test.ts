import type { WAMessage, WAMessageKey } from 'baileys'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { makeWASocketMock, initAuthCredsMock, printQrMock } = vi.hoisted(() => ({
  makeWASocketMock: vi.fn(),
  initAuthCredsMock: vi.fn(() => ({ fake: 'creds' })),
  printQrMock: vi.fn(async (_qr: string) => undefined),
}))

vi.mock('baileys', () => ({
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
}))

vi.mock('../../src/connection/qr-terminal.js', async () => {
  const actual = await vi.importActual<typeof import('../../src/connection/qr-terminal.js')>(
    '../../src/connection/qr-terminal.js',
  )
  return { ...actual, printQrToTerminal: printQrMock }
})

import { MemoryAuthStore } from '../../src/auth/adapters/memory.js'
import { ZaileysBuilderError } from '../../src/builder/errors.js'
import { Client } from '../../src/client/client.js'
import {
  makeIntegrationSocket,
  simulateAuthFlow,
  type IntegrationMockSocket,
} from '../_helpers/mock-socket-integration.js'

const JID = '111@s.whatsapp.net'
const JID2 = '222@s.whatsapp.net'

beforeEach(() => {
  makeWASocketMock.mockReset()
  initAuthCredsMock.mockClear()
  printQrMock.mockClear()
})

async function connectedClient(): Promise<{ c: Client; sock: IntegrationMockSocket }> {
  const sock = makeIntegrationSocket({ user: { id: '999@s.whatsapp.net', name: 'IT' } })
  makeWASocketMock.mockReturnValue(sock)
  const c = new Client({ auth: new MemoryAuthStore(), qrTerminal: false, autoConnect: false })
  const opening = c.connect()
  await Promise.resolve()
  simulateAuthFlow(sock, { qrFirst: false, user: { id: '999@s.whatsapp.net', name: 'IT' } })
  await opening
  return { c, sock }
}

const lastSend = (sock: IntegrationMockSocket): { jid: string; content: Record<string, unknown> } => {
  const calls = sock.sendMessage.mock.calls
  const [jid, content] = calls[calls.length - 1] as [string, Record<string, unknown>]
  return { jid, content }
}

describe('integration: Client.send', () => {
  it('sends text to an explicit JID', async () => {
    const { c, sock } = await connectedClient()
    const key = await c.send(JID).text('hi')
    const { jid, content } = lastSend(sock)
    expect(jid).toBe(JID)
    expect(content.text).toBe('hi')
    expect(key.id).toBe('mock-sent-id')
  })

  it('does not resolve a JID recipient via onWhatsApp', async () => {
    const { c, sock } = await connectedClient()
    await c.send(JID).text('hi')
    expect(sock.onWhatsApp).not.toHaveBeenCalled()
  })

  it('resolves a username to a JID before dispatch', async () => {
    const { c, sock } = await connectedClient()
    sock.onWhatsApp.mockResolvedValueOnce([{ jid: JID, exists: true }])
    await c.send('alice').text('hi')
    expect(sock.onWhatsApp).toHaveBeenCalledWith('alice')
    expect(lastSend(sock).jid).toBe(JID)
  })

  it('rejects when a username cannot be resolved', async () => {
    const { c, sock } = await connectedClient()
    sock.onWhatsApp.mockResolvedValueOnce([{ jid: '', exists: false }])
    await expect(c.send('ghost').text('hi')).rejects.toMatchObject({
      code: 'USERNAME_NOT_FOUND',
    })
    expect(sock.sendMessage).not.toHaveBeenCalled()
  })

  it('caches a resolved username across sends', async () => {
    const { c, sock } = await connectedClient()
    sock.onWhatsApp.mockResolvedValueOnce([{ jid: JID, exists: true }])
    await c.send('alice').text('one')
    await c.send('alice').text('two')
    expect(sock.onWhatsApp).toHaveBeenCalledTimes(1)
    expect(sock.sendMessage).toHaveBeenCalledTimes(2)
  })

  it('carries reply and mentions through the full chain', async () => {
    const { c, sock } = await connectedClient()
    const quoted: WAMessageKey = { remoteJid: JID, id: 'Q1', fromMe: false }
    await c.send(JID).text('tagged').reply(quoted).mentions(['x@s.whatsapp.net'])
    const calls = sock.sendMessage.mock.calls
    const [, content, options] = calls[calls.length - 1] as [
      string,
      Record<string, unknown>,
      Record<string, unknown>,
    ]
    expect(content.mentions).toEqual(['x@s.whatsapp.net'])
    expect(options.quoted).toEqual({ key: quoted })
  })

  it('returns the sent message key', async () => {
    const { c } = await connectedClient()
    const key = await c.send(JID).text('hi')
    expect(key).toMatchObject({ id: 'mock-sent-id', fromMe: true })
  })
})

describe('integration: Client.edit', () => {
  it('dispatches an edit with the target key set', async () => {
    const { c, sock } = await connectedClient()
    const key: WAMessageKey = { remoteJid: JID, id: 'E1', fromMe: true }
    await c.edit(key).text('updated')
    const { jid, content } = lastSend(sock)
    expect(jid).toBe(JID)
    expect(content.text).toBe('updated')
    expect(content.edit).toEqual(key)
  })

  it('returns the resulting message key from an edit', async () => {
    const { c } = await connectedClient()
    const key: WAMessageKey = { remoteJid: JID, id: 'E2', fromMe: true }
    const result = await c.edit(key).text('again')
    expect(result.id).toBe('mock-sent-id')
  })
})

describe('integration: Client.delete', () => {
  it('sends a delete-for-everyone content shape', async () => {
    const { c, sock } = await connectedClient()
    const key: WAMessageKey = { remoteJid: JID, id: 'D1', fromMe: true }
    await c.delete(key)
    const { jid, content } = lastSend(sock)
    expect(jid).toBe(JID)
    expect(content.delete).toEqual(key)
  })

  it('deletes for me via chatModify when forEveryone is false', async () => {
    const { c, sock } = await connectedClient()
    const key: WAMessageKey = { remoteJid: JID, id: 'D2', fromMe: false }
    await c.delete(key, { forEveryone: false })
    expect(sock.sendMessage).not.toHaveBeenCalled()
    expect(sock.chatModify).toHaveBeenCalledWith(
      { deleteForMe: { deleteMedia: false, key, timestamp: expect.any(Number) } },
      JID,
    )
  })
})

describe('integration: Client.react', () => {
  it('sends a reaction and returns the reaction key', async () => {
    const { c, sock } = await connectedClient()
    const key: WAMessageKey = { remoteJid: JID, id: 'R1', fromMe: false }
    const result = await c.react(key, '🔥')
    const { jid, content } = lastSend(sock)
    expect(jid).toBe(JID)
    expect(content.react).toEqual({ text: '🔥', key })
    expect(result.id).toBe('mock-sent-id')
  })

  it('sends an empty reaction to unreact', async () => {
    const { c, sock } = await connectedClient()
    const key: WAMessageKey = { remoteJid: JID, id: 'R2', fromMe: false }
    await c.react(key, '')
    const { content } = lastSend(sock)
    expect((content.react as { text: string }).text).toBe('')
  })
})

describe('integration: Client.forward', () => {
  it('forwards a stored message to an explicit JID', async () => {
    const { c, sock } = await connectedClient()
    const key: WAMessageKey = { remoteJid: JID, id: 'F1', fromMe: false }
    const message: WAMessage = { key, message: { conversation: 'orig' } } as WAMessage
    await c.store.saveMessage(message)
    await c.forward(key, JID2)
    const { jid, content } = lastSend(sock)
    expect(jid).toBe(JID2)
    expect(content.forward).toMatchObject({ key })
  })

  it('resolves a username recipient before forwarding', async () => {
    const { c, sock } = await connectedClient()
    sock.onWhatsApp.mockResolvedValueOnce([{ jid: JID2, exists: true }])
    const key: WAMessageKey = { remoteJid: JID, id: 'F2', fromMe: false }
    await c.store.saveMessage({ key, message: { conversation: 'x' } } as WAMessage)
    await c.forward(key, 'bob')
    expect(sock.onWhatsApp).toHaveBeenCalledWith('bob')
    expect(lastSend(sock).jid).toBe(JID2)
  })

  it('throws when the source message is not in the store', async () => {
    const { c } = await connectedClient()
    const key: WAMessageKey = { remoteJid: JID, id: 'MISSING', fromMe: false }
    await expect(c.forward(key, JID2)).rejects.toMatchObject({ code: 'MESSAGE_NOT_FOUND' })
  })
})

describe('integration: disconnected guard', () => {
  it('send throws when the client is not connected', () => {
    const c = new Client({ auth: new MemoryAuthStore(), qrTerminal: false, autoConnect: false })
    expect(() => c.send(JID)).toThrow(ZaileysBuilderError)
  })

  it('delete throws when the client is not connected', async () => {
    const c = new Client({ auth: new MemoryAuthStore(), qrTerminal: false, autoConnect: false })
    await expect(c.delete({ remoteJid: JID, id: 'x', fromMe: true })).rejects.toMatchObject({
      code: 'INVALID_OPTIONS',
    })
  })

  it('react throws when the client is not connected', async () => {
    const c = new Client({ auth: new MemoryAuthStore(), qrTerminal: false, autoConnect: false })
    await expect(c.react({ remoteJid: JID, id: 'x', fromMe: true }, '👍')).rejects.toMatchObject({
      code: 'INVALID_OPTIONS',
    })
  })
})

describe('integration: multi-instance isolation', () => {
  it('does not leak a resolved username between clients', async () => {
    const { c: a, sock: sockA } = await connectedClient()
    sockA.onWhatsApp.mockResolvedValueOnce([{ jid: JID, exists: true }])
    await a.send('alice').text('hi')

    const { c: b, sock: sockB } = await connectedClient()
    sockB.onWhatsApp.mockResolvedValueOnce([{ jid: JID2, exists: true }])
    await b.send('alice').text('hi')

    expect(sockA.onWhatsApp).toHaveBeenCalledTimes(1)
    expect(sockB.onWhatsApp).toHaveBeenCalledTimes(1)
    expect(lastSend(sockB).jid).toBe(JID2)
  })
})
