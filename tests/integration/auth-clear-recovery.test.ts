import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { randomBytes } from 'node:crypto'
import { afterAll, describe, expect, it } from 'vitest'
import { newDb } from 'pg-mem'
import type { Pool } from 'pg'
import type { SignalDataSet } from 'baileys'
import { FileAuthStore } from '../../src/auth/adapters/file.js'
import { MemoryAuthStore } from '../../src/auth/adapters/memory.js'
import { SqliteAuthStore } from '../../src/auth/adapters/sqlite.js'
import { PostgresAuthStore } from '../../src/auth/adapters/postgres.js'
import { makeCacheableAuthStore } from '../../src/auth/cache.js'
import type { AuthStoreBundle } from '../../src/auth/types.js'
import { sampleCreds, sampleSignalEntries } from '../contracts/fixtures.js'

const cleanupPaths: string[] = []

const tmpDir = (label: string): string => {
  const p = path.join(os.tmpdir(), `zaileys-clear-${label}-${randomBytes(8).toString('hex')}`)
  cleanupPaths.push(p)
  return p
}

const makeMemPool = (): Pool => {
  const db = newDb({ noAstCoverageCheck: true })
  const { Pool: MemPool } = db.adapters.createPg()
  return new MemPool() as unknown as Pool
}

interface Factory {
  name: string
  make: () => AuthStoreBundle
}

const factories: Factory[] = [
  { name: 'MemoryAuthStore', make: () => new MemoryAuthStore() },
  { name: 'FileAuthStore', make: () => new FileAuthStore({ basePath: tmpDir('file') }) },
  { name: 'SqliteAuthStore', make: () => new SqliteAuthStore({ database: ':memory:' }) },
  { name: 'PostgresAuthStore', make: () => new PostgresAuthStore({ pool: makeMemPool() }) },
]

afterAll(async () => {
  await Promise.all(
    cleanupPaths.splice(0).map((p) => fs.rm(p, { recursive: true, force: true }).catch(() => undefined)),
  )
})

const runFlow = async (bundle: AuthStoreBundle): Promise<void> => {
  const credsA = sampleCreds()
  await bundle.creds.writeCreds(credsA)
  const entries = sampleSignalEntries('1') as SignalDataSet
  await bundle.signal.write({
    'pre-key': entries['pre-key'],
    session: entries.session,
    'identity-key': entries['identity-key'],
  })

  const readA = await bundle.creds.readCreds()
  expect(readA).toBeDefined()
  const preA = await bundle.signal.read('pre-key', ['1'])
  expect(preA['1']).toBeDefined()

  await bundle.signal.clear()

  const afterClear = await bundle.creds.readCreds()
  expect(afterClear === undefined || afterClear === null).toBe(true)
  const preEmpty = await bundle.signal.read('pre-key', ['1'])
  expect(preEmpty['1'] == null).toBe(true)
  const sessionEmpty = await bundle.signal.read('session', ['1'])
  expect(sessionEmpty['1'] == null).toBe(true)

  const credsB = sampleCreds()
  await bundle.creds.writeCreds(credsB)
  const freshEntries = sampleSignalEntries('2') as SignalDataSet
  await bundle.signal.write({ 'pre-key': freshEntries['pre-key'] })

  const readB = await bundle.creds.readCreds()
  expect(readB).toBeDefined()
  const preB = await bundle.signal.read('pre-key', ['2'])
  expect(preB['2']).toBeDefined()

  await bundle.signal.close()
}

describe('AUTH-07 auth-clear-recovery', () => {
  for (const f of factories) {
    describe(f.name, () => {
      it('raw bundle: clear wipes creds and signal, fresh writes succeed', async () => {
        await runFlow(f.make())
      })

      it('cacheable wrapper: clear wipes both underlying and cache', async () => {
        const cached = makeCacheableAuthStore(f.make())
        await runFlow(cached)
      })
    })
  }
})
