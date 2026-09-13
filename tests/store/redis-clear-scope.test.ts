import { describe, expect, it } from 'vitest'
import { RedisMessageStore } from '../../src/store/adapters/redis.js'

/**
 * A message-store clear() must never reach the auth store. Both adapters default to the same
 * `zaileys` namespace, so a `SCAN MATCH 'zaileys:*'` sweep would delete the session credentials.
 */
type FakeKeys = Map<string, string>

function fakeRedis(keys: string[]) {
  const store: FakeKeys = new Map(keys.map((k) => [k, '1']))
  const scanned: string[] = []
  const deleted: string[] = []
  const globToRe = (pattern: string): RegExp =>
    new RegExp('^' + pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.') + '$')
  return {
    store,
    scanned,
    deleted,
    client: {
      isOpen: true,
      async connect() {},
      async quit() {},
      on() {},
      async scan(_cursor: number, opts: { MATCH: string; COUNT: number }) {
        scanned.push(opts.MATCH)
        const re = globToRe(opts.MATCH)
        return { cursor: 0, keys: [...store.keys()].filter((k) => re.test(k)) }
      },
      async del(keys: string[]) {
        for (const k of keys) {
          store.delete(k)
          deleted.push(k)
        }
        return keys.length
      },
      multi() {
        return { exec: async () => [] }
      },
    },
  }
}

const AUTH_KEYS = [
  'zaileys:auth:creds',
  'zaileys:auth:signal:pre-key:1',
  'zaileys:auth:signal-index:pre-key',
]
const STORE_KEYS = [
  'zaileys:msg:628@s.whatsapp.net',
  'zaileys:msg-data:628@s.whatsapp.net',
  'zaileys:chats',
  'zaileys:chats-archived',
  'zaileys:contacts',
  'zaileys:presence:628@s.whatsapp.net',
]

describe('RedisMessageStore.clear() key scope', () => {
  it('deletes every store key', async () => {
    const fake = fakeRedis([...STORE_KEYS, ...AUTH_KEYS])
    const store = new RedisMessageStore({ client: fake.client as never })
    await store.clear()
    for (const k of STORE_KEYS) expect(fake.store.has(k)).toBe(false)
  })

  it('never deletes an auth key — a clear must not log the bot out', async () => {
    const fake = fakeRedis([...STORE_KEYS, ...AUTH_KEYS])
    const store = new RedisMessageStore({ client: fake.client as never })
    await store.clear()
    expect(fake.deleted.filter((k) => k.includes(':auth:'))).toEqual([])
    for (const k of AUTH_KEYS) expect(fake.store.has(k)).toBe(true)
  })

  it('never issues a scan pattern broad enough to match an auth key', async () => {
    const fake = fakeRedis([...STORE_KEYS, ...AUTH_KEYS])
    const store = new RedisMessageStore({ client: fake.client as never })
    await store.clear()
    expect(fake.scanned.length).toBeGreaterThan(0)
    expect(fake.scanned).not.toContain('zaileys:*')
  })

  it('rejects a namespace containing glob metacharacters', () => {
    for (const bad of ['*', 'tenant*', 'a?b', 'a[0-9]']) {
      expect(() => new RedisMessageStore({ client: fakeRedis([]).client as never, namespace: bad })).toThrow()
    }
  })
})
