/**
 * Discriminated error codes for {@link ZaileysCommandError}.
 *
 * - `DUPLICATE_COMMAND` — a command name or alias was registered more than once.
 * - `INVALID_COMMAND_NAME` — a command name/alias/sub-command token failed validation.
 * - `HANDLER_ERROR` — a command handler threw while executing.
 * - `MIDDLEWARE_ERROR` — a middleware threw while executing.
 * - `NO_SENT_MESSAGE` — a context helper send resolved without a message key.
 * - `NOT_CONNECTED` — the dispatcher was invoked while the client socket is absent.
 */
export type CommandErrorCode =
  | 'DUPLICATE_COMMAND'
  | 'INVALID_COMMAND_NAME'
  | 'HANDLER_ERROR'
  | 'MIDDLEWARE_ERROR'
  | 'NO_SENT_MESSAGE'
  | 'NOT_CONNECTED'

/**
 * Typed error thrown by the command framework (parser/registry/middleware/dispatcher).
 * The `code` field is the contract surface for callers; keep raw payloads out of
 * `message` and `cause`.
 */
export class ZaileysCommandError extends Error {
  readonly code: CommandErrorCode
  override readonly cause?: unknown

  constructor(code: CommandErrorCode, message: string, options?: { cause?: unknown }) {
    super(message)
    this.name = 'ZaileysCommandError'
    this.code = code
    if (options && 'cause' in options) {
      this.cause = options.cause
    }
    if (typeof (Error as { captureStackTrace?: unknown }).captureStackTrace === 'function') {
      ;(Error as unknown as { captureStackTrace: (target: object, ctor: Function) => void }).captureStackTrace(
        this,
        ZaileysCommandError,
      )
    }
  }
}
