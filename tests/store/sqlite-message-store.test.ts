import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { randomBytes } from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { SqliteMessageStore } from '../../src/store/adapters/sqlite.js'
import { runMessageStoreContract } from '../contracts/index.js'
import { sampleChat, sampleContact, sampleMessages, samplePresence } from '../contracts/fixtures.js'

const freshFile = (): string =>
  path.join(os.tmpdir(), `zaileys-sqlite-msg-${randomBytes(8).toString('hex')}.db`)

runMessageStoreContract(
  'SqliteMessageStore (memory)',
  () => new SqliteMessageStore({ database: ':memory:' }),
)

const fileDirs: string[] = []
runMessageStoreContract(
  'SqliteMessageStore (file)',
  () => {
    const p = freshFile()
    fileDirs.push(p)
    return new SqliteMessageStore({ database: p })
  },
  async () => {
    await Promise.all(
      fileDirs.splice(0).map(async (f) => {
        await fs.rm(f, { force: true }).catch(() => undefined)
        await fs.rm(`${f}-wal`, { force: true }).catch(() => undefined)
        await fs.rm(`${f}-shm`, { force: true }).catch(() => undefined)
      }),
    )
  },
)

describe('SqliteMessageStore — adapter specifics', () => {
  let filePath: string

  beforeEach(() => {
    filePath = freshFile()
  })

  afterEach(async () => {
    await fs.rm(filePath, { force: true }).catch(() => undefined)
    await fs.rm(`${filePath}-wal`, { force: true }).catch(() => undefined)
    await fs.rm(`${filePath}-shm`, { force: true }).catch(() => undefined)
  })

  it('M1: messages_by_jid_ts index covers listMessages query plan', async () => {
    const store = new SqliteMessageStore({ database: filePath })
    const jid = 'plan@s.whatsapp.net'
    for (const m of sampleMessages(jid, 3)) await store.saveMessage(m)
    const Driver = (await import('better-sqlite3')).default
    const raw = new Driver(filePath)
    const plan = raw
      .prepare(
        'EXPLAIN QUERY PLAN SELECT data FROM messages WHERE remote_jid = ? AND timestamp < ? ORDER BY timestamp DESC LIMIT ?',
      )
      .all(jid, Number.MAX_SAFE_INTEGER, 10) as Array<{ detail: string }>
    raw.close()
    const explain = plan.map((p) => p.detail).join('\n')
    expect(explain).toMatch(/messages_by_jid_ts/)
    await store.close()
  })

  it('M2: composite PK prevents accidental duplicate inserts', async () => {
    const store = new SqliteMessageStore({ database: filePath })
    const [m] = sampleMessages('dup@s.whatsapp.net', 1)
    await store.saveMessage(m!)
    await store.saveMessage(m!)
    const Driver = (await import('better-sqlite3')).default
    const raw = new Driver(filePath)
    const row = raw.prepare('SELECT COUNT(*) as n FROM messages').get() as { n: number }
    raw.close()
    expect(row.n).toBe(1)
    await store.close()
  })

  it('M3: listMessages returns DESC by timestamp', async () => {
    const store = new SqliteMessageStore({ database: ':memory:' })
    const jid = 'order@s.whatsapp.net'
    const msgs = sampleMessages(jid, 5)
    for (const m of msgs) await store.saveMessage(m)
    const list = await store.listMessages(jid)
    for (let i = 1; i < list.length; i += 1) {
      expect(Number(list[i - 1]!.messageTimestamp)).toBeGreaterThanOrEqual(
        Number(list[i]!.messageTimestamp),
      )
    }
    await store.close()
  })

  it('M4: before filter excludes equal-timestamp rows', async () => {
    const store = new SqliteMessageStore({ database: ':memory:' })
    const jid = 'before@s.whatsapp.net'
    const msgs = sampleMessages(jid, 5)
    for (const m of msgs) await store.saveMessage(m)
    const cutoff = 1_700_000_002
    const list = await store.listMessages(jid, { limit: 100, before: cutoff })
    for (const m of list) expect(Number(m.messageTimestamp)).toBeLessThan(cutoff)
    await store.close()
  })

  it('M5: clear() empties all 4 tables (raw COUNT)', async () => {
    const store = new SqliteMessageStore({ database: filePath })
    const [m] = sampleMessages('c@s.whatsapp.net', 1)
    await store.saveMessage(m!)
    await store.saveChat(sampleChat('c@s.whatsapp.net'))
    await store.saveContact(sampleContact('c@s.whatsapp.net'))
    await store.savePresence('c@s.whatsapp.net', samplePresence())
    await store.clear()
    const Driver = (await import('better-sqlite3')).default
    const raw = new Driver(filePath)
    const counts = {
      messages: (raw.prepare('SELECT COUNT(*) as n FROM messages').get() as { n: number }).n,
      chats: (raw.prepare('SELECT COUNT(*) as n FROM chats').get() as { n: number }).n,
      contacts: (raw.prepare('SELECT COUNT(*) as n FROM contacts').get() as { n: number }).n,
      presence: (raw.prepare('SELECT COUNT(*) as n FROM presence').get() as { n: number }).n,
    }
    raw.close()
    expect(counts).toEqual({ messages: 0, chats: 0, contacts: 0, presence: 0 })
    await store.close()
  })

  it('M6: idempotent close', async () => {
    const store = new SqliteMessageStore({ database: ':memory:' })
    await store.close()
    await expect(store.close()).resolves.toBeUndefined()
  })

  it('M7: invalid path surfaces STORE_CONNECTION_FAILED', async () => {
    const store = new SqliteMessageStore({ database: '/nonexistent/dir-xyz-zaileys/x.db' })
    await expect(store.getChat('any')).rejects.toMatchObject({
      name: 'ZaileysStoreError',
      code: 'STORE_CONNECTION_FAILED',
    })
  })
})
