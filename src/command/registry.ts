import { ZaileysCommandError } from './errors.js'
import type { CommandDefinition, CommandHandler, ParsedArgs } from './types.js'

const parseSegment = (segment: string): string[] => {
  const parts = segment
    .trim()
    .split(/\s+/)
    .filter((token) => token.length > 0)
    .map((token) => token.toLowerCase())
  if (parts.length === 0) {
    throw new ZaileysCommandError('INVALID_COMMAND_NAME', `empty command segment in spec`)
  }
  return parts
}

const keyOf = (parts: string[]): string => parts.join(' ')

/**
 * In-memory command registry resolving alias and sub-command specs to a single
 * {@link CommandDefinition}. Specs are split on `|` into segments (canonical name
 * first, the rest aliases); each segment is split on whitespace into `parts`
 * carrying sub-command tokens. Resolution is greedy longest-match: the longest
 * registered token-path that prefixes `[name, ...args]` wins.
 */
export class CommandRegistry {
  private readonly paths = new Map<string, CommandDefinition>()
  private readonly defs: CommandDefinition[] = []
  private maxDepth = 1

  /**
   * Register a command spec. Supports a bare name (`'ping'`), pipe-separated
   * aliases (`'help|h|?'`), whitespace sub-commands (`'group create'`), and a
   * combination (`'cfg set|c set'`). Throws `INVALID_COMMAND_NAME` for empty
   * segments and `DUPLICATE_COMMAND` if any resulting token-path is already taken.
   */
  register(spec: string, handler: CommandHandler): void {
    if (spec.trim().length === 0) {
      throw new ZaileysCommandError('INVALID_COMMAND_NAME', 'command spec must not be empty')
    }

    const segments = spec.split('|').map((segment) => parseSegment(segment))
    const canonicalParts = segments[0] as string[]
    const aliases = segments.slice(1).map((parts) => keyOf(parts))

    const def: CommandDefinition = {
      name: keyOf(canonicalParts),
      aliases,
      parts: canonicalParts,
      handler,
    }

    for (const parts of segments) {
      const key = keyOf(parts)
      if (this.paths.has(key)) {
        throw new ZaileysCommandError('DUPLICATE_COMMAND', `command "${key}" is already registered`)
      }
    }

    for (const parts of segments) {
      this.paths.set(keyOf(parts), def)
      if (parts.length > this.maxDepth) this.maxDepth = parts.length
    }
    this.defs.push(def)
  }

  /**
   * Resolve a parsed command to its definition and the positional args left after
   * the matched token-path is consumed. Tries the longest token-path first
   * (`[name, ...args]`), shrinking until a registered path matches. Returns
   * `undefined` when the input did not match a prefix or no path is registered.
   */
  resolve(parsed: ParsedArgs): { def: CommandDefinition; args: string[] } | undefined {
    if (!parsed.matched || parsed.name === undefined || parsed.name.length === 0) {
      return undefined
    }

    const tokens = [parsed.name.toLowerCase(), ...parsed.args.map((arg) => arg.toLowerCase())]
    const limit = Math.min(this.maxDepth, tokens.length)

    for (let depth = limit; depth >= 1; depth -= 1) {
      const key = tokens.slice(0, depth).join(' ')
      const def = this.paths.get(key)
      if (def !== undefined) {
        return { def, args: parsed.args.slice(depth - 1) }
      }
    }

    return undefined
  }

  /** All distinct registered definitions, one per registration (aliases deduped). */
  list(): CommandDefinition[] {
    return [...this.defs]
  }
}
