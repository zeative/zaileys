import type { MessageContext } from '../events/context.js'
import { jidDecode, sameUser } from '../utils/jid.js'
import { clampTimerDelay } from '../utils/timer.js'
import { ZaileysCommandError } from './errors.js'
import type { WaitForMessageOptions } from './types.js'

/** How long `waitForMessage()` and `ctx.ask()` wait when no `timeout` is given. */
export const DEFAULT_WAIT_TIMEOUT_MS = 60_000

/** How many waits one client keeps pending before a new one rejects `ASK_LIMIT`. */
export const DEFAULT_MAX_PENDING_WAITS = 1000

export type ConversationTimer = {
  set: (cb: () => void, ms: number) => unknown
  clear: (handle: unknown) => void
}

export interface ConversationRegistryOptions {
  /** Most waits pending at once; one more rejects `ASK_LIMIT` instead of growing. Default 1000. */
  maxPending?: number
  /** Clock the timeouts are measured with. Default `Date.now()`. */
  now?: () => number
  /** Timer the timeouts are scheduled with. Default `setTimeout` and `clearTimeout`. */
  timer?: ConversationTimer
}

interface PendingWait {
  chat: string
  from: string | undefined
  filter: ((msg: MessageContext) => boolean) | undefined
  done(msg: MessageContext): void
  fail(err: unknown): void
}

const DEFAULT_TIMER: ConversationTimer = {
  set: (cb, ms) => setTimeout(cb, ms),
  clear: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
}

/** `ASK_TIMEOUT` and `ASK_CANCELLED` end a conversation; they are not failures to report. */
export const isConversationEnd = (err: unknown): boolean =>
  err instanceof ZaileysCommandError && (err.code === 'ASK_TIMEOUT' || err.code === 'ASK_CANCELLED')

const cancelled = (why: string): ZaileysCommandError =>
  new ZaileysCommandError('ASK_CANCELLED', `waitForMessage() was cancelled: ${why}`)

const isJid = (value: unknown): value is string =>
  typeof value === 'string' && value.length > 0 && Boolean(jidDecode(value)?.user)

const invalidReason = (options: WaitForMessageOptions): string | null => {
  if (!isJid(options.chat)) {
    const got = JSON.stringify(options.chat)
    return `waitForMessage() requires chat to be a JID such as 628xx@s.whatsapp.net or 1203xx@g.us, got ${got}`
  }
  if (options.from !== undefined && !isJid(options.from)) {
    const got = JSON.stringify(options.from)
    return `waitForMessage() requires from to be a user JID such as 628xx@s.whatsapp.net, got ${got}`
  }
  const { timeout } = options
  if (timeout !== undefined && (typeof timeout !== 'number' || Number.isNaN(timeout) || timeout <= 0)) {
    return `waitForMessage() requires timeout to be a positive number of milliseconds or Infinity, got ${String(timeout)}`
  }
  if (options.filter !== undefined && typeof options.filter !== 'function') {
    return 'waitForMessage() requires filter to be a function'
  }
  return null
}

/** A one-to-one chat may be named by the sender's LID while the message already resolved it to a PN. */
const inChat = (chat: string, msg: MessageContext): boolean => {
  if (msg.roomId !== null && sameUser(chat, msg.roomId)) return true
  return !msg.isGroup && !msg.isFromMe && msg.senderLid !== null && sameUser(chat, msg.senderLid)
}

/** The bot's own messages only count when the wait names the bot as `from`. */
const bySender = (from: string | undefined, msg: MessageContext): boolean => {
  if (from === undefined) return !msg.isFromMe
  return sameUser(from, msg.senderId) || (msg.senderLid !== null && sameUser(from, msg.senderLid))
}

const sameKey = (wait: PendingWait, chat: string, from: string | undefined): boolean => {
  if (!sameUser(wait.chat, chat)) return false
  if (wait.from === undefined || from === undefined) return wait.from === from
  return sameUser(wait.from, from)
}

/** Pending `waitForMessage()` calls of one client. Each client owns one, so clients never share waits. */
export class ConversationRegistry {
  private readonly pending = new Set<PendingWait>()
  /** Remembers each message's outcome, so the dispatcher and the client listener agree on it. */
  private readonly offered = new WeakMap<MessageContext, boolean>()
  private readonly maxPending: number
  private readonly now: () => number
  private readonly timer: ConversationTimer

