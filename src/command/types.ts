import type { WAMessageKey } from 'baileys'
import type { MessageContext } from '../events/context.js'
import type { MessageBuilder, TextOptions } from '../builder/builder.js'
import type { Client as ZaileysClient } from '../client/client.js'

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
  client: ZaileysClient
  send(to?: string): MessageBuilder<'init'>
  reply(content: string, opts?: TextOptions): Promise<WAMessageKey>
  react(emoji: string): Promise<WAMessageKey>
  edit(content: string): Promise<void>
  /** Replies `question`, then resolves with the sender's next message here. Uncaught ask errors end the command quietly. */
  ask(question: string, options?: AskOptions): Promise<MessageContext>
}

/** Options for `client.waitForMessage()`. */
export interface WaitForMessageOptions {
  /** Chat to listen in: a group JID, or the user JID of a one-to-one chat (`ctx.roomId`). */
  chat: string
  /** Only accept messages from this sender, matched with `sameUser()` against its PN and LID. Default any sender. */
  from?: string
  /** Milliseconds to wait before rejecting `ASK_TIMEOUT`. `Infinity` waits until answered or cancelled. Default 60 000. */
  timeout?: number
  /** Return `false` to skip a message and keep waiting. A throw rejects the wait with that error. Default accepts all. */
  filter?: (msg: MessageContext) => boolean
  /** Aborting rejects the wait with `ASK_CANCELLED`. Default none. */
  signal?: AbortSignal
}

/** Options for `ctx.ask()`. */
export interface AskOptions {
  /** Milliseconds to wait for the answer before rejecting `ASK_TIMEOUT`. Default 60 000. */
  timeout?: number
  /** Return `false` to ignore a message and keep waiting; it then runs as a command. Default accepts all. */
  filter?: (msg: MessageContext) => boolean
  /** Replied, quoting the command message, when the wait times out. Default none. */
  timeoutMessage?: string
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

export type CommandBlockedReason = 'group-only' | 'private-only' | 'admin-only' | 'cooldown' | 'flood'

/** Per-sender command budget, counted across every chat. A command past it emits `command-blocked` with `flood`. */
export interface CommandFloodOptions {
  /** Commands one sender may run per window. Positive integer. Default `20`. */
  maxCommands?: number
  /** Window length in milliseconds; the count starts over when it ends. Positive integer. Default `60000`. */
  windowMs?: number
  /** Text replied to the sender on their first blocked command, at most once per window. Default `false` (silent). */
  notice?: string | false
}

export interface CommandDefinition {
  name: string
  aliases: string[]
  parts: string[]
  handler: CommandHandler
  meta: CommandMeta & CommandGuards
}
