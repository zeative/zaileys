/**
 * Discriminated error codes for {@link ZaileysStoreError}.
 *
 * - `STORE_NOT_AVAILABLE` — optional peer dependency missing.
 * - `STORE_CONNECTION_FAILED` — backend handshake failed.
 * - `STORE_WRITE_FAILED` — write rejected after retries.
 * - `STORE_READ_FAILED` — read rejected after retries.
 * - `STORE_CORRUPTED` — data integrity check failed.
 * - `STORE_CLOSED` — method invoked after `close()` resolved.
 */
export type StoreErrorCode =
  | 'STORE_NOT_AVAILABLE'
  | 'STORE_CONNECTION_FAILED'
  | 'STORE_WRITE_FAILED'
  | 'STORE_READ_FAILED'
  | 'STORE_CORRUPTED'
  | 'STORE_CLOSED'

/**
 * Typed error thrown by every Zaileys store adapter.
 * Implementers MUST keep raw credentials out of `message` and `cause` —
 * the `code` field is the contract surface for callers.
 */
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
