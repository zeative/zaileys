export type CloudErrorCode = 'CONFIG' | 'AUTH' | 'REQUEST_FAILED' | 'RATE_LIMITED' | 'NOT_IMPLEMENTED'

export class ZaileysCloudError extends Error {
  readonly code: CloudErrorCode
  override readonly cause?: unknown

  constructor(code: CloudErrorCode, message: string, options?: { cause?: unknown }) {
    super(message)
    this.name = 'ZaileysCloudError'
    this.code = code
    if (options && 'cause' in options) {
      this.cause = options.cause
    }
    if (typeof (Error as { captureStackTrace?: unknown }).captureStackTrace === 'function') {
      ;(Error as unknown as { captureStackTrace: (target: object, ctor: Function) => void }).captureStackTrace(
        this,
        ZaileysCloudError,
      )
    }
  }
}
