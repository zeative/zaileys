import type { Logger } from '../client/types.js'
import type { CallPayload } from '../events/types.js'
import { ZaileysAutomationError } from './errors.js'

export interface CallSocketLike {
  rejectCall(callId: string, callFrom: string): Promise<void>
}

/** Callers that should NOT be auto-rejected: a jid/number list, or a predicate. */
export type CallAllowList = string[] | ((jid: string) => boolean | Promise<boolean>)

export interface AutoRejectCallOptions {
  /** Turn auto-rejecting on. Default `false` — rejecting calls is opt-in. */
  enabled?: boolean
  /** Callers to let ring (not rejected). Array entries match the full jid or its digits. */
  allow?: CallAllowList
  /** Runs after a call was successfully rejected — e.g. reply "calls aren't supported". */
  onReject?: (call: Extract<CallPayload, { kind: 'incoming' }>) => void | Promise<void>
}

const digitsOf = (jid: string): string => (jid.split(/[:@]/)[0] ?? '').replace(/\D/g, '')

/** Auto-rejects incoming WhatsApp calls per policy. Web-only — the Cloud API has no calls. */
export class AutoRejectCallModule {
  private readonly getSocket: () => CallSocketLike | undefined
  private readonly options: AutoRejectCallOptions
  private readonly logger: Logger | undefined

  constructor(
    getSocket: () => CallSocketLike | undefined,
    options: AutoRejectCallOptions,
    logger?: Logger,
  ) {
    this.getSocket = getSocket
    this.options = options
    this.logger = logger
  }

  get enabled(): boolean {
    return this.options.enabled === true
  }

  /** Reject a call outright, ignoring policy. Throws when not connected or the socket rejects. */
  async reject(callId: string, from: string): Promise<void> {
    const socket = this.getSocket()
    if (!socket) {
      throw new ZaileysAutomationError('NOT_CONNECTED', 'cannot reject a call: client not connected')
    }
    await socket.rejectCall(callId, from)
  }

  /** Apply the auto-reject policy to an incoming call. Never throws — failures are logged. */
  async handle(call: Extract<CallPayload, { kind: 'incoming' }>): Promise<void> {
    if (!this.enabled) return
    if (await this.isAllowed(call.from)) return
    try {
      await this.reject(call.callId, call.from)
    } catch (err) {
      this.logger?.warn(err, 'autoRejectCall: rejectCall failed')
      return
    }
    try {
      await this.options.onReject?.(call)
    } catch (err) {
      this.logger?.warn(err, 'autoRejectCall: onReject hook failed')
    }
  }

  /** A failing predicate must not accidentally let calls through — treat it as "not allowed". */
  private async isAllowed(jid: string): Promise<boolean> {
    const allow = this.options.allow
    if (allow === undefined) return false
    try {
      if (Array.isArray(allow)) {
        const target = digitsOf(jid)
        return allow.some((entry) => entry === jid || digitsOf(entry) === target)
      }
      return (await allow(jid)) === true
    } catch (err) {
      this.logger?.warn(err, 'autoRejectCall: allow predicate threw')
      return false
    }
  }
}
