import { describe, expect, it, vi, beforeEach } from 'vitest'
import { makeInboundSocket, type InboundMockSocket } from '../_helpers/mock-socket-events.js'

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
      loggedOut: 401, forbidden: 403, connectionLost: 408, multideviceMismatch: 411,
      connectionClosed: 428, connectionReplaced: 440, badSession: 500,
      unavailableService: 503, restartRequired: 515, timedOut: 408,
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

const SELF = 'me@s.whatsapp.net'

function memAuth(): AuthStoreBundle {
  const sig: AuthStore = {
    read: async () => ({}),
    write: async () => undefined,
    delete: async () => undefined,
    clear: async () => undefined,
    close: async () => undefined,
  }
  return {
    creds: { readCreds: async () => undefined, writeCreds: async () => undefined, deleteCreds: async () => undefined },
    signal: sig,
  }
}

function textMsg(text: string, overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    key: { remoteJid: '999@s.whatsapp.net', id: 'M1', fromMe: false },
    message: { conversation: text },
    messageTimestamp: 1700,
    pushName: 'Alice',
    ...overrides,
  }
}

async function connected(sock: InboundMockSocket, opts: { auth?: AuthStoreBundle; sessionId?: string } = {}): Promise<Client> {
  makeWASocketMock.mockReturnValue(sock)
  const c = new Client({ auth: opts.auth ?? memAuth(), sessionId: opts.sessionId, qrTerminal: false, autoConnect: false })
  const p = c.connect()
  sock.triggerConnectionUpdate({ connection: 'open' })
  await p
  return c
}

beforeEach(() => {
  makeWASocketMock.mockReset()
  initAuthCredsMock.mockClear()
  printQrMock.mockClear()
})

describe('inbound integration — message events', () => {
  it('text message fires text event after connect', async () => {
    const sock = makeInboundSocket({ user: { id: SELF } })
    const c = await connected(sock)
    const seen = vi.fn()
    c.on('text', seen)
    sock.triggerMessagesUpsert({ messages: [textMsg('hi')], type: 'notify' })
    expect(seen).toHaveBeenCalledTimes(1)
    expect(seen.mock.calls[0]?.[0]).toMatchObject({ content: 'hi' })
  })

  it('image message fires image event with download fn', async () => {
    const sock = makeInboundSocket({ user: { id: SELF } })
    const c = await connected(sock)
    const seen = vi.fn()
    c.on('image', seen)
    sock.triggerMessagesUpsert({
      messages: [textMsg('', { message: { imageMessage: { mimetype: 'image/png', caption: 'c' } } })],
      type: 'notify',
    })
    expect(typeof seen.mock.calls[0]?.[0].download).toBe('function')
  })

  it('reaction fires reaction event', async () => {
    const sock = makeInboundSocket({ user: { id: SELF } })
    const c = await connected(sock)
    const seen = vi.fn()
    c.on('reaction', seen)
    sock.triggerMessagesReaction([
      { key: { remoteJid: '999@s.whatsapp.net', id: 'R', fromMe: false }, reaction: { key: { id: 'M1' }, text: '🔥' } },
    ])
    expect(seen.mock.calls[0]?.[0]).toMatchObject({ emoji: '🔥' })
  })

  it('edit fires edit event', async () => {
    const { proto } = await import('baileys')
    const sock = makeInboundSocket({ user: { id: SELF } })
    const c = await connected(sock)
    const seen = vi.fn()
    c.on('edit', seen)
    sock.triggerMessagesUpdate([
      {
        key: { remoteJid: '999@s.whatsapp.net', id: 'M1', fromMe: false },
        update: { message: { protocolMessage: { type: proto.Message.ProtocolMessage.Type.MESSAGE_EDIT, key: { id: 'M1' }, editedMessage: { conversation: 'edited' } } }, messageTimestamp: 99 },
      },
    ])
    expect(seen.mock.calls[0]?.[0]).toMatchObject({ newContent: 'edited' })
  })
})

