/**
 * Discriminated error codes for {@link ZaileysDomainError}.
 *
 * - `NOT_CONNECTED` — a domain module was used while the client socket is absent.
 * - `GROUP_NOT_FOUND` — referenced group jid could not be resolved.
 * - `NEWSLETTER_NOT_FOUND` — referenced newsletter jid could not be resolved.
 * - `INVALID_PARTICIPANT` — participant jid/argument failed validation.
 * - `OPERATION_FAILED` — the underlying socket call rejected.
 */
export type DomainErrorCode =
  | 'NOT_CONNECTED'
  | 'GROUP_NOT_FOUND'
  | 'NEWSLETTER_NOT_FOUND'
  | 'INVALID_PARTICIPANT'
  | 'OPERATION_FAILED'

/**
 * Typed error thrown by the domain modules (group/privacy/newsletter/community).
 * The `code` field is the contract surface for callers; keep raw payloads out of
 * `message` and `cause`.
 */
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
