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

export class CommandRegistry {
  private readonly paths = new Map<string, CommandDefinition>()
  private readonly defs: CommandDefinition[] = []
  private maxDepth = 1

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

  unregister(spec: string): void {
    const segments = spec.split('|').map((segment) => parseSegment(segment))
    const canonicalKey = keyOf(segments[0] as string[])
    const def = this.paths.get(canonicalKey)
    if (def === undefined) return
    for (const parts of [def.parts, ...def.aliases.map((a) => a.split(' '))]) {
      this.paths.delete(keyOf(parts))
    }
    const idx = this.defs.indexOf(def)
    if (idx >= 0) this.defs.splice(idx, 1)
    this.maxDepth = this.defs.reduce((max, d) => Math.max(max, d.parts.length), 1)
  }

  list(): CommandDefinition[] {
    return [...this.defs]
  }
}
