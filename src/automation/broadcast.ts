import type { MessageBuilder } from '../builder/builder.js'
import { RateLimiter, type RateLimiterClock } from './rate-limiter.js'
import { TaskQueue } from './queue.js'
import type { BroadcastOptions, BroadcastResult } from './types.js'

export type BroadcastDeps = {
  sendTo: (jid: string) => MessageBuilder<'init'>
  limiter?: RateLimiter
  now?: () => number
  sleep?: (ms: number) => Promise<void>
}

const toError = (value: unknown): Error =>
  value instanceof Error ? value : new Error(typeof value === 'string' ? value : String(value))

export async function runBroadcast(
  jids: string[],
  build: (b: MessageBuilder<'init'>) => MessageBuilder<'content-set'>,
  deps: BroadcastDeps,
  options: BroadcastOptions = {},
): Promise<BroadcastResult> {
  const result: BroadcastResult = { sent: [], failed: [] }
  if (jids.length === 0) {
    return result
  }

  const perSec = options.rateLimitPerSec ?? 5
  const clock: RateLimiterClock = {}
  if (deps.now) clock.now = deps.now
  if (deps.sleep) clock.sleep = deps.sleep
  const limiter = deps.limiter ?? new RateLimiter({ perSec }, clock)

  const retry = options.retry
  const queueClock = deps.sleep ? { sleep: deps.sleep } : {}
  const queue = retry ? new TaskQueue({ concurrency: 1, retry }, queueClock) : undefined

  const total = jids.length
  let done = 0

  for (const jid of jids) {
    await limiter.acquire(jid)
    const attempt = (): Promise<void> => build(deps.sendTo(jid)).then(() => undefined)
    try {
      if (queue) {
        await queue.add(attempt)
      } else {
        await attempt()
      }
      result.sent.push(jid)
      done += 1
      options.onProgress?.(done, total, jid, true)
    } catch (error) {
      result.failed.push({ jid, error: toError(error) })
      done += 1
      options.onProgress?.(done, total, jid, false)
    }
  }

  return result
}
