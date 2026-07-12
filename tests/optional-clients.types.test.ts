import { describe, expect, it } from 'vitest'
import type { Pool } from 'pg'
import type { RedisClientType } from 'redis'
import type { PgPoolLike, RedisClientLike } from '../src/types/optional-clients.js'

// compile-time regression: real optional-peer clients must stay structurally
// assignable to the Like stand-ins, or passing them to adapter options breaks
type AssertPg = Pool extends PgPoolLike ? true : never
type AssertRedis = RedisClientType extends RedisClientLike ? true : never

describe('optional client structural compatibility', () => {
  it('real pg.Pool and redis client satisfy the Like types', () => {
    const pgOk: AssertPg = true
    const redisOk: AssertRedis = true
    expect(pgOk).toBe(true)
    expect(redisOk).toBe(true)
  })
})
