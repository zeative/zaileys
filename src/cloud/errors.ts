export type CloudErrorCode = 'CONFIG' | 'AUTH' | 'REQUEST_FAILED' | 'RATE_LIMITED' | 'NOT_IMPLEMENTED'

/** Thrown when a WhatsApp-Web-only surface is used on the official Cloud API provider. */
export class ZaileysProviderError extends Error {
  readonly code = 'UNSUPPORTED_ON_CLOUD'
  readonly feature: string

  constructor(feature: string) {
    super(`${feature} is not supported by the official WhatsApp Cloud API — it only exists on the web (baileys) provider`)
    this.name = 'ZaileysProviderError'
    this.feature = feature
  }
}

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
