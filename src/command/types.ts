import type { WAMessageKey } from 'baileys'
import type { MessageContext } from '../events/context.js'

/** Configured command prefix: a single token or a set of accepted tokens. */
export type CommandPrefix = string | string[]

/**
 * Structured result of {@link parseCommand}. When `matched` is `false` the text
 * did not begin with any configured prefix and the remaining fields are empty
 * defaults. `name` is the lowercase-normalized first token after the prefix.
 */
export interface ParsedArgs {
  matched: boolean
  name?: string
  args: string[]
  flags: Record<string, string | boolean>
  json: unknown
  raw: string
}

/**
 * Typed context handed to every command handler and middleware. Extends the rich
 * {@link MessageContext} with parsed command fields and action methods.
 */
export interface CommandContext extends MessageContext {
  raw: string
  command: string
  args: string[]
  flags: Record<string, string | boolean>
  json: unknown
  reply(content: string): Promise<WAMessageKey>
  react(emoji: string): Promise<WAMessageKey>
  edit(content: string): Promise<void>
}

/** A command handler invoked once a parsed command resolves to a registration. */
export type CommandHandler = (ctx: CommandContext) => Promise<void> | void

/**
 * A middleware in the command chain. Call `next()` to continue to the next
 * middleware (and ultimately the handler); not calling it short-circuits.
 */
export type Middleware = (ctx: CommandContext, next: () => Promise<void>) => Promise<void> | void

/**
 * A registered command. `parts` carries sub-command tokens (e.g. `['group', 'create']`)
 * and `aliases` carries alternate names resolved to the same handler.
 */
export interface CommandDefinition {
  name: string
  aliases: string[]
  parts: string[]
  handler: CommandHandler
}
