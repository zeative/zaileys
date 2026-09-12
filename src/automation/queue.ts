import type { RetryPolicy, TaskQueueOptions } from './types.js'
import { ZaileysAutomationError } from './errors.js'

const DEFAULT_MAX_PENDING = 10_000
const DEFAULT_TASK_TIMEOUT_MS = 120_000

export type TaskQueueClock = {
  sleep?: (ms: number) => Promise<void>
}

type Job = {
  run: () => Promise<void>
}

const defaultRetry: RetryPolicy = { maxRetries: 0, backoffMs: () => 0 }

const defaultSleep = (ms: number): Promise<void> =>
  ms <= 0 ? Promise.resolve() : new Promise((resolve) => setTimeout(resolve, ms))

export class TaskQueue {
  private readonly concurrency: number
  private readonly retry: RetryPolicy
  private readonly sleep: (ms: number) => Promise<void>
  /** Bounded backlog: an unbounded queue plus a hung task retains every caller's closure forever. */
  private readonly pending: Job[] = []
  private readonly maxPending: number
  private readonly taskTimeoutMs: number
  private active = 0
  private idleWaiters: (() => void)[] = []

  constructor(options: TaskQueueOptions = {}, clock: TaskQueueClock = {}) {
    this.concurrency = options.concurrency ?? 1
    this.retry = options.retry ?? defaultRetry
    this.sleep = clock.sleep ?? defaultSleep
    this.maxPending = options.maxPending ?? DEFAULT_MAX_PENDING
    this.taskTimeoutMs = options.taskTimeoutMs ?? DEFAULT_TASK_TIMEOUT_MS
  }

  add<T>(task: () => Promise<T>): Promise<T> {
    if (this.pending.length >= this.maxPending) {
      return Promise.reject(
        new ZaileysAutomationError('QUEUE_FULL', `task queue is full (${this.maxPending} pending)`),
      )
    }
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

  /** A task with no deadline parks its concurrency slot forever on a half-open socket. */
  private async withDeadline<T>(task: () => Promise<T>): Promise<T> {
    if (this.taskTimeoutMs <= 0) return task()
    let timer: ReturnType<typeof setTimeout> | undefined
    try {
      return await Promise.race([
        task(),
        new Promise<never>((_resolve, reject) => {
          timer = setTimeout(
            () => reject(new ZaileysAutomationError('QUEUE_TIMEOUT', `task exceeded ${this.taskTimeoutMs}ms`)),
            this.taskTimeoutMs,
          )
        }),
      ])
    } finally {
      if (timer !== undefined) clearTimeout(timer)
    }
  }

  private async execute<T>(task: () => Promise<T>): Promise<T> {
    let attempt = 0
    for (;;) {
      try {
        return await this.withDeadline(task)
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