  constructor(options: ConversationRegistryOptions = {}) {
    const max = options.maxPending ?? DEFAULT_MAX_PENDING_WAITS
    if (!Number.isInteger(max) || max <= 0) {
      throw new ZaileysCommandError('INVALID_OPTIONS', `maxPending must be a positive integer, got ${String(max)}`)
    }
    this.maxPending = max
    this.now = options.now ?? (() => Date.now())
    this.timer = options.timer ?? DEFAULT_TIMER
  }

  get size(): number {
    return this.pending.size
  }

  /** Resolves with the next message offered after this call that matches; see `WaitForMessageOptions`. */
  wait(options: WaitForMessageOptions): Promise<MessageContext> {
    return new Promise<MessageContext>((resolve, reject) => {
      const invalid = invalidReason(options)
      if (invalid !== null) {
        reject(new ZaileysCommandError('INVALID_OPTIONS', invalid))
        return
      }
      const { chat, from, filter, signal } = options
      if (signal?.aborted === true) {
        reject(cancelled('its signal was already aborted'))
        return
      }
      for (const wait of [...this.pending]) {
        if (sameKey(wait, chat, from)) wait.fail(cancelled('a newer wait for the same chat and sender replaced it'))
      }
      if (this.pending.size >= this.maxPending) {
        reject(
          new ZaileysCommandError(
            'ASK_LIMIT',
            `waitForMessage() already has ${this.maxPending} waits pending; let some finish or cancel them first`,
          ),
        )
        return
      }

      let handle: unknown
      const onAbort = (): void => wait.fail(cancelled('its signal was aborted'))
      const finish = (): boolean => {
        if (!this.pending.delete(wait)) return false
        if (handle !== undefined) this.timer.clear(handle)
        handle = undefined
        signal?.removeEventListener('abort', onAbort)
        return true
      }
      const wait: PendingWait = {
        chat,
        from,
        filter,
        done: (msg) => {
          if (finish()) resolve(msg)
        },
        fail: (err) => {
          if (finish()) reject(err)
        },
      }
      this.pending.add(wait)
      signal?.addEventListener('abort', onAbort, { once: true })

      const timeout = options.timeout ?? DEFAULT_WAIT_TIMEOUT_MS
      const deadline = this.now() + timeout
      /** Re-armed in steps, because Node fires a delay above 2^31-1 ms after 1 ms. */
      const arm = (): void => {
        handle = undefined
        const remaining = deadline - this.now()
        if (remaining <= 0) {
          wait.fail(
            new ZaileysCommandError(
              'ASK_TIMEOUT',
              `waitForMessage() got no matching message within ${timeout} ms; raise timeout or catch ASK_TIMEOUT`,
            ),
          )
          return
        }
        handle = this.timer.set(arm, clampTimerDelay(remaining))
      }
      arm()
    })
  }

  /** Hands an inbound message to the pending waits; returns whether it answered one, the same on every repeat. */
  offer(msg: MessageContext): boolean {
    const known = this.offered.get(msg)
    if (known !== undefined) return known
    const answered = this.pending.size > 0 && this.answer(msg)
    this.offered.set(msg, answered)
    return answered
  }

  /** Rejects every pending wait with `ASK_CANCELLED` and clears its timer. */
  cancelAll(why = 'the client disconnected'): void {
    for (const wait of [...this.pending]) wait.fail(cancelled(why))
  }

  private answer(msg: MessageContext): boolean {
    /** History, edits, deletes and status posts are not a reply to a question. */
    if (msg.isOld || msg.isEdited || msg.isDeleted || msg.isStory) return false
    let answered = false
    for (const wait of [...this.pending]) {
      if (!inChat(wait.chat, msg) || !bySender(wait.from, msg)) continue
      let accepted: boolean
      try {
        accepted = wait.filter === undefined || wait.filter(msg)
      } catch (err) {
        wait.fail(err)
        continue
      }
      if (!accepted) continue
      wait.done(msg)
      answered = true
    }
    return answered
  }
}
