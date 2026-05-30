/**
 * Discriminated error codes for {@link ZaileysAutomationError}.
 *
 * - `NOT_CONNECTED` — an automation helper was used while the client socket is absent.
 * - `RATE_LIMIT_INVALID` — a rate-limiter option (e.g. `perSec`) failed validation.
 * - `TASK_FAILED` — a queued task exhausted its retries.
 * - `SCHEDULE_INVALID` — a scheduled-send argument (date/recipient) failed validation.
 * - `STORE_UNAVAILABLE` — schedule persistence was requested without a backing store.
 * - `PRESENCE_FAILED` — the underlying presence update rejected.
 */
export type AutomationErrorCode =
  | 'NOT_CONNECTED'
  | 'RATE_LIMIT_INVALID'
  | 'TASK_FAILED'
  | 'SCHEDULE_INVALID'
  | 'STORE_UNAVAILABLE'
  | 'PRESENCE_FAILED'

/**
 * Typed error thrown by the automation utilities (rate limiter, queue, broadcast,
 * schedule, presence). The `code` field is the contract surface for callers; keep
 * raw payloads out of `message` and `cause`.
 */
export class ZaileysAutomationError extends Error {
  readonly code: AutomationErrorCode
  override readonly cause?: unknown

  constructor(code: AutomationErrorCode, message: string, options?: { cause?: unknown }) {
    super(message)
    this.name = 'ZaileysAutomationError'
    this.code = code
    if (options && 'cause' in options) {
      this.cause = options.cause
    }
    if (typeof (Error as { captureStackTrace?: unknown }).captureStackTrace === 'function') {
      ;(Error as unknown as { captureStackTrace: (target: object, ctor: Function) => void }).captureStackTrace(
        this,
        ZaileysAutomationError,
      )
    }
  }
}
