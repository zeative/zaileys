export type BuilderErrorCode =
  | 'MEDIA_LOAD_FAILED'
  | 'INVALID_RECIPIENT'
  | 'USERNAME_NOT_FOUND'
  | 'EMPTY_CONTENT'
  | 'INVALID_OPTIONS'
  | 'SEND_FAILED'
  | 'MESSAGE_NOT_FOUND'

export class ZaileysBuilderError extends Error {
  readonly code: BuilderErrorCode
  override readonly cause?: unknown

  constructor(code: BuilderErrorCode, message: string, options?: { cause?: unknown }) {
    super(message)
    this.name = 'ZaileysBuilderError'
    this.code = code
    if (options && 'cause' in options) {
      this.cause = options.cause
    }
    if (typeof (Error as { captureStackTrace?: unknown }).captureStackTrace === 'function') {
      ;(Error as unknown as { captureStackTrace: (target: object, ctor: Function) => void }).captureStackTrace(
        this,
        ZaileysBuilderError,
      )
    }
  }
}
