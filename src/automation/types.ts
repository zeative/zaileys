/**
 * Configuration for {@link RateLimiter}. `perSec` is the sustained global rate,
 * `perJidPerSec` an optional stricter per-recipient ceiling, and `burst` the
 * bucket capacity (defaults to `perSec`).
 */
export type RateLimiterOptions = {
  perSec: number
  perJidPerSec?: number
  burst?: number
}

/**
 * Retry contract for {@link TaskQueue}. `backoffMs` is invoked with the upcoming
 * attempt number (1-based) and returns the delay before that attempt.
 */
export type RetryPolicy = {
  maxRetries: number
  backoffMs: (attempt: number) => number
}

/**
 * Construction options for {@link TaskQueue}. `concurrency` caps in-flight tasks
 * (default 1); `retry` configures per-task retry behaviour.
 */
export type TaskQueueOptions = {
  concurrency?: number
  retry?: RetryPolicy
}

/**
 * Options for a broadcast run. `rateLimitPerSec` paces sends; `onProgress` is
 * fired after each recipient resolves with its outcome.
 */
export type BroadcastOptions = {
  rateLimitPerSec?: number
  retry?: RetryPolicy
  onProgress?: (done: number, total: number, jid: string, ok: boolean) => void
}

/**
 * Outcome of a broadcast: jids that succeeded and the per-recipient failures.
 */
export type BroadcastResult = {
  sent: string[]
  failed: { jid: string; error: Error }[]
}

/**
 * A persisted scheduled send. `fireAt` is an epoch-millis timestamp.
 */
export type ScheduledJob = {
  id: string
  fireAt: number
  recipient: string
  payload: unknown
}
