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

import { Client } from '../../src/client/client.js'
import { MemoryMessageStore } from '../../src/store/adapters/memory.js'

beforeEach(() => {
  makeWASocketMock.mockReset()
  initAuthCredsMock.mockClear()
  makeWASocketMock.mockImplementation(() => createMockSocket())
})

describe('Client — defaults', () => {
  it('default sessionId is "default"', () => {
    const c = new Client()
    expect(c.sessionId).toBe('default')
  })

  it('custom sessionId is honoured', () => {
    const c = new Client({ sessionId: 'foo' })
    expect(c.sessionId).toBe('foo')
  })

  it('default state is "idle"', () => {
    expect(new Client().state).toBe('idle')
  })

  it('default socket is undefined', () => {
    expect(new Client().socket).toBeUndefined()
  })

  it('default auth is a FileAuthStore namespaced under sessionId', () => {
    const c = new Client({ sessionId: 'foo' })
    expect(c.auth).toBeDefined()
    expect(typeof c.auth.signal.read).toBe('function')
    expect(typeof c.auth.creds.readCreds).toBe('function')
  })

  it('default store is a MemoryMessageStore', () => {
    const c = new Client()
    expect(c.store).toBeInstanceOf(MemoryMessageStore)
  })

  it('on() returns an unsubscribe function', () => {
    const c = new Client()
    const unsub = c.on('connect', () => undefined)
    expect(typeof unsub).toBe('function')
    unsub()
  })

  it('custom store is preserved', () => {
    const store = new MemoryMessageStore()
    const c = new Client({ store })
    expect(c.store).toBe(store)
  })
})