describe('inbound integration — group / call / lifecycle', () => {
  it('group-participants add fires group-join', async () => {
    const sock = makeInboundSocket({ user: { id: SELF } })
    const c = await connected(sock)
    const seen = vi.fn()
    c.on('group-join', seen)
    sock.triggerGroupParticipants({ id: '1-2@g.us', author: 'a@s.whatsapp.net', participants: [{ id: 'x@s.whatsapp.net' }], action: 'add' })
    expect(seen).toHaveBeenCalledTimes(1)
  })

  it('group-update fires group-update', async () => {
    const sock = makeInboundSocket({ user: { id: SELF } })
    const c = await connected(sock)
    const seen = vi.fn()
    c.on('group-update', seen)
    sock.triggerGroupsUpdate([{ id: '1-2@g.us', subject: 'S' }])
    expect(seen).toHaveBeenCalledTimes(1)
  })

  it('call offer fires call-incoming', async () => {
    const sock = makeInboundSocket({ user: { id: SELF } })
    const c = await connected(sock)
    const seen = vi.fn()
    c.on('call-incoming', seen)
    sock.triggerCall([{ id: 'C', from: 'caller@s.whatsapp.net', status: 'offer', date: new Date(1) }])
    expect(seen.mock.calls[0]?.[0]).toMatchObject({ kind: 'incoming' })
  })

  it('messaging-history.status fires history-sync', async () => {
    const sock = makeInboundSocket({ user: { id: SELF } })
    const c = await connected(sock)
    const seen = vi.fn()
    c.on('history-sync', seen)
    sock.triggerHistoryStatus({ syncType: 1, status: 'complete', explicit: false })
    expect(seen).toHaveBeenCalledTimes(1)
  })

  it('presence fires presence per participant', async () => {
    const sock = makeInboundSocket({ user: { id: SELF } })
    const c = await connected(sock)
    const seen = vi.fn()
    c.on('presence', seen)
    sock.triggerPresence({ id: '999@s.whatsapp.net', presences: { 'p@s.whatsapp.net': { lastKnownPresence: 'composing' } } })
    expect(seen).toHaveBeenCalledTimes(1)
  })

  it('newsletter.reaction fires newsletter with action reaction', async () => {
    const sock = makeInboundSocket({ user: { id: SELF } })
    const c = await connected(sock)
    const seen = vi.fn()
    c.on('newsletter', seen)
    sock.triggerNewsletterReaction({ id: 'nl', server_id: 's', reaction: { code: '👏' } })
    expect(seen.mock.calls[0]?.[0]).toMatchObject({ action: 'reaction' })
  })
})

