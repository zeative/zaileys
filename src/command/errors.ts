export type CommandErrorCode =
  | 'DUPLICATE_COMMAND'
  | 'INVALID_COMMAND_NAME'
  | 'HANDLER_ERROR'
  | 'MIDDLEWARE_ERROR'
  | 'NO_SENT_MESSAGE'
  | 'NOT_CONNECTED'

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
