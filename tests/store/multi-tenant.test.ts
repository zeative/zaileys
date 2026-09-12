import { describe, expect, it } from 'vitest'
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { randomBytes } from 'node:crypto'
import { newDb } from 'pg-mem'
import type { Pool } from 'pg'
import { PostgresAuthStore } from '../../src/auth/adapters/postgres.js'
import { PostgresMessageStore } from '../../src/store/adapters/postgres.js'
import { SqliteAuthStore } from '../../src/auth/adapters/sqlite.js'
import { SqliteMessageStore } from '../../src/store/adapters/sqlite.js'
import { sampleCreds, sampleChat } from '../contracts/fixtures.js'

const memPool = (): Pool => {
  const db = newDb({ noAstCoverageCheck: true })
  const { Pool: MemPool } = db.adapters.createPg()
  return new MemPool() as unknown as Pool
}

describe('several sessions on one Postgres database', () => {
  it('keeps each session’s credentials apart with tablePrefix', async () => {
    const pool = memPool()
    const bot1 = new PostgresAuthStore({ pool, tablePrefix: 'bot1_' })
    const bot2 = new PostgresAuthStore({ pool, tablePrefix: 'bot2_' })
    await bot1.creds.writeCreds({ ...sampleCreds(), registered: true } as never)
    await bot2.creds.writeCreds({ ...sampleCreds(), registered: false } as never)
    expect((await bot1.creds.readCreds())?.registered).toBe(true)
    expect((await bot2.creds.readCreds())?.registered).toBe(false)
    await bot1.signal.write({ session: { a: Uint8Array.from([1]) } })
    expect((await bot2.signal.read('session', ['a']))['a']).toBeUndefined()
  })

  it('keeps each session’s messages apart with tablePrefix', async () => {
    const pool = memPool()
    const s1 = new PostgresMessageStore({ pool, tablePrefix: 'bot1_' })
    const s2 = new PostgresMessageStore({ pool, tablePrefix: 'bot2_' })
    await s1.saveChat(sampleChat('only-in-bot1@s.whatsapp.net'))
    await expect(s2.getChat('only-in-bot1@s.whatsapp.net')).resolves.toBeUndefined()
    await s2.clear()
    await expect(s1.getChat('only-in-bot1@s.whatsapp.net')).resolves.toBeDefined()
  })

  it('without a prefix it still uses the original table names, so existing data is read', async () => {
    const pool = memPool()
    await pool.query('CREATE TABLE IF NOT EXISTS zaileys_auth_creds (id text PRIMARY KEY, data jsonb NOT NULL)')
    await pool.query(
      `INSERT INTO zaileys_auth_creds(id, data) VALUES ('default', '{"registered": true}'::jsonb)`,
    )
    const legacy = new PostgresAuthStore({ pool })
    expect((await legacy.creds.readCreds())?.registered).toBe(true)
  })

  it.each(["x; DROP TABLE users", '1bot', 'bot-1', 'a'.repeat(50), 'bot 1'])('rejects unsafe prefix %j', (bad) => {
    expect(() => new PostgresAuthStore({ pool: memPool(), tablePrefix: bad })).toThrow(/tablePrefix/)
    expect(() => new PostgresMessageStore({ pool: memPool(), tablePrefix: bad })).toThrow(/tablePrefix/)
  })
})

describe('several sessions in one SQLite file', () => {
  it('keeps credentials and messages apart with tablePrefix', async () => {
    const file = path.join(os.tmpdir(), `zaileys-mt-${randomBytes(6).toString('hex')}.db`)
    try {
      const a1 = new SqliteAuthStore({ database: file, tablePrefix: 'bot1_' })
      const a2 = new SqliteAuthStore({ database: file, tablePrefix: 'bot2_' })
      await a1.creds.writeCreds({ ...sampleCreds(), registered: true } as never)
      await expect(a2.creds.readCreds()).resolves.toBeUndefined()
      const m1 = new SqliteMessageStore({ database: file, tablePrefix: 'bot1_' })
      const m2 = new SqliteMessageStore({ database: file, tablePrefix: 'bot2_' })
      await m1.saveChat(sampleChat('x@s.whatsapp.net'))
      await expect(m2.getChat('x@s.whatsapp.net')).resolves.toBeUndefined()
      await a1.signal.close()
      await a2.signal.close()
      await m1.close()
      await m2.close()
    } finally {
      await fs.rm(file, { force: true })
      await fs.rm(`${file}-wal`, { force: true })
      await fs.rm(`${file}-shm`, { force: true })
    }
  })
})
