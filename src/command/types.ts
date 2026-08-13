import type { WAMessageKey } from 'baileys'
import type { MessageContext } from '../events/context.js'
import type { TextOptions } from '../builder/builder.js'

export type CommandPrefix = string | string[]

export interface ParsedArgs {
  matched: boolean
  name?: string
  args: string[]
  flags: Record<string, string | boolean>
  json: unknown
  raw: string
}

export interface CommandContext extends MessageContext {
  raw: string
  command: string
  args: string[]
  flags: Record<string, string | boolean>
  json: unknown
  reply(content: string, opts?: TextOptions): Promise<WAMessageKey>
  react(emoji: string): Promise<WAMessageKey>
  edit(content: string): Promise<void>
}

export type CommandHandler = (ctx: CommandContext) => Promise<void> | void

export type Middleware = (ctx: CommandContext, next: () => Promise<void>) => Promise<void> | void

/** Descriptive fields a command carries so a help menu can be generated instead of hand-written. */
export interface CommandMeta {
  description?: string
  /** Argument hint shown next to the name, e.g. `<@user>`. */
  usage?: string
  /** Menu grouping. Plugins default it to the folder the file sits in. */
  category?: string
  /** Keeps the command callable but leaves it out of listings. */
  hidden?: boolean
  /** Anything else you want to hang off the command; zaileys never reads it. */
  metadata?: Record<string, unknown>
}

/** Conditions checked before a handler runs. A blocked command emits `command-blocked` instead. */
export interface CommandGuards {
  /** Only runs inside a group. */
  group?: boolean
  /** Only runs in a one-to-one chat. */
  private?: boolean
  /** Only runs for a group admin. Implies `group`. */
  admin?: boolean
  /** Seconds the same sender must wait before reusing this command. */
  cooldown?: number
}

export interface CommandSpec extends CommandMeta, CommandGuards {
  name: string
  aliases?: string[]
}

/** A command as registered, with its guards and metadata resolved. */
export interface RegisteredCommand extends CommandMeta, CommandGuards {
  name: string
  aliases: string[]
}

export type CommandBlockedReason = 'group-only' | 'private-only' | 'admin-only' | 'cooldown'

export interface CommandDefinition {
  name: string
  aliases: string[]
  parts: string[]
  handler: CommandHandler
  meta: CommandMeta & CommandGuards
}
