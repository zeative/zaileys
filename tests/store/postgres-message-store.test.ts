import { describe, expect, it } from 'vitest'
import { newDb } from 'pg-mem'
import type { Pool } from 'pg'
import { PostgresMessageStore } from '../../src/store/adapters/postgres.js'
import { runMessageStoreContract } from '../contracts/index.js'
import { sampleChat, sampleContact, sampleMessages, samplePresence } from '../contracts/fixtures.js'

const makeMemPool = (): Pool => {
  const db = newDb({ noAstCoverageCheck: true })
  const { Pool: MemPool } = db.adapters.createPg()
  return new MemPool() as unknown as Pool
}

runMessageStoreContract(
  'PostgresMessageStore (pg-mem)',
  () => new PostgresMessageStore({ pool: makeMemPool() }),
)

describe('PostgresMessageStore — adapter specifics', () => {
  it('PM1: migration is idempotent across two store instances on same pool', async () => {
    const pool = makeMemPool()
    const a = new PostgresMessageStore({ pool })
    await a.saveChat(sampleChat('a@s.whatsapp.net'))
    const b = new PostgresMessageStore({ pool })
    const read = await b.getChat('a@s.whatsapp.net')
    expect(read).toBeDefined()
    await a.close()
    await b.close()
  })

  it('PM2: listMessages newest-first within a jid', async () => {
    const store = new PostgresMessageStore({ pool: makeMemPool() })
    const jid = 'idx@s.whatsapp.net'
    const msgs = sampleMessages(jid, 20)
    for (const m of msgs) await store.saveMessage(m)
    const list = await store.listMessages(jid, { limit: 5 })
    expect(list.length).toBe(5)
    for (let i = 1; i < list.length; i += 1) {
      expect(Number(list[i - 1]!.messageTimestamp)).toBeGreaterThanOrEqual(
        Number(list[i]!.messageTimestamp),
      )
    }
    await store.close()
  })

  it('PM3: ON CONFLICT (remote_jid, id, from_me) updates instead of inserting', async () => {
    const pool = makeMemPool()
    const store = new PostgresMessageStore({ pool })
    const [m] = sampleMessages('upsert@s.whatsapp.net', 1)
    await store.saveMessage(m!)
    const updated = { ...m!, message: { conversation: 'changed' } }
    await store.saveMessage(updated as never)
    const res = await pool.query('SELECT COUNT(*)::int AS c FROM zaileys_messages')
    expect(res.rows[0].c).toBe(1)
    const read = await store.getMessage(m!.key)
    expect(read!.message?.conversation).toBe('changed')
    await store.close()
  })

  it('PM4: presence round-trip last-write-wins (no TTL)', async () => {
    const store = new PostgresMessageStore({ pool: makeMemPool() })
    const jid = 'pres@s.whatsapp.net'
    await store.savePresence(jid, samplePresence())
    const a = await store.getPresence(jid)
    expect(a?.lastKnownPresence).toBe('available')
    await store.savePresence(jid, { lastKnownPresence: 'composing', lastSeen: 999 } as never)
    const b = await store.getPresence(jid)
    expect(b?.lastKnownPresence).toBe('composing')
    expect(b?.lastSeen).toBe(999)
    await store.close()
  })

  it('PM5: clear() wipes all four tables', async () => {
    const pool = makeMemPool()
    const store = new PostgresMessageStore({ pool })
    await store.saveMessage(sampleMessages('a@s.whatsapp.net', 1)[0]!)
    await store.saveChat(sampleChat('c@s.whatsapp.net'))
    await store.saveContact(sampleContact('u@s.whatsapp.net'))
    await store.savePresence('p@s.whatsapp.net', samplePresence())
    await store.clear()
    for (const t of [
      'zaileys_messages',
      'zaileys_chats',
      'zaileys_contacts',
      'zaileys_presence',
    ]) {
      const r = await pool.query(`SELECT COUNT(*)::int AS c FROM ${t}`)
      expect(r.rows[0].c).toBe(0)
    }
    await store.close()
  })

  it('PM6: passing both pool and connectionString throws', () => {
    expect(
      () =>
        new PostgresMessageStore({ pool: makeMemPool(), connectionString: 'postgres://x' }),
    ).toThrowError(/either pool or connectionString/)
  })
})

describe.skipIf(!process.env.DATABASE_URL)('PostgresMessageStore (real)', () => {
  runMessageStoreContract(
    'PostgresMessageStore (DATABASE_URL)',
    () => new PostgresMessageStore({ connectionString: process.env.DATABASE_URL! }),
    async (store) => {
      await store.clear().catch(() => undefined)
    },
  )
})
