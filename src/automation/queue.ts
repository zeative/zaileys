import type { RetryPolicy, TaskQueueOptions } from './types.js'

/**
 * Injectable backoff sleeper for {@link TaskQueue}. Defaults to `setTimeout`;
 * tests override it for fake-timer determinism.
 */
export type TaskQueueClock = {
  sleep?: (ms: number) => Promise<void>
}

type Job = {
  run: () => Promise<void>
}

const defaultRetry: RetryPolicy = { maxRetries: 0, backoffMs: () => 0 }

const defaultSleep = (ms: number): Promise<void> =>
  ms <= 0 ? Promise.resolve() : new Promise((resolve) => setTimeout(resolve, ms))

/**
 * Bounded-concurrency task queue with a configurable retry policy.
 *
 * Tasks added via {@link add} run subject to the `concurrency` limit. A failing
 * task is retried up to `retry.maxRetries` times, sleeping `retry.backoffMs(n)`
 * before attempt `n` (1-based). When retries are exhausted the queue rejects
 * with the original error so callers (e.g. broadcast) can record the exact cause
 * per recipient.
 */
export class TaskQueue {
  private readonly concurrency: number
  private readonly retry: RetryPolicy
  private readonly sleep: (ms: number) => Promise<void>
  private readonly pending: Job[] = []
  private active = 0
  private idleWaiters: (() => void)[] = []

  constructor(options: TaskQueueOptions = {}, clock: TaskQueueClock = {}) {
    this.concurrency = options.concurrency ?? 1
    this.retry = options.retry ?? defaultRetry
    this.sleep = clock.sleep ?? defaultSleep
  }

  add<T>(task: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      this.pending.push({
        run: () => this.execute(task).then(resolve, reject),
      })
      this.pump()
    })
  }

  onIdle(): Promise<void> {
    if (this.active === 0 && this.pending.length === 0) {
      return Promise.resolve()
    }
    return new Promise((resolve) => {
      this.idleWaiters.push(resolve)
    })
  }

  private pump(): void {
    while (this.active < this.concurrency && this.pending.length > 0) {
      const job = this.pending.shift()
      if (!job) {
        break
      }
      this.active++
      void job.run().finally(() => {
        this.active--
        this.pump()
        this.settleIdle()
      })
    }
  }

  private settleIdle(): void {
    if (this.active === 0 && this.pending.length === 0 && this.idleWaiters.length > 0) {
      const waiters = this.idleWaiters
      this.idleWaiters = []
      for (const resolve of waiters) {
        resolve()
      }
    }
  }

  private async execute<T>(task: () => Promise<T>): Promise<T> {
    let attempt = 0
    for (;;) {
      try {
        return await task()
      } catch (error) {
        if (attempt >= this.retry.maxRetries) {
          throw error
        }
        attempt += 1
        await this.sleep(this.retry.backoffMs(attempt))
      }
    }
  }
}
