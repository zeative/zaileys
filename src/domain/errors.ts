export type DomainErrorCode =
  | 'NOT_CONNECTED'
  | 'GROUP_NOT_FOUND'
  | 'NEWSLETTER_NOT_FOUND'
  | 'INVALID_PARTICIPANT'
  | 'OPERATION_FAILED'

export class ZaileysDomainError extends Error {
  readonly code: DomainErrorCode
  override readonly cause?: unknown

  constructor(code: DomainErrorCode, message: string, options?: { cause?: unknown }) {
    super(message)
    this.name = 'ZaileysDomainError'
    this.code = code
    if (options && 'cause' in options) {
      this.cause = options.cause
    }
    if (typeof (Error as { captureStackTrace?: unknown }).captureStackTrace === 'function') {
      ;(Error as unknown as { captureStackTrace: (target: object, ctor: Function) => void }).captureStackTrace(
        this,
        ZaileysDomainError,
      )
    }
  }
}
