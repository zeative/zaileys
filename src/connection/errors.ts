export type ConnectionErrorCode =
  | 'INVALID_OPTIONS'
  | 'CREDS_READ_FAILED'
  | 'CONNECT_ABORTED'
  | 'CONNECTION_CLOSED'
  | 'SESSION_PROTECTED'
  | 'STORE_NOT_REOPENABLE'
  | 'PAIRING_FAILED'
  | 'INVALID_STATE'

export class ZaileysConnectionError extends Error {
  readonly code: ConnectionErrorCode
  override readonly cause?: unknown

  constructor(code: ConnectionErrorCode, message: string, options?: { cause?: unknown }) {
    super(message)
    this.name = 'ZaileysConnectionError'
    this.code = code
    if (options && 'cause' in options) {
      this.cause = options.cause
    }
    if (typeof (Error as { captureStackTrace?: unknown }).captureStackTrace === 'function') {
      ;(Error as unknown as { captureStackTrace: (target: object, ctor: Function) => void }).captureStackTrace(
        this,
        ZaileysConnectionError,
      )
    }
  }
}
