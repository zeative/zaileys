import { LRUCache } from 'lru-cache'
import type { CommandBlockedReason, CommandContext, CommandGuards } from './types.js'

const COOLDOWN_MAX_ENTRIES = 10_000

export interface GuardBlock {
  reason: CommandBlockedReason
  /** Seconds left before the sender may retry. Only set for `cooldown` and `flood`. */
  retryIn?: number
}

export interface CooldownTrackerOptions {
  /** Most sender and command pairs kept; the least recently used is dropped first. Default 10 000. */
  max?: number
}

/** Last accepted run per command per sender. Each command registry owns one, so clients never share it. */
export class CooldownTracker {
  private readonly lastRun: LRUCache<string, number>
  private clock = 0

  constructor(options: CooldownTrackerOptions = {}) {
    /** The cache reads the guard's clock, so each entry expires exactly when its own cooldown ends. */
    this.lastRun = new LRUCache<string, number>({
      max: options.max ?? COOLDOWN_MAX_ENTRIES,
      ttlResolution: 0,
      perf: { now: () => this.clock },
    })
  }

  get size(): number {
    return this.lastRun.size
  }

  /** Returns the seconds left while the sender still waits; otherwise records this run and returns `null`. */
  take(command: string, sender: string, seconds: number, now: number): number | null {
    this.clock = now
    const key = `${command}\u0000${sender}`
    const waitMs = Math.ceil(seconds * 1000)
    const previous = this.lastRun.get(key)
    if (previous !== undefined && now - previous < waitMs) {
      return Math.ceil((waitMs - (now - previous)) / 1000)
    }
    this.lastRun.set(key, now, { ttl: waitMs })
    return null
  }

  clear(): void {
    this.lastRun.clear()
  }
}

export interface GuardDeps {
  /** Resolves whether the sender is an admin of the group the command ran in. */
  isAdmin: (groupJid: string, senderJid: string) => Promise<boolean>
  now: () => number
  /** Where cooldowns are kept. Defaults to one tracker shared by every call that passes none. */
  cooldowns?: CooldownTracker
}

const sharedCooldowns = new CooldownTracker()

/** Clears the shared tracker used by `checkGuards()` calls that pass no `cooldowns`. */
export const resetCooldowns = (): void => {
  sharedCooldowns.clear()
}

/**
 * Checks a command's guards. Returns the block, or `null` when the handler may run. Nothing is sent
 * to the chat here — the caller emits `command-blocked` so the wording stays the bot author's.
 */
export const checkGuards = async (
  guards: CommandGuards,
  ctx: CommandContext,
  deps: GuardDeps,
): Promise<GuardBlock | null> => {
  const needsGroup = guards.group === true || guards.admin === true
  if (needsGroup && !ctx.isGroup) return { reason: 'group-only' }
  if (guards.private === true && ctx.isGroup) return { reason: 'private-only' }

  if (guards.admin === true) {
    const room = ctx.roomId
    if (room === null) return { reason: 'admin-only' }
    if (!(await deps.isAdmin(room, ctx.senderId))) return { reason: 'admin-only' }
  }

  if (guards.cooldown !== undefined && guards.cooldown > 0) {
    const cooldowns = deps.cooldowns ?? sharedCooldowns
    const retryIn = cooldowns.take(ctx.command, ctx.senderId, guards.cooldown, deps.now())
    if (retryIn !== null) return { reason: 'cooldown', retryIn }
  }

  return null
}
