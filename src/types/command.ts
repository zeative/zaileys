import type { MessageContext } from './context'

/**
 * Supported argument types for schema validation.
 */
export type ArgType = 'string' | 'number' | 'boolean' | 'mention' | 'jid' | 'json'

/**
 * Definition of a single command argument.
 */
export interface ArgDefinition {
  type: ArgType
  required?: boolean
  description?: string
  default?: any
}

/**
 * Command execution context with typed arguments.
 */
export interface CommandContext extends MessageContext {
  args: string[]
  parsedFlags: Record<string, any>
  typedArgs: Record<string, any>
  command: string
  prefix: string
}

/**
 * Pre-execution middleware for commands.
 */
export type CommandMiddleware = (ctx: CommandContext, next: () => Promise<void>) => Promise<void>

/**
 * Full command definition.
 */
export interface CommandDefinition {
  name: string
  aliases?: string[]
  description?: string
  category?: string
  args?: Record<string, ArgDefinition>
  middleware?: CommandMiddleware[]
  execute: (ctx: CommandContext) => Promise<void>
}
