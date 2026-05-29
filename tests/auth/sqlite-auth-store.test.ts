import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { randomBytes } from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { SqliteAuthStore } from '../../src/auth/adapters/sqlite.js'
import { runAuthStoreContract } from '../contracts/index.js'
import { sampleCreds } from '../contracts/fixtures.js'
import { ZaileysStoreError } from '../../src/types/store-error.js'

const freshFile = (): string =>
  path.join(os.tmpdir(), `zaileys-sqlite-auth-${randomBytes(8).toString('hex')}.db`)

const memoryFactory = (): SqliteAuthStore => new SqliteAuthStore({ database: ':memory:' })

const fileDirs: string[] = []
const fileFactory = (): SqliteAuthStore => {
  const filePath = freshFile()
  fileDirs.push(filePath)
  return new SqliteAuthStore({ database: filePath })
}

runAuthStoreContract('SqliteAuthStore (memory)', memoryFactory)

runAuthStoreContract('SqliteAuthStore (file)', fileFactory, async () => {
  await Promise.all(
    fileDirs.splice(0).map(async (f) => {
      await fs.rm(f, { force: true }).catch(() => undefined)
      await fs.rm(`${f}-wal`, { force: true }).catch(() => undefined)
      await fs.rm(`${f}-shm`, { force: true }).catch(() => undefined)
    }),
  )
})

describe('SqliteAuthStore — adapter specifics', () => {
  let filePath: string

  beforeEach(() => {
    filePath = freshFile()
  })

  afterEach(async () => {
    await fs.rm(filePath, { force: true }).catch(() => undefined)
    await fs.rm(`${filePath}-wal`, { force: true }).catch(() => undefined)
    await fs.rm(`${filePath}-shm`, { force: true }).catch(() => undefined)
  })

  it('S1: invalid path surfaces STORE_CONNECTION_FAILED on first op', async () => {
    const store = new SqliteAuthStore({ database: '/nonexistent/dir-zaileys-xyz/x.db' })
    await expect(store.creds.readCreds()).rejects.toMatchObject({
      name: 'ZaileysStoreError',
      code: 'STORE_CONNECTION_FAILED',
    })
  })

  it('S2: clear() empties both auth_creds and auth_signal (raw row count)', async () => {
    const store = new SqliteAuthStore({ database: filePath })
    await store.creds.writeCreds(sampleCreds())
    await store.signal.write({ session: { '1': Uint8Array.from([1, 2]) } })
    await store.signal.clear()
    const Driver = (await import('better-sqlite3')).default
    const raw = new Driver(filePath)
    const credsRow = raw.prepare('SELECT COUNT(*) as n FROM auth_creds').get() as { n: number }
    const signalRow = raw.prepare('SELECT COUNT(*) as n FROM auth_signal').get() as { n: number }
    raw.close()
    expect(credsRow.n).toBe(0)
    expect(signalRow.n).toBe(0)
    await store.signal.close()
  })

  it('S3: WAL journal_mode applied for file-backed', async () => {
    const store = new SqliteAuthStore({ database: filePath })
    await store.creds.writeCreds(sampleCreds())
    const Driver = (await import('better-sqlite3')).default
    const raw = new Driver(filePath)
    const mode = raw.pragma('journal_mode', { simple: true }) as string
    raw.close()
    expect(mode.toLowerCase()).toBe('wal')
    await store.signal.close()
  })

  it('S4: post-close ops throw STORE_CLOSED', async () => {
    const store = new SqliteAuthStore({ database: ':memory:' })
    await store.creds.writeCreds(sampleCreds())
    await store.signal.close()
    await expect(store.creds.readCreds()).rejects.toBeInstanceOf(ZaileysStoreError)
    await expect(store.creds.readCreds()).rejects.toMatchObject({ code: 'STORE_CLOSED' })
  })

  it('S5: chunked IN clause handles 1500 ids without error', async () => {
    const store = new SqliteAuthStore({ database: ':memory:' })
    const data: Record<string, Uint8Array> = {}
    const ids: string[] = []
    for (let i = 0; i < 1500; i += 1) {
      const id = `id-${i}`
      ids.push(id)
      data[id] = Uint8Array.from([i & 0xff])
    }
    await store.signal.write({ session: data })
    const read = await store.signal.read('session', ids)
    expect(Object.keys(read).length).toBe(1500)
    await store.signal.delete('session', ids)
    const after = await store.signal.read('session', ids)
    expect(Object.keys(after).length).toBe(0)
    await store.signal.close()
  })

  it('S6: idempotent close', async () => {
    const store = new SqliteAuthStore({ database: ':memory:' })
    await store.creds.writeCreds(sampleCreds())
    await store.signal.close()
    await expect(store.signal.close()).resolves.toBeUndefined()
  })

  it('S7: schema is idempotent across reopens of same file', async () => {
    const first = new SqliteAuthStore({ database: filePath })
    await first.creds.writeCreds(sampleCreds())
    await first.signal.close()
    const second = new SqliteAuthStore({ database: filePath })
    const read = await second.creds.readCreds()
    expect(read).toBeDefined()
    await second.signal.close()
  })
})
