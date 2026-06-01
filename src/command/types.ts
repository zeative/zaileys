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

export interface CommandDefinition {
  name: string
  aliases: string[]
  parts: string[]
  handler: CommandHandler
}
