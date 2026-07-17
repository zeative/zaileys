import { describe, expect, it, vi, beforeEach } from 'vitest'
import { createMockSocket } from '../_helpers/mock-socket.js'

const { makeWASocketMock, initAuthCredsMock } = vi.hoisted(() => ({
  makeWASocketMock: vi.fn(),
  initAuthCredsMock: vi.fn(() => ({ fake: 'creds' })),
}))

vi.mock('baileys', () => ({
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
}))

vi.mock('../../src/connection/qr-terminal.js', async () => {
  const actual = await vi.importActual<typeof import('../../src/connection/qr-terminal.js')>(
    '../../src/connection/qr-terminal.js',
  )
  return { ...actual, printQrToTerminal: vi.fn(async () => undefined) }
})

import { Client } from '../../src/client/client.js'
import { MemoryAuthStore } from '../../src/auth/adapters/memory.js'
import type { ClientOptions } from '../../src/client/types.js'

beforeEach(() => {
  makeWASocketMock.mockReset()
  initAuthCredsMock.mockClear()
})

const CALLER = '628111@s.whatsapp.net'

function mkSocket() {
  const sock = createMockSocket({ user: { id: 'me@s.whatsapp.net' } })
  const rejectCall = vi.fn(async () => undefined)
  Object.assign(sock, { rejectCall })
  return Object.assign(sock, { rejectCall })
}

async function boot(opts: Partial<ClientOptions> = {}) {
  const sock = mkSocket()
  makeWASocketMock.mockReturnValue(sock)
  const c = new Client({
    auth: new MemoryAuthStore(), qrTerminal: false, autoConnect: false, statusLog: false, ...opts,
  })
  const p = c.connect()
  sock.triggerConnectionUpdate({ connection: 'open' })
  await p
  return { c, sock }
}

const ringCall = (sock: ReturnType<typeof mkSocket>, from = CALLER) =>
  sock.ev.emit('call', [
    { id: 'CALL1', from, status: 'offer', date: new Date(), isGroup: false, isVideo: false },
  ])

const settle = () => new Promise((r) => setTimeout(r, 20))

describe('autoRejectCall config', () => {
  it('rejects an incoming call when autoRejectCall: true', async () => {
    const { sock } = await boot({ autoRejectCall: true })
    ringCall(sock)
    await settle()
    expect(sock.rejectCall).toHaveBeenCalledWith('CALL1', CALLER)
  })

  it('does NOT reject by default (opt-in)', async () => {
    const { sock } = await boot()
    ringCall(sock)
    await settle()
    expect(sock.rejectCall).not.toHaveBeenCalled()
  })

  it('autoRejectCall: false does not reject', async () => {
    const { sock } = await boot({ autoRejectCall: false })
    ringCall(sock)
    await settle()
    expect(sock.rejectCall).not.toHaveBeenCalled()
  })

  it('respects the allow list end-to-end', async () => {
    const { sock } = await boot({ autoRejectCall: { enabled: true, allow: [CALLER] } })
    ringCall(sock)
    await settle()
    expect(sock.rejectCall).not.toHaveBeenCalled()

    ringCall(sock, '628999@s.whatsapp.net')
    await settle()
    expect(sock.rejectCall).toHaveBeenCalledOnce()
  })

  it('runs onReject with the call payload', async () => {
    const onReject = vi.fn()
    const { sock } = await boot({ autoRejectCall: { enabled: true, onReject } })
    ringCall(sock)
    await settle()
    expect(onReject).toHaveBeenCalledOnce()
    expect(onReject.mock.calls[0]?.[0]).toMatchObject({ callId: 'CALL1', from: CALLER })
  })

  it('rejects exactly once per call (no double-attach)', async () => {
    const { sock } = await boot({ autoRejectCall: true })
    ringCall(sock)
    await settle()
    expect(sock.rejectCall).toHaveBeenCalledTimes(1)
  })
})

describe('client.rejectCall()', () => {
  it('accepts the call payload from the event', async () => {
    const { c, sock } = await boot()
    const seen = new Promise<void>((resolve) => {
      c.on('call-incoming', async (call) => {
        await c.rejectCall(call)
        resolve()
      })
    })
    ringCall(sock)
    await seen
    expect(sock.rejectCall).toHaveBeenCalledWith('CALL1', CALLER)
  })

  it('accepts (callId, from)', async () => {
    const { c, sock } = await boot()
    await c.rejectCall('CALL9', '628222@s.whatsapp.net')
    expect(sock.rejectCall).toHaveBeenCalledWith('CALL9', '628222@s.whatsapp.net')
  })

  it('throws UNSUPPORTED_ON_CLOUD on the cloud provider', async () => {
    const c = new Client({
      provider: 'cloud',
      cloud: { accessToken: 'tok', phoneNumberId: '555' },
      autoConnect: false, statusLog: false,
    })
    await expect(c.rejectCall('C', 'x@s.whatsapp.net')).rejects.toMatchObject({
      code: 'UNSUPPORTED_ON_CLOUD',
    })
  })
})
