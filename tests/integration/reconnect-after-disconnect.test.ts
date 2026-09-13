import { describe, expect, it, vi, beforeEach } from 'vitest'
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { randomBytes } from 'node:crypto'
import { makeIntegrationSocket } from '../_helpers/mock-socket-integration.js'

const { makeWASocketMock } = vi.hoisted(() => ({ makeWASocketMock: vi.fn() }))

vi.mock('baileys', async () => {
  const actual = await vi.importActual<typeof import('baileys')>('baileys')
  return {
    ...actual,
    default: makeWASocketMock,
    makeWASocket: makeWASocketMock,
    initAuthCreds: () => ({ registered: false }),
    makeCacheableSignalKeyStore: vi.fn((k: unknown) => k),
  }
})

import { Client } from '../../src/client/client.js'
import { MemoryAuthStore } from '../../src/auth/adapters/memory.js'
import { FileAuthStore } from '../../src/auth/adapters/file.js'
import { SqliteAuthStore } from '../../src/auth/adapters/sqlite.js'
import { MemoryMessageStore } from '../../src/store/adapters/memory.js'
import { SqliteMessageStore } from '../../src/store/adapters/sqlite.js'
import type { AuthStoreBundle } from '../../src/auth/types.js'
import type { MessageStore } from '../../src/store/types.js'

beforeEach(() => makeWASocketMock.mockReset())

const tmp = (): string => path.join(os.tmpdir(), `zaileys-reopen-${randomBytes(6).toString('hex')}`)

const cycle = async (auth: AuthStoreBundle, store: MessageStore): Promise<Client> => {
  const client = new Client({ auth, store, qrTerminal: false, autoConnect: false, statusLog: false })
  for (let round = 0; round < 3; round += 1) {
    const sock = makeIntegrationSocket({ user: { id: '628111@s.whatsapp.net' } })
    makeWASocketMock.mockReturnValue(sock)
    const p = client.connect()
    await vi.waitFor(() => expect(makeWASocketMock).toHaveBeenCalledTimes(round + 1))
    sock.triggerConnectionUpdate({ connection: 'open' })
    await p
    expect(client.state).toBe('connected')
    await store.saveChat({ id: `round${round}@s.whatsapp.net` } as never)
    await client.disconnect()
    expect(client.state).toBe('disconnected')
  }
  return client
}

describe('connect() works again after disconnect()', () => {
  it('memory auth + memory store', async () => {
    const store = new MemoryMessageStore()
    await cycle(new MemoryAuthStore(), store)
    await store.reopen?.()
    expect((await store.listChats()).length).toBe(3)
  })

  it('file auth + sqlite store keep their data across the cycle', async () => {
    const dir = tmp()
    await fs.mkdir(dir, { recursive: true })
    try {
      const auth = new FileAuthStore({ basePath: path.join(dir, 'auth') })
      await auth.creds.writeCreds({ registered: false } as never)
      const store = new SqliteMessageStore({ database: path.join(dir, 'msgs.db') })
      await cycle(auth, store)
      await store.reopen?.()
      await auth.signal.reopen?.()
      expect((await store.listChats()).length).toBe(3)
      await expect(auth.creds.readCreds()).resolves.toBeDefined()
      await store.close()
    } finally {
      await fs.rm(dir, { recursive: true, force: true })
    }
  })

  it('sqlite auth store', async () => {
    const dir = tmp()
    await fs.mkdir(dir, { recursive: true })
    try {
      const auth = new SqliteAuthStore({ database: path.join(dir, 'auth.db') })
      await cycle(auth, new MemoryMessageStore())
    } finally {
      await fs.rm(dir, { recursive: true, force: true })
    }
  })

  it('explains itself when a custom adapter cannot be reopened', async () => {
    const inner = new MemoryAuthStore()
    /** A third-party adapter written before reopen() existed. */
    const legacy: AuthStoreBundle = {
      creds: inner.creds,
      signal: {
        read: (type, ids) => inner.signal.read(type, ids),
        write: (data) => inner.signal.write(data),
        delete: (type, ids) => inner.signal.delete(type, ids),
        clear: () => inner.signal.clear(),
        close: () => inner.signal.close(),
      },
    }
    const client = new Client({ auth: legacy, store: new MemoryMessageStore(), qrTerminal: false, autoConnect: false, statusLog: false })
    const sock = makeIntegrationSocket({ user: { id: '628111@s.whatsapp.net' } })
    makeWASocketMock.mockReturnValue(sock)
    const p = client.connect()
    await vi.waitFor(() => expect(makeWASocketMock).toHaveBeenCalled())
    sock.triggerConnectionUpdate({ connection: 'open' })
    await p
    await client.disconnect()
    await expect(client.connect()).rejects.toThrow(/cannot be reopened/)
  })
})
