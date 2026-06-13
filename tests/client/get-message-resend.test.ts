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
  DisconnectReason: { loggedOut: 401, restartRequired: 515 },
  makeCacheableSignalKeyStore: vi.fn((k: unknown) => k),
  BufferJSON: { replacer: (_k: string, v: unknown) => v, reviver: (_k: string, v: unknown) => v },
}))

import { Client } from '../../src/client/client.js'
import type { AuthStoreBundle } from '../../src/auth/types.js'
import type { MessageStore } from '../../src/store/types.js'

function memAuth(): AuthStoreBundle {
  return {
    creds: {
      readCreds: async () => undefined,
      writeCreds: async () => undefined,
      deleteCreds: async () => undefined,
    },
    signal: {
      read: async () => ({}),
      write: async () => undefined,
      delete: async () => undefined,
      clear: async () => undefined,
      close: async () => undefined,
    },
  }
}

function fakeStore(saved: Record<string, unknown>): MessageStore {
  return {
    saveMessage: async () => undefined,
    getMessage: async (key) => (saved[key.id ?? ''] as never) ?? undefined,
    listMessages: async () => [],
    saveChat: async () => undefined,
    getChat: async () => undefined,
    listChats: async () => [],
    saveContact: async () => undefined,
    getContact: async () => undefined,
    listContacts: async () => [],
    savePresence: async () => undefined,
    getPresence: async () => undefined,
    bind: () => undefined,
    clear: async () => undefined,
    close: async () => undefined,
  }
}

beforeEach(() => {
  makeWASocketMock.mockReset()
  initAuthCredsMock.mockClear()
})

describe('getMessage resend wiring', () => {
  it('passes a getMessage callback to makeWASocket that returns inner message content', async () => {
    const sock = createMockSocket({ user: { id: 'me@s.whatsapp.net' } })
    makeWASocketMock.mockReturnValue(sock)
    const content = { conversation: 'hai' }
    const store = fakeStore({ MSG1: { key: { id: 'MSG1' }, message: content } })
    const c = new Client({ auth: memAuth(), autoConnect: false, store })
    void c.connect()
    const config = makeWASocketMock.mock.calls[0][0] as {
      getMessage?: (k: { id?: string }) => Promise<unknown>
    }
    expect(typeof config.getMessage).toBe('function')
    await expect(config.getMessage?.({ id: 'MSG1' })).resolves.toEqual(content)
  })

  it('resolves undefined when the message is not in the store', async () => {
    const sock = createMockSocket({ user: { id: 'me@s.whatsapp.net' } })
    makeWASocketMock.mockReturnValue(sock)
    const c = new Client({ auth: memAuth(), autoConnect: false, store: fakeStore({}) })
    void c.connect()
    const config = makeWASocketMock.mock.calls[0][0] as {
      getMessage?: (k: { id?: string }) => Promise<unknown>
    }
    await expect(config.getMessage?.({ id: 'NOPE' })).resolves.toBeUndefined()
  })
})
