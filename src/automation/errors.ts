export type AutomationErrorCode =
  | 'NOT_CONNECTED'
  | 'RATE_LIMIT_INVALID'
  | 'TASK_FAILED'
  | 'SCHEDULE_INVALID'
  | 'STORE_UNAVAILABLE'
  | 'PRESENCE_FAILED'

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
