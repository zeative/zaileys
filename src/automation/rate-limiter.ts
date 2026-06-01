import { ZaileysAutomationError } from './errors.js'
import type { RateLimiterOptions } from './types.js'

export type RateLimiterClock = {
  now?: () => number
  sleep?: (ms: number) => Promise<void>
}

type Bucket = {
  tokens: number
  capacity: number
  ratePerMs: number
  last: number
}

const defaultSleep = (ms: number): Promise<void> =>
  ms <= 0 ? Promise.resolve() : new Promise((resolve) => setTimeout(resolve, ms))

export class RateLimiter {
  private readonly now: () => number
  private readonly sleep: (ms: number) => Promise<void>
  private readonly perJidRatePerMs?: number
  private readonly perJidCapacity?: number
  private readonly global: Bucket
  private readonly perJid = new Map<string, Bucket>()

  constructor(options: RateLimiterOptions, clock: RateLimiterClock = {}) {
    if (!(options.perSec > 0)) {
      throw new ZaileysAutomationError('RATE_LIMIT_INVALID', 'perSec must be greater than zero')
    }
    if (options.perJidPerSec !== undefined && !(options.perJidPerSec > 0)) {
      throw new ZaileysAutomationError('RATE_LIMIT_INVALID', 'perJidPerSec must be greater than zero')
    }
    if (options.burst !== undefined && !(options.burst > 0)) {
      throw new ZaileysAutomationError('RATE_LIMIT_INVALID', 'burst must be greater than zero')
    }

    this.now = clock.now ?? Date.now
    this.sleep = clock.sleep ?? defaultSleep

    const capacity = options.burst ?? options.perSec
    this.global = {
      tokens: capacity,
      capacity,
      ratePerMs: options.perSec / 1000,
      last: this.now(),
    }

    if (options.perJidPerSec !== undefined) {
      this.perJidRatePerMs = options.perJidPerSec / 1000
      this.perJidCapacity = options.perJidPerSec
    }
  }

  async acquire(jid?: string): Promise<void> {
    await this.consume(this.global)
    if (jid !== undefined && this.perJidRatePerMs !== undefined) {
      await this.consume(this.bucketFor(jid))
    }
  }

  private bucketFor(jid: string): Bucket {
    const existing = this.perJid.get(jid)
    if (existing) {
      return existing
    }
    const capacity = this.perJidCapacity ?? 1
    const bucket: Bucket = {
      tokens: capacity,
      capacity,
      ratePerMs: this.perJidRatePerMs ?? 1,
      last: this.now(),
    }
    this.perJid.set(jid, bucket)
    return bucket
  }

  private consume(bucket: Bucket): Promise<void> {
    this.refill(bucket)
    if (bucket.tokens >= 1) {
      bucket.tokens -= 1
      return Promise.resolve()
    }
    const wait = (1 - bucket.tokens) / bucket.ratePerMs
    bucket.tokens -= 1
    return this.sleep(wait)
  }

  private refill(bucket: Bucket): void {
    const current = this.now()
    const elapsed = current - bucket.last
    if (elapsed > 0) {
      bucket.tokens = Math.min(bucket.capacity, bucket.tokens + elapsed * bucket.ratePerMs)
      bucket.last = current
    }
  }
}
