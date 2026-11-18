import { describe, expect, it } from 'vitest'
import { createSocketCaches } from '../../src/connection/socket-caches.js'

describe('createSocketCaches', () => {
  it('stores, reads, and deletes values through the baileys CacheStore contract', () => {
    const { userDevicesCache } = createSocketCaches()
    userDevicesCache.set('628123', [{ device: 0 }])
    expect(userDevicesCache.get('628123')).toEqual([{ device: 0 }])
    userDevicesCache.del('628123')
    expect(userDevicesCache.get('628123')).toBeUndefined()
  })

  it('treats setting undefined as a delete instead of throwing', () => {
    const { msgRetryCounterCache } = createSocketCaches()
    msgRetryCounterCache.set('msg-1', 2)
    msgRetryCounterCache.set('msg-1', undefined)
    expect(msgRetryCounterCache.get('msg-1')).toBeUndefined()
  })

  it('expires device lists after five minutes and retry counts after an hour', () => {
    let now = 1_000
    const caches = createSocketCaches({ now: () => now })
    caches.userDevicesCache.set('u', ['d'])
    caches.msgRetryCounterCache.set('m', 1)
    now += 5 * 60_000 + 1
    expect(caches.userDevicesCache.get('u')).toBeUndefined()
    expect(caches.msgRetryCounterCache.get('m')).toBe(1)
    now += 55 * 60_000
    expect(caches.msgRetryCounterCache.get('m')).toBeUndefined()
  })

  it('stays bounded under a flood of distinct keys', () => {
    const { msgRetryCounterCache } = createSocketCaches()
    for (let i = 0; i < 20_000; i += 1) msgRetryCounterCache.set(`m${i}`, i)
    expect(msgRetryCounterCache.get('m0')).toBeUndefined()
    expect(msgRetryCounterCache.get('m19999')).toBe(19_999)
  })

  it('flushAll empties the cache', () => {
    const { userDevicesCache } = createSocketCaches()
    userDevicesCache.set('a', 1)
    userDevicesCache.flushAll()
    expect(userDevicesCache.get('a')).toBeUndefined()
  })
})
