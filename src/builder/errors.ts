/**
 * Discriminated error codes for {@link ZaileysBuilderError}.
 *
 * - `MEDIA_LOAD_FAILED` — fetch/read of a {@link MediaSource} failed.
 * - `INVALID_RECIPIENT` — recipient jid/username is malformed.
 * - `USERNAME_NOT_FOUND` — username could not be resolved to a jid.
 * - `EMPTY_CONTENT` — terminal action invoked with no content set.
 * - `INVALID_OPTIONS` — supplied option object failed validation.
 * - `SEND_FAILED` — the underlying socket send rejected.
 * - `MESSAGE_NOT_FOUND` — referenced source message was not found.
 */
export type BuilderErrorCode =
  | 'MEDIA_LOAD_FAILED'
  | 'INVALID_RECIPIENT'
  | 'USERNAME_NOT_FOUND'
  | 'EMPTY_CONTENT'
  | 'INVALID_OPTIONS'
  | 'SEND_FAILED'
  | 'MESSAGE_NOT_FOUND'

/**
 * Typed error thrown by the message builder. The `code` field is the contract
 * surface for callers; keep raw payloads out of `message` and `cause`.
 */
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
