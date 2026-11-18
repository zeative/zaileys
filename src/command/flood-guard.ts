import { LRUCache } from 'lru-cache'
import { jidDecode } from '../utils/jid.js'
import { ZaileysCommandError } from './errors.js'
import type { CommandFloodOptions } from './types.js'

const DEFAULT_MAX_COMMANDS = 20
const DEFAULT_WINDOW_MS = 60_000
const FLOOD_MAX_SENDERS = 10_000

export interface FloodGuardLimits {
  /** Most senders tracked at once; the least recently seen is dropped first. Default 10 000. */
  maxSenders?: number
}

export interface FloodVerdict {
  /** Seconds until the sender's window ends and commands run again. */
  retryIn: number
  /** Text to reply now. Set on the first blocked command of a window only, so a flood gets one answer at most. */
  notice?: string
}

interface FloodWindow {
  start: number
  count: number
  noticed: boolean
}

/** Same identity as `sameUser()`: device suffixes collapse, while a LID and a phone number stay distinct. */
const senderKey = (jid: string): string => {
  const decoded = jidDecode(jid)
  return decoded?.user ? `${decoded.user}@${decoded.server}` : jid
}

const assertPositiveInteger = (name: string, value: unknown): number => {
  if (typeof value !== 'number' || !Number.isInteger(value) || value <= 0) {
    throw new ZaileysCommandError(
      'INVALID_OPTIONS',
      `commandFlood.${name} must be a positive integer, got ${String(value)}`,
    )
  }
  return value
}

const assertNotice = (value: unknown): string | undefined => {
  if (value === undefined || value === false) return undefined
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new ZaileysCommandError(
      'INVALID_OPTIONS',
      `commandFlood.notice must be a non-empty string or false, got ${String(value)}`,
    )
  }
  return value
}

/** Caps how many commands one sender may run per fixed window. Each client owns one, so bots never share counts. */
export class FloodGuard {
  readonly maxCommands: number
  readonly windowMs: number
  private readonly notice: string | undefined
  private readonly windows: LRUCache<string, FloodWindow>
  private clock = 0

  constructor(options: CommandFloodOptions = {}, limits: FloodGuardLimits = {}) {
    if (typeof options !== 'object' || options === null) {
      throw new ZaileysCommandError(
        'INVALID_OPTIONS',
        `commandFlood must be an options object or false, got ${String(options)}`,
      )
    }
    this.maxCommands = assertPositiveInteger('maxCommands', options.maxCommands ?? DEFAULT_MAX_COMMANDS)
    this.windowMs = assertPositiveInteger('windowMs', options.windowMs ?? DEFAULT_WINDOW_MS)
    this.notice = assertNotice(options.notice)
    /** The cache reads the guard's clock, so a sender's entry expires exactly when its window ends. */
    this.windows = new LRUCache<string, FloodWindow>({
      max: limits.maxSenders ?? FLOOD_MAX_SENDERS,
      ttl: this.windowMs,
      ttlResolution: 0,
      perf: { now: () => this.clock },
    })
  }

  get size(): number {
    return this.windows.size
  }

  /** Counts one command for the sender. Returns `null` while under the limit, otherwise the block to report. */
  take(sender: string, now: number): FloodVerdict | null {
    this.clock = now
    const key = senderKey(sender)
    const current = this.windows.get(key)
    if (current === undefined || now - current.start >= this.windowMs) {
      this.windows.set(key, { start: now, count: 1, noticed: false })
      return null
    }
    if (current.count < this.maxCommands) {
      current.count += 1
      return null
    }
    const retryIn = Math.max(1, Math.ceil((current.start + this.windowMs - now) / 1000))
    if (this.notice === undefined || current.noticed) return { retryIn }
    current.noticed = true
    return { retryIn, notice: this.notice }
  }

  clear(): void {
    this.windows.clear()
  }
}

/** Builds the client's guard from `commandFlood`: on by default, `false` turns it off. */
export const createFloodGuard = (options: CommandFloodOptions | false | undefined): FloodGuard | undefined =>
  options === false ? undefined : new FloodGuard(options)
