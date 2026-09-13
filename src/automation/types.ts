export type RateLimiterOptions = {
  perSec: number
  perJidPerSec?: number
  burst?: number
}

export type RetryPolicy = {
  maxRetries: number
  backoffMs: (attempt: number) => number
}

export type TaskQueueOptions = {
  /** Reject new work past this backlog instead of growing without bound. Default 10000. */
  maxPending?: number
  /** Per-task deadline; a hung task otherwise parks its concurrency slot forever. Default 120000. */
  taskTimeoutMs?: number
  concurrency?: number
  retry?: RetryPolicy
}

export type BroadcastOptions = {
  rateLimitPerSec?: number
  retry?: RetryPolicy
  onProgress?: (done: number, total: number, jid: string, ok: boolean) => void
}

export type BroadcastResult = {
  sent: string[]
  failed: { jid: string; error: Error }[]
}

export type ScheduledJob = {
  id: string
  fireAt: number
  recipient: string
  payload: unknown
}
