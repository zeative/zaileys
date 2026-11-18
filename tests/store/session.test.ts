import { describe, expect, it, vi } from 'vitest'
import { MemoryMessageStore } from '../../src/store/adapters/memory.js'
import {
  MemorySessionValues,
  SESSION_KEY_MAX_LENGTH,
  SESSION_VALUE_MAX_BYTES,
  SessionScopes,
  sessionScopeOf,
} from '../../src/store/session.js'
import type { MessageStore } from '../../src/store/types.js'

/** Own `undefined` properties shadow the prototype's methods, like a store written before sessions existed. */
const withoutSessions = <S extends MessageStore>(store: S): S =>
  Object.assign(store, {
    getSessionValue: undefined,
    setSessionValue: undefined,
    deleteSessionValue: undefined,
    clearSession: undefined,
  })

describe('sessionScopeOf', () => {
  it('drops the device suffix so every device of one user shares a scope', () => {
    expect(sessionScopeOf('628111:12@s.whatsapp.net')).toBe('628111@s.whatsapp.net')
    expect(sessionScopeOf('628111@s.whatsapp.net')).toBe('628111@s.whatsapp.net')
  })

  it('folds c.us into s.whatsapp.net and reads a bare phone number as a phone JID', () => {
    expect(sessionScopeOf('628111@c.us')).toBe('628111@s.whatsapp.net')
    expect(sessionScopeOf('+62 811-1')).toBe('628111@s.whatsapp.net')
  })

  it('keeps a LID its own scope, never merged with a phone number with the same digits', () => {
    expect(sessionScopeOf('628111:3@lid')).toBe('628111@lid')
    expect(sessionScopeOf('628111@lid')).not.toBe(sessionScopeOf('628111@s.whatsapp.net'))
  })

  it.each(['', 'not a jid', '@s.whatsapp.net', 'x'.repeat(300)])('rejects %j with STORE_INVALID_INPUT', (bad) => {
    expect(() => sessionScopeOf(bad)).toThrow(expect.objectContaining({ code: 'STORE_INVALID_INPUT' }))
  })
})

describe('MemorySessionValues — bounds', () => {
  it('exposes the documented limits', () => {
    expect(SESSION_VALUE_MAX_BYTES).toBe(65_536)
    expect(SESSION_KEY_MAX_LENGTH).toBe(256)
  })

  it('drops the least recently written value once maxValues is reached', async () => {
    const values = new MemorySessionValues({ maxValues: 3 })
    await values.set('a', 'k1', 1)
    await values.set('a', 'k2', 2)
    await values.set('b', 'k3', 3)
    await values.set('a', 'k1', 'rewritten')
    await values.set('c', 'k4', 4)
    await expect(values.get('a', 'k2')).resolves.toBeUndefined()
    await expect(values.get('a', 'k1')).resolves.toBe('rewritten')
    await expect(values.get('b', 'k3')).resolves.toBe(3)
    await expect(values.get('c', 'k4')).resolves.toBe(4)
  })

  it('drops the oldest values once maxBytes is reached', async () => {
    const values = new MemorySessionValues({ maxBytes: SESSION_VALUE_MAX_BYTES })
    const half = 'x'.repeat(SESSION_VALUE_MAX_BYTES / 2)
    await values.set('a', 'first', half)
    await values.set('a', 'second', half)
    await expect(values.get('a', 'first')).resolves.toBeUndefined()
    await expect(values.get('a', 'second')).resolves.toBe(half)
  })

  it('keeps 10 000 values by default and no more', async () => {
    const values = new MemorySessionValues()
    for (let i = 0; i < 10_001; i += 1) await values.set(`${i % 100}@s.whatsapp.net`, `k${i}`, i)
    await expect(values.get('0@s.whatsapp.net', 'k0')).resolves.toBeUndefined()
    await expect(values.get('1@s.whatsapp.net', 'k1')).resolves.toBe(1)
    await expect(values.get('0@s.whatsapp.net', 'k10000')).resolves.toBe(10_000)
  })

  it('rejects limits that could not hold one value', () => {
    expect(() => new MemorySessionValues({ maxValues: 0 })).toThrow(
      expect.objectContaining({ code: 'STORE_CONNECTION_FAILED' }),
    )
    expect(() => new MemoryMessageStore({ maxSessionBytes: 1024 })).toThrow(
      expect.objectContaining({ code: 'STORE_CONNECTION_FAILED' }),
    )
  })
})

