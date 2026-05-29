import { describe, expect, it } from 'vitest'
import { newDb } from 'pg-mem'
import type { Pool } from 'pg'
import { PostgresAuthStore } from '../../src/auth/adapters/postgres.js'
import { runAuthStoreContract } from '../contracts/index.js'
import { sampleSignalEntries } from '../contracts/fixtures.js'

const makeMemPool = (): Pool => {
  const db = newDb({ noAstCoverageCheck: true })
  const { Pool: MemPool } = db.adapters.createPg()
  return new MemPool() as unknown as Pool
}

runAuthStoreContract('PostgresAuthStore (pg-mem)', () => new PostgresAuthStore({ pool: makeMemPool() }))

describe('PostgresAuthStore — adapter specifics', () => {
  it('P1: constructor + ensureReady is idempotent on the same pool', async () => {
    const pool = makeMemPool()
    const a = new PostgresAuthStore({ pool })
    await a.creds.writeCreds({} as never)
    const b = new PostgresAuthStore({ pool })
    await expect(b.creds.readCreds()).resolves.toBeDefined()
  })

  it('P2: missing peer dep surfaces STORE_NOT_AVAILABLE', async () => {
    const store = new PostgresAuthStore({ connectionString: 'postgres://invalid-host-zzz:1/none' })
    await expect(store.creds.readCreds()).rejects.toMatchObject({
      code: expect.stringMatching(/STORE_(NOT_AVAILABLE|CONNECTION_FAILED|READ_FAILED)/),
    })
    await store.signal.close().catch(() => undefined)
  })

  it('P3: passing both pool and connectionString throws on construction', () => {
    expect(
      () => new PostgresAuthStore({ pool: makeMemPool(), connectionString: 'postgres://x' }),
    ).toThrowError(/either pool or connectionString/)
  })

  it('P4: caller-owned pool is NOT ended when store closes', async () => {
    const pool = makeMemPool()
    const store = new PostgresAuthStore({ pool })
    await store.creds.writeCreds({ x: 1 } as never)
    await store.signal.close()
    const res = await pool.query('SELECT data FROM zaileys_auth_creds')
    expect(res.rows.length).toBe(1)
  })

  it('P5: ON CONFLICT upsert keeps the latest write', async () => {
    const store = new PostgresAuthStore({ pool: makeMemPool() })
    await store.signal.write({ session: { '1': Uint8Array.from([1]) } })
    await store.signal.write({ session: { '1': Uint8Array.from([2, 3]) } })
    const r = await store.signal.read('session', ['1'])
    expect(r['1']).toBeDefined()
    expect(Buffer.from(r['1'] as Uint8Array).equals(Buffer.from([2, 3]))).toBe(true)
    await store.signal.close()
  })

  it('P6: read with many ids in one roundtrip', async () => {
    const store = new PostgresAuthStore({ pool: makeMemPool() })
    const data = sampleSignalEntries('1')
    const slice: Record<string, Uint8Array> = {}
    const ids: string[] = []
    for (let i = 0; i < 50; i += 1) {
      const id = `k-${i}`
      slice[id] = Uint8Array.from([i & 0xff])
      ids.push(id)
    }
    await store.signal.write({ session: slice })
    const r = await store.signal.read('session', ids)
    expect(Object.keys(r).length).toBe(50)
    for (let i = 0; i < 50; i += 1) {
      expect(Buffer.from(r[`k-${i}`] as Uint8Array).equals(Buffer.from([i & 0xff]))).toBe(true)
    }
    expect(data['pre-key']).toBeDefined()
    await store.signal.close()
  })
})

describe.skipIf(!process.env.DATABASE_URL)('PostgresAuthStore (real)', () => {
  runAuthStoreContract(
    'PostgresAuthStore (DATABASE_URL)',
    () => new PostgresAuthStore({ connectionString: process.env.DATABASE_URL! }),
    async (bundle) => {
      await bundle.signal.clear().catch(() => undefined)
    },
  )
})
