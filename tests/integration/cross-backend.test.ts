import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { randomBytes } from 'node:crypto'
import { afterAll, describe, expect, it } from 'vitest'
import { newDb } from 'pg-mem'
import type { Pool } from 'pg'
import type { SignalDataSet, WAMessage } from 'baileys'
import { FileAuthStore } from '../../src/auth/adapters/file.js'
import { MemoryAuthStore } from '../../src/auth/adapters/memory.js'
import { SqliteAuthStore } from '../../src/auth/adapters/sqlite.js'
import { PostgresAuthStore } from '../../src/auth/adapters/postgres.js'
import { MemoryMessageStore } from '../../src/store/adapters/memory.js'
import { SqliteMessageStore } from '../../src/store/adapters/sqlite.js'
import { PostgresMessageStore } from '../../src/store/adapters/postgres.js'
import type { AuthStoreBundle } from '../../src/auth/types.js'
import type { MessageStore } from '../../src/store/types.js'
import {
  sampleChat,
  sampleContact,
  sampleCreds,
  sampleMessages,
  sampleSignalEntries,
} from '../contracts/fixtures.js'

interface PairFactories {
  name: string
  makeAuth: () => Promise<AuthStoreBundle> | AuthStoreBundle
  makeStore: () => Promise<MessageStore> | MessageStore
}

const tmpFile = (label: string): string =>
  path.join(os.tmpdir(), `zaileys-xb-${label}-${randomBytes(8).toString('hex')}.db`)

const tmpDir = (label: string): string =>
  path.join(os.tmpdir(), `zaileys-xb-${label}-${randomBytes(8).toString('hex')}`)

const cleanupPaths: string[] = []

const makeMemPool = (): Pool => {
  const db = newDb({ noAstCoverageCheck: true })
  const { Pool: MemPool } = db.adapters.createPg()
  return new MemPool() as unknown as Pool
}

const trackFile = (p: string): string => {
  cleanupPaths.push(p)
  return p
}

const pairs: PairFactories[] = [
  {
    name: 'MemoryAuth × MemoryMessage',
    makeAuth: () => new MemoryAuthStore(),
    makeStore: () => new MemoryMessageStore(),
  },
  {
    name: 'FileAuth × MemoryMessage',
    makeAuth: () => new FileAuthStore({ basePath: trackFile(tmpDir('fa-mm')) }),
    makeStore: () => new MemoryMessageStore(),
  },
  {
    name: 'FileAuth × SqliteMessage',
    makeAuth: () => new FileAuthStore({ basePath: trackFile(tmpDir('fa-sm')) }),
    makeStore: () => new SqliteMessageStore({ database: ':memory:' }),
  },
  {
    name: 'SqliteAuth × MemoryMessage',
    makeAuth: () => new SqliteAuthStore({ database: ':memory:' }),
    makeStore: () => new MemoryMessageStore(),
  },
  {
    name: 'SqliteAuth × SqliteMessage',
    makeAuth: () => new SqliteAuthStore({ database: ':memory:' }),
    makeStore: () => new SqliteMessageStore({ database: ':memory:' }),
  },
  {
    name: 'MemoryAuth × SqliteMessage',
    makeAuth: () => new MemoryAuthStore(),
    makeStore: () => new SqliteMessageStore({ database: ':memory:' }),
  },
  {
    name: 'PostgresAuth × MemoryMessage',
    makeAuth: () => new PostgresAuthStore({ pool: makeMemPool() }),
    makeStore: () => new MemoryMessageStore(),
  },
  {
    name: 'PostgresAuth × PostgresMessage',
    makeAuth: () => new PostgresAuthStore({ pool: makeMemPool() }),
    makeStore: () => new PostgresMessageStore({ pool: makeMemPool() }),
  },
  {
    name: 'PostgresAuth × SqliteMessage',
    makeAuth: () => new PostgresAuthStore({ pool: makeMemPool() }),
    makeStore: () => new SqliteMessageStore({ database: ':memory:' }),
  },
  {
    name: 'MemoryAuth × PostgresMessage',
    makeAuth: () => new MemoryAuthStore(),
    makeStore: () => new PostgresMessageStore({ pool: makeMemPool() }),
  },
]

const JID = 'cross-backend@s.whatsapp.net'

afterAll(async () => {
  await Promise.all(
    cleanupPaths.splice(0).map(async (p) => {
      await fs.rm(p, { recursive: true, force: true }).catch(() => undefined)
      await fs.rm(`${p}-wal`, { force: true }).catch(() => undefined)
      await fs.rm(`${p}-shm`, { force: true }).catch(() => undefined)
    }),
  )
})

describe('cross-backend STORE-06 independence', () => {
  for (const pair of pairs) {
    describe(pair.name, () => {
      it('round-trips creds, signal, messages, chat, contact across distinct backends', async () => {
        const auth = await pair.makeAuth()
        const store = await pair.makeStore()
        expect(auth.constructor.name).not.toEqual(store.constructor.name)

        const creds = sampleCreds()
        await auth.creds.writeCreds(creds)
        const entries = sampleSignalEntries('1') as SignalDataSet
        const subset: SignalDataSet = {
          'pre-key': entries['pre-key'],
          session: entries.session,
          'sender-key': entries['sender-key'],
          'identity-key': entries['identity-key'],
          tctoken: entries.tctoken,
        }
        await auth.signal.write(subset)

        const messages: WAMessage[] = sampleMessages(JID, 10)
        for (const m of messages) await store.saveMessage(m)
        await store.saveChat(sampleChat(JID))
        await store.saveContact(sampleContact(JID))

        const readCreds = await auth.creds.readCreds()
        expect(readCreds).toBeDefined()
        const preKeyOut = await auth.signal.read('pre-key', ['1'])
        expect(preKeyOut['1']).toBeDefined()
        const sessionOut = await auth.signal.read('session', ['1'])
        expect(sessionOut['1']).toBeDefined()
        const identityOut = await auth.signal.read('identity-key', ['1'])
        expect(identityOut['1']).toBeDefined()
        const listed = await store.listMessages(JID, { limit: 20 })
        expect(listed.length).toBe(10)
        const chat = await store.getChat(JID)
        expect(chat).toBeDefined()
        const contact = await store.getContact(JID)
        expect(contact).toBeDefined()

        await auth.signal.clear()
        const afterAuthClear = await store.listMessages(JID, { limit: 20 })
        expect(afterAuthClear.length).toBe(10)
        const chatStill = await store.getChat(JID)
        expect(chatStill).toBeDefined()

        await store.clear()
        const credsStill = await auth.creds.readCreds()
        expect(credsStill === undefined || credsStill === null).toBe(true)
        await auth.creds.writeCreds(creds)
        const credsAfter = await auth.creds.readCreds()
        expect(credsAfter).toBeDefined()

        await auth.signal.close()
        await store.close()
      })
    })
  }
})