describe('SessionScopes', () => {
  it('uses the store’s own session methods when it has them', async () => {
    const store = new MemoryMessageStore()
    const warn = vi.fn()
    const scopes = new SessionScopes(store, { warn })
    await scopes.handle('628111:4@s.whatsapp.net').set('lang', 'id')
    await expect(store.getSessionValue('628111@s.whatsapp.net', 'lang')).resolves.toBe('id')
    expect(warn).not.toHaveBeenCalled()
  })

  it('handles get, set with ttl, delete, and clear for one scope', async () => {
    const scopes = new SessionScopes(new MemoryMessageStore(), { warn: vi.fn() })
    const alice = scopes.handle('628111@s.whatsapp.net')
    const bob = scopes.handle('628222@s.whatsapp.net')
    await alice.set('cart', { items: ['tea'] })
    await bob.set('cart', { items: ['coffee'] })
    await expect(alice.get<{ items: string[] }>('cart')).resolves.toEqual({ items: ['tea'] })
    vi.useFakeTimers({ toFake: ['Date'] })
    try {
      await alice.set('otp', '1234', { ttl: 1_000 })
      vi.setSystemTime(Date.now() + 1_000)
      await expect(alice.get('otp')).resolves.toBeUndefined()
    } finally {
      vi.useRealTimers()
    }
    await alice.delete('cart')
    await expect(alice.get('cart')).resolves.toBeUndefined()
    await bob.set('lang', 'en')
    await bob.clear()
    await expect(bob.get('cart')).resolves.toBeUndefined()
    await expect(bob.get('lang')).resolves.toBeUndefined()
  })

  it('falls back to a bounded memory map and warns once, naming the store', async () => {
    class LegacyStore extends MemoryMessageStore {}
    const legacy = withoutSessions(new LegacyStore())
    const warn = vi.fn()
    const scopes = new SessionScopes(legacy, { warn })
    await scopes.handle('628111@s.whatsapp.net').set('lang', 'id')
    await expect(scopes.handle('628111:9@s.whatsapp.net').get('lang')).resolves.toBe('id')
    await scopes.handle('628222@s.whatsapp.net').get('lang')
    expect(warn).toHaveBeenCalledTimes(1)
    expect(String(warn.mock.calls[0]?.[1])).toContain('LegacyStore')
  })

  it('falls back when the store implements only some of the methods', async () => {
    const store = Object.assign(withoutSessions(new MemoryMessageStore()), {
      getSessionValue: async () => 'from-store',
    })
    const warn = vi.fn()
    const handle = new SessionScopes(store, { warn }).handle('628111@s.whatsapp.net')
    await expect(handle.get('lang')).resolves.toBeUndefined()
    expect(warn).toHaveBeenCalledTimes(1)
  })

  it('does not throw for a bad JID until a method is called', async () => {
    const handle = new SessionScopes(new MemoryMessageStore(), { warn: vi.fn() }).handle('')
    await expect(handle.get('k')).rejects.toMatchObject({ code: 'STORE_INVALID_INPUT' })
    await expect(handle.set('k', 1)).rejects.toMatchObject({ code: 'STORE_INVALID_INPUT' })
  })

  it('passes the ttl option through and rejects a bad one', async () => {
    const handle = new SessionScopes(new MemoryMessageStore(), { warn: vi.fn() }).handle('628111@s.whatsapp.net')
    await expect(handle.set('k', 1, { ttl: 0 })).rejects.toMatchObject({ code: 'STORE_INVALID_INPUT' })
    await expect(handle.set('k', 'x'.repeat(SESSION_VALUE_MAX_BYTES))).rejects.toMatchObject({
      code: 'STORE_VALUE_TOO_LARGE',
    })
  })
})
