export type StoreErrorCode =
  | 'STORE_NOT_AVAILABLE'
  | 'STORE_CONNECTION_FAILED'
  | 'STORE_WRITE_FAILED'
  | 'STORE_READ_FAILED'
  | 'STORE_CORRUPTED'
  | 'STORE_CLOSED'

export class ZaileysStoreError extends Error {
  readonly code: StoreErrorCode
  override readonly cause?: unknown

  constructor(code: StoreErrorCode, message: string, options?: { cause?: unknown }) {
    super(message)
    this.name = 'ZaileysStoreError'
    this.code = code
    if (options && 'cause' in options) {
      this.cause = options.cause
    }
    if (typeof (Error as { captureStackTrace?: unknown }).captureStackTrace === 'function') {
      ;(Error as unknown as { captureStackTrace: (target: object, ctor: Function) => void }).captureStackTrace(
        this,
        ZaileysStoreError,
      )
    }
  }
}