describe('inbound integration — lifecycle + security', () => {
  it('disconnect detaches pipeline — no events after', async () => {
    const sock = makeInboundSocket({ user: { id: SELF } })
    const c = await connected(sock)
    const seen = vi.fn()
    c.on('text', seen)
    await c.disconnect()
    sock.triggerMessagesUpsert({ messages: [textMsg('after')], type: 'notify' })
    expect(seen).not.toHaveBeenCalled()
  })

  it('close detaches pipeline even when reconnecting (W1)', async () => {
    const sock = makeInboundSocket({ user: { id: SELF } })
    const c = await connected(sock)
    const seen = vi.fn()
    c.on('text', seen)
    sock.triggerConnectionUpdate({ connection: 'close', lastDisconnect: { error: undefined, date: new Date() } })
    sock.triggerMessagesUpsert({ messages: [textMsg('orphan')], type: 'notify' })
    expect(seen).not.toHaveBeenCalled()
    await c.disconnect().catch(() => undefined)
  })

  it('dropSpoofedSelfOnly: requestId upsert fires no text', async () => {
    const sock = makeInboundSocket({ user: { id: SELF } })
    const c = await connected(sock)
    const seen = vi.fn()
    c.on('text', seen)
    sock.triggerMessagesUpsert({ messages: [textMsg('spoof')], type: 'notify', requestId: 'x' })
    expect(seen).not.toHaveBeenCalled()
  })

  it('Phase 3 events (connect/qr/disconnect) still fire', async () => {
    const sock = makeInboundSocket()
    makeWASocketMock.mockReturnValue(sock)
    const c = new Client({ auth: memAuth(), qrTerminal: false, autoConnect: false })
    const onConnect = vi.fn()
    const onQr = vi.fn()
    const onDisconnect = vi.fn()
    c.on('connect', onConnect)
    c.on('qr', onQr)
    c.on('disconnect', onDisconnect)
    const p = c.connect()
    sock.triggerConnectionUpdate({ qr: 'q' })
    await new Promise((r) => setTimeout(r, 5))
    sock.setUser({ id: SELF })
    sock.triggerConnectionUpdate({ connection: 'open' })
    await p
    expect(onQr).toHaveBeenCalledTimes(1)
    expect(onConnect).toHaveBeenCalledTimes(1)
    await c.disconnect()
    expect(onDisconnect).toHaveBeenCalled()
  })

  it('text + connect both fire after connect (pipeline does not break Phase 3)', async () => {
    const sock = makeInboundSocket({ user: { id: SELF } })
    const onConnect = vi.fn()
    makeWASocketMock.mockReturnValue(sock)
    const c = new Client({ auth: memAuth(), qrTerminal: false, autoConnect: false })
    c.on('connect', onConnect)
    const text = vi.fn()
    c.on('text', text)
    const p = c.connect()
    sock.triggerConnectionUpdate({ connection: 'open' })
    await p
    sock.triggerMessagesUpsert({ messages: [textMsg('x')], type: 'notify' })
    expect(onConnect).toHaveBeenCalledTimes(1)
    expect(text).toHaveBeenCalledTimes(1)
  })
})

describe('inbound integration — reconnect + multi-instance', () => {
  it('events still fire after reconnect cycle (fresh attach)', async () => {
    const sock = makeInboundSocket({ user: { id: SELF } })
    const c = await connected(sock)
    const seen = vi.fn()
    c.on('text', seen)
    sock.triggerConnectionUpdate({ connection: 'close', lastDisconnect: { error: undefined, date: new Date() } })
    sock.triggerConnectionUpdate({ connection: 'open' })
    sock.triggerMessagesUpsert({ messages: [textMsg('rejoined')], type: 'notify' })
    expect(seen).toHaveBeenCalledTimes(1)
    await c.disconnect().catch(() => undefined)
  })

  it('two clients do not cross-fire inbound events', async () => {
    const sockA = makeInboundSocket({ user: { id: 'a@s.whatsapp.net' } })
    const sockB = makeInboundSocket({ user: { id: 'b@s.whatsapp.net' } })
    let n = 0
    makeWASocketMock.mockImplementation(() => (n++ === 0 ? sockA : sockB))
    const cA = new Client({ sessionId: 'a', auth: memAuth(), qrTerminal: false, autoConnect: false })
    const cB = new Client({ sessionId: 'b', auth: memAuth(), qrTerminal: false, autoConnect: false })
    const pA = cA.connect()
    const pB = cB.connect()
    sockA.triggerConnectionUpdate({ connection: 'open' })
    sockB.triggerConnectionUpdate({ connection: 'open' })
    await pA
    await pB
    const seenA = vi.fn()
    const seenB = vi.fn()
    cA.on('text', seenA)
    cB.on('text', seenB)
    sockA.triggerMessagesUpsert({ messages: [textMsg('toA')], type: 'notify' })
    expect(seenA).toHaveBeenCalledTimes(1)
    expect(seenB).not.toHaveBeenCalled()
  })

  it('no double-attach: single text emission after open', async () => {
    const sock = makeInboundSocket({ user: { id: SELF } })
    const c = await connected(sock)
    const seen = vi.fn()
    c.on('text', seen)
    sock.triggerMessagesUpsert({ messages: [textMsg('once')], type: 'notify' })
    expect(seen).toHaveBeenCalledTimes(1)
    await c.disconnect()
  })
})
